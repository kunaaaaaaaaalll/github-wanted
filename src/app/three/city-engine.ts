// =============================================================================
// CityEngine: owns the WebGL renderer, the Port Solara scene and the ONE render
// loop. Plain TypeScript, no Angular: the 3D guide's rule "Angular hosts it, it
// doesn't drive it". It is created from a dynamic import, so three.js lands in a
// lazy chunk, and always outside NgZone, so 60 frames a second never trigger
// change detection.
// =============================================================================
import * as THREE from 'three';
import { gsap } from 'gsap';
import { DUR, EASE, FX, TIMING } from '../animation/motion-tokens';
import { CITY_SEED, seededRandom } from '../utils/seeded-random';
import { LAYOUT, buildBlocks, buildPalmGeometry, buildSky, drawSignTexture } from './city-builders';
import { readPalette } from './palette';

/** Named camera positions. 'hero' = street level looking at the sunset; 'tower' = up close to the GW sign (loading fly-in, spec 12). */
export type CityShot = 'hero' | 'tower';

/** Everything that defines a shot. GSAP tweens these numbers; the render loop applies them. */
interface Rig { x: number; y: number; z: number; yaw: number; pitch: number; fov: number; }

export interface CityEngineOptions {
  /** Start with motion reduced (no drift, no parallax, render on demand). */
  reduced: boolean;
  /** Called once if the GPU drops the WebGL context. The host shows the CSS fallback. */
  onContextLost: () => void;
  /** Check shaders for compile errors. True in development only (see constructor). */
  checkShaderErrors: boolean;
}

export class CityEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sky: ReturnType<typeof buildSky>;
  private readonly palms: THREE.InstancedMesh;
  private readonly mobile: boolean;
  private readonly basePitch: number; // What: upward tilt that puts the horizon at 62% (spec 12). Computed from the lens.

  private readonly shots: Record<CityShot, Rig>;
  private readonly rig: Rig;                       // What: the current camera shot. Why: setShot() tweens it; drift and parallax are added on top every frame.
  private readonly drift = { x: 0, y: 0 };        // What: idle drift offset (world units), tweened by GSAP. Why: GSAP changes numbers; the loop reads them.
  private readonly parallax = { yaw: 0, pitch: 0 }; // What: pointer parallax (radians), ≤ 2°.
  private driftTweens: gsap.core.Tween[] = [];
  private parallaxTo?: { yaw: gsap.QuickToFunc; pitch: gsap.QuickToFunc };

  private reduced: boolean;
  private running = false;  // What: is the animation loop on? Why: start/stop must be idempotent.
  private active = true;    // What: has the app asked us to render? (e.g. paused behind a full-screen error)
  private disposed = false;
  private started = false;  // What: has start() finished compiling? Why: nothing may render (and force a sync compile) before that.

  constructor(private readonly canvas: HTMLCanvasElement, private readonly opts: CityEngineOptions) {
    this.reduced = opts.reduced;
    this.mobile = window.matchMedia('(max-width: 599px), (pointer: coarse)').matches; // What: phone-class device. Why: spec 12/13: 40 buildings, no fog, pixel ratio 1.5.

    // --- Renderer -------------------------------------------------------------
    // What: the WebGL renderer drawing into our canvas. Throws if WebGL is unavailable; the host catches that and keeps the CSS fallback.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile,                                     // What: MSAA on desktop only. Why: on phones it costs more than it shows at 1.5× pixel ratio.
      // What: let the browser pick the GPU. Why: 'high-performance' makes dual-GPU laptops wake the discrete GPU, measured at ~1.3s
      // of blocked main thread on context creation; this scene (≈10 draw calls) runs at 60fps on integrated graphics anyway.
      powerPreference: 'default',
      alpha: false,                                                // What: opaque canvas. Why: the sky covers every pixel; opacity costs compositing time.
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2)); // What: cap resolution (brief: 2 desktop / 1.5 mobile). Why: 3× retina phones would render 4× the pixels for no visible gain.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // What: convert the linear lighting result to screen sRGB. Why: without it everything renders too dark.
    // What: skip reading shader compile logs in production.
    // Why: reading them forces the main thread to WAIT for the GPU to finish compiling (a sync point). Three's docs recommend
    // turning it off in production; in development we keep it so shader typos show up in the console.
    this.renderer.debug.checkShaderErrors = opts.checkShaderErrors;

    // --- Camera ---------------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(LAYOUT.fov, 1, 0.5, 400); // near 0.5 / far 400: covers palms (≈10) to the last fogged row (≈130) with good depth precision.
    this.camera.rotation.order = 'YXZ'; // What: yaw first, then pitch. Why: like a person turning their head; no accidental roll when both change.
    const ndcHorizon = 1 - 2 * LAYOUT.horizonFromTop; // What: 62% from the top in clip space (−0.24). Why: the math below works in −1..1.
    this.basePitch = Math.atan(-ndcHorizon * Math.tan(THREE.MathUtils.degToRad(LAYOUT.fov / 2))); // What: pitch up just enough to push the horizon below centre. Why: spec 12's composition, exact on every screen.
    this.camera.position.set(0, LAYOUT.cameraHeight, 0);

    // --- Shots ------------------------------------------------------------------
    const t = LAYOUT.tower;
    const sign = new THREE.Vector3(t.x, t.height - t.width * 0.6, t.z + t.width / 2); // What: the GW sign's centre (matches buildBlocks). Why: the fly-in frames it.
    const towerCam = sign.clone().add(new THREE.Vector3(6, -7, 21));                 // What: end position, in front of and below the sign, from the boulevard side. Why: a clear flight path down the empty street (no buildings to pass through).
    const aim = sign.clone().add(new THREE.Vector3(0, -5, 0));                       // What: look a little below the sign. Why: puts the sign in the upper third, so it doesn't sit behind the loading screen's centred GW mark.
    const dir = aim.clone().sub(towerCam);
    this.shots = {
      hero: { x: 0, y: LAYOUT.cameraHeight, z: 0, yaw: 0, pitch: this.basePitch, fov: LAYOUT.fov },
      tower: {
        x: towerCam.x, y: towerCam.y, z: towerCam.z, // Explicit, not a spread: a Vector3 spread would carry extra fields into GSAP.
        yaw: Math.atan2(-dir.x, -dir.z),                    // What: turn toward the sign. Why: the camera looks down −z; atan2 gives the left/right angle.
        pitch: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), // What: tilt up toward it.
        fov: 40,                                            // What: a longer lens at the end. Why: narrowing while flying in feels like a push-in, the classic "zoom into the city" shot.
      },
    };
    this.rig = { ...this.shots.hero };

    // --- Scene ----------------------------------------------------------------
    const palette = readPalette();
    const rand = seededRandom(CITY_SEED);
    if (!this.mobile) this.scene.fog = new THREE.FogExp2(palette.fog, 0.012); // What: exponential pink-purple haze, desktop only (spec 12). Why: depth and calm; 0.012 ≈ 75% fogged at 100 units.

    this.sky = buildSky(palette);
    this.scene.add(this.sky);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: palette.ground }),
    );
    ground.rotation.x = -Math.PI / 2; // What: lay the plane flat. Why: PlaneGeometry is created standing up (facing +z).
    this.scene.add(ground);

    // What: spec 12 lighting: 1 ambient + 1 directional sunset light, no shadows.
    this.scene.add(new THREE.AmbientLight(palette.purple, 1.4)); // Why: lifts the shadow sides to night-purple instead of black.
    const sun = new THREE.DirectionalLight(palette.orange, 2.2);
    sun.position.set(-40, 18, -120); // What: low, behind the city, a little left. Why: rims the left walls orange, like the last light of the day.
    this.scene.add(sun);

    const blocks = buildBlocks(palette, rand, this.mobile ? 40 : 120, this.mobile ? 26 : 56, drawSignTexture(palette)); // Spec 12: ~120 buildings desktop, ~40 mobile.
    this.scene.add(blocks.buildings, blocks.windows, blocks.tower, blocks.sign);

    const palmMat = new THREE.MeshBasicMaterial({ color: palette.night, side: THREE.DoubleSide, fog: false }); // DoubleSide: mirrored palms show their back face. fog:false: foreground silhouettes stay crisp.
    this.palms = new THREE.InstancedMesh(buildPalmGeometry(), palmMat, 4);
    this.scene.add(this.palms);

    // --- Events (registered outside NgZone because the engine is created there) ---
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.onResize(); // What: size everything once now. Why: the camera aspect and palm layout depend on the screen.
    // NOTE: no render here. The first render would compile every shader synchronously, freezing the page.
    // The host calls start(), which compiles them asynchronously first.
  }

  /**
   * Compiles all shaders without blocking (compileAsync), then draws the first frame and starts motion.
   * Resolves when the first frame is on screen, so the host can fade the canvas in.
   */
  async start(): Promise<void> {
    // What: ask the GPU driver to compile in the background (KHR_parallel_shader_compile where available).
    // Why: a synchronous compile of every material is the single biggest stall in a WebGL page load.
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    this.started = true;
    this.applyMotion(); // Starts the loop, or draws one still frame when motion is reduced.
    this.frame();       // What: guarantee a first frame now. Why: the fade-in must never reveal an empty canvas.
  }

  // ---------------------------------------------------------------------------
  // Public API (used by the Angular host and, in Milestone 4, the loading shot)
  // ---------------------------------------------------------------------------

  /** Live-switch reduced motion (the MOTION toggle or the OS setting changed). */
  setReduced(reduced: boolean): void {
    if (reduced === this.reduced || this.disposed) return;
    this.reduced = reduced;
    this.applyMotion();
  }

  /** Pause/resume rendering, e.g. while a full-screen panel hides the city. */
  setActive(active: boolean): void {
    this.active = active;
    this.syncLoop();
  }

  /**
   * Moves the camera to a named shot.
   * animate=true: GSAP flies there (DUR.cinematic, EASE.camera); resolves when it lands.
   * animate=false, or reduced motion: jumps there instantly (spec 08: no camera moves when reduced).
   */
  setShot(shot: CityShot, animate: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const target = this.shots[shot];
    gsap.killTweensOf(this.rig); // What: cancel any flight in progress. Why: two tweens fighting over the camera make it stutter.
    if (!animate || this.reduced) {
      Object.assign(this.rig, target);
      if (!this.running) this.frame(); // What: repaint now. Why: with the loop off, nothing else would show the new shot.
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // What: tween all six rig numbers together. Why: position, aim and lens moving as one reads as a single camera move.
      gsap.to(this.rig, { ...target, duration: DUR.cinematic, ease: EASE.camera, onComplete: resolve, onInterrupt: resolve });
    });
  }

  /** Renders a single frame. Used when the loop is off (reduced motion) and something changed. */
  renderOnce(): void {
    if (!this.disposed) this.frame();
  }

  /** Frees the GPU: stop the loop, remove listeners, dispose every geometry, material and texture. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null); // What: stop the loop. Why: a loop on a disposed renderer throws every frame.
    this.stopMotion();
    gsap.killTweensOf(this.rig); // What: stop any camera flight. Why: the GSAP guide: kill camera tweens before the scene is disposed.
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose(); // What: free vertex buffers on the GPU. Why: JS garbage collection never frees GPU memory.
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshBasicMaterial).map?.dispose(); // What: free textures (the GW sign). Why: same reason, textures live on the GPU.
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // What: release the WebGL context now. Why: browsers cap live contexts (~16); don't wait for GC.
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  /** The ONE render loop body. GSAP only changes numbers (drift, parallax); this applies them and draws. */
  private frame = (): void => {
    if (!this.started) return; // What: never render before start() compiled the shaders. Why: an early render compiles synchronously and freezes the page.
    const cam = this.camera;
    const r = this.rig;
    cam.position.set(r.x + this.drift.x, r.y + this.drift.y, r.z); // What: shot + idle drift.
    cam.rotation.x = r.pitch + this.parallax.pitch;                 // What: shot + pointer parallax.
    cam.rotation.y = r.yaw + this.parallax.yaw;
    if (cam.fov !== r.fov) {
      cam.fov = r.fov;
      cam.updateProjectionMatrix(); // What: rebuild the lens only when the fov actually changed. Why: three ignores fov changes until this call, and it's not free.
    }

    // What: keep the shader's horizon and sun glued to the 3D horizon as the camera moves.
    // Why: the sky is drawn in screen space; without this the sun would slide against the skyline.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const u = this.sky.material.uniforms;
    u['uHorizon'].value = 0.5 - (0.5 * Math.tan(cam.rotation.x)) / tanHalf;
    u['uSunX'].value = 0.5 - (0.5 * Math.tan(cam.rotation.y)) / (tanHalf * cam.aspect);

    this.renderer.render(this.scene, cam);
  };

  /** Starts or stops the loop to match: motion allowed, tab visible, app wants us active. */
  private syncLoop(): void {
    const shouldRun = !this.disposed && !this.reduced && this.active && document.visibilityState === 'visible';
    if (shouldRun === this.running) return;
    this.running = shouldRun;
    // What: setAnimationLoop is three's requestAnimationFrame wrapper. Why: the 3D guide's single loop; passing null stops it completely (0% GPU when hidden).
    this.renderer.setAnimationLoop(shouldRun ? this.frame : null);
    if (!shouldRun && !this.disposed) this.frame(); // What: draw one settled frame when stopping. Why: reduced motion still shows the city, just still.
  }

  // ---------------------------------------------------------------------------
  // Motion: drift (GSAP) + parallax (GSAP quickTo), both off when reduced
  // ---------------------------------------------------------------------------

  private applyMotion(): void {
    this.stopMotion();
    if (!this.reduced) {
      // What: two sine loops with different periods (16s and 13s, inside spec 12's 12–20s). Why: different periods never line up, so the drift never looks like a loop.
      const half = (TIMING.cameraDrift.min + TIMING.cameraDrift.max) / 4; // 8s each way → 16s loop
      this.driftTweens = [
        gsap.fromTo(this.drift, { x: -0.6 }, { x: 0.6, duration: half, ease: EASE.idle, repeat: -1, yoyo: true }),
        gsap.fromTo(this.drift, { y: -0.2 }, { y: 0.2, duration: TIMING.cameraDrift.min * 0.55, ease: EASE.idle, repeat: -1, yoyo: true }),
      ];
      if (!this.mobile) {
        // What: one reusable tween per axis (the GSAP guide's quickTo advice). Why: creating a tween on every mousemove would pile up hundreds.
        this.parallaxTo = {
          yaw: gsap.quickTo(this.parallax, 'yaw', { duration: DUR.slow, ease: EASE.enter }),
          pitch: gsap.quickTo(this.parallax, 'pitch', { duration: DUR.slow, ease: EASE.enter }),
        };
        window.addEventListener('pointermove', this.onPointer, { passive: true }); // passive: we never call preventDefault, so scrolling stays smooth.
      }
    }
    this.syncLoop();
  }

  private stopMotion(): void {
    this.driftTweens.forEach((t) => t.kill());
    this.driftTweens = [];
    gsap.killTweensOf(this.parallax); // What: stop any parallax easing in flight. Why: the 3D guide: kill camera tweens before disposing / when switching modes.
    this.parallaxTo = undefined;
    window.removeEventListener('pointermove', this.onPointer);
    this.drift.x = this.drift.y = 0;
    this.parallax.yaw = this.parallax.pitch = 0;
  }

  private onPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || !this.parallaxTo) return; // What: mouse only. Why: spec 08: parallax effects are off for touch.
    const max = THREE.MathUtils.degToRad(FX.parallax.cameraDeg); // What: ≤ 2° (spec 08 hard limit).
    const nx = (e.clientX / window.innerWidth) * 2 - 1;  // −1 (left) … 1 (right)
    const ny = (e.clientY / window.innerHeight) * 2 - 1; // −1 (top) … 1 (bottom)
    this.parallaxTo.yaw(-nx * max);   // What: look slightly toward the cursor. Why: the city feels like a space you're standing in.
    this.parallaxTo.pitch(-ny * max * 0.5); // What: half strength vertically. Why: vertical tilt moves the horizon, which is more noticeable.
  };

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private onResize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); // false: don't write inline CSS sizes. Why: CSS (inset: 0) owns the canvas's on-screen size.
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix(); // What: rebuild the lens. Why: three only applies aspect/fov changes after this call.
    const u = this.sky.material.uniforms;
    u['uAspect'].value = this.camera.aspect;
    u['uSunRadius'].value = Math.min(0.2, 0.3 * this.camera.aspect); // What: shrink the sun on tall phones. Why: 20% of a portrait screen's height would be wider than the screen.
    this.layoutPalms();
    if (!this.running) this.frame(); // What: repaint now if the loop is off. Why: otherwise the canvas stays stretched until something moves.
  };

  /** Places palms just inside the left/right screen edges, so they frame the view but never reach the centre (the input). */
  private layoutPalms(): void {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(LAYOUT.fov / 2));
    const spots = [ // [side, distance from camera, scale]
      [-1, 10, 1], [-1, 16, 1.25], [1, 11, 0.95], [1, 18, 1.3],
    ] as const;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([side, dist, scale], i) => {
      const halfWidth = tanHalf * this.camera.aspect * dist; // What: half the visible width at that depth. Why: anchors palms to the screen edge on any aspect ratio.
      const s = scale * (this.mobile ? 0.7 : 1);
      const x = side * (halfWidth + 0.4 * s); // What: trunk just outside the frame. Why: only the crown leans in, like a framing shot.
      m.compose(new THREE.Vector3(x, 0, -dist), q, new THREE.Vector3(-side * s, s, s)); // What: mirror by side (negative x scale). Why: both crowns lean toward the centre.
      this.palms.setMatrixAt(i, m);
    });
    this.palms.instanceMatrix.needsUpdate = true; // What: re-upload the matrices. Why: three only sends instance data to the GPU when flagged.
  }

  private onVisibility = (): void => this.syncLoop(); // What: stop rendering in background tabs (spec 13). Why: saves battery; rAF is throttled there anyway.

  private onContextLost = (e: Event): void => {
    e.preventDefault(); // What: tells the browser we handle it. Why: required by the WebGL spec to allow a later restore.
    this.renderer.setAnimationLoop(null);
    this.running = false;
    this.opts.onContextLost();
  };
}

// In plain English: "Build the sunset city once, run one loop that only draws, let GSAP nudge the camera,
// stop when nobody's looking, and clean the GPU completely on exit."
