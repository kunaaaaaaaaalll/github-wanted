import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, effect, inject, isDevMode, viewChild } from '@angular/core';
import { gsap } from 'gsap';
import { DUR, EASE } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { CityService } from '../../services/city.service';
import { PreferencesService } from '../../services/preferences.service';
import { CITY_SEED, seededRandom } from '../../utils/seeded-random';

/**
 * The world behind every screen.
 *
 * Layer order (back to front):
 *   1. CSS fallback: sunset gradient, striped sun, skyline silhouette. Paints instantly
 *      with the HTML, so the title never waits for 3D (spec 13), and it IS the
 *      "WebGL unavailable" state (spec 10).
 *   2. The WebGL canvas: fades in over the fallback once its first frame is drawn.
 */
@Component({
  selector: 'gw-city-backdrop',
  templateUrl: './city-backdrop.component.html',
  styleUrl: './city-backdrop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' }, // What: hide the whole backdrop from assistive tech. Why: spec 13: the canvas is decoration.
})
export class CityBackdropComponent {
  private readonly stage = viewChild.required<ElementRef<HTMLCanvasElement>>('stage'); // What: the <canvas #stage>. Why: the engine needs the real element (read only after render, 3D guide wall #2).
  private readonly city = inject(CityService);
  private readonly prefs = inject(PreferencesService);
  private readonly zone = inject(NgZone);

  /** The fallback skyline as one SVG path, built from the same seed as the 3D city. */
  protected readonly skyline = buildSkylinePath();

  constructor() {
    let alive = true; // What: does this component still exist? Why: the dynamic import is async; the user could leave before it resolves.
    inject(DestroyRef).onDestroy(() => {
      alive = false;
      this.city.engine?.dispose(); // What: free the GPU. Why: without it the loop and GPU memory leak (3D guide wall #3).
      this.city.engine = undefined;
    });

    gsapScope(({ reduced, ctx }) => { // Runs after render, outside NgZone.
      const canvas = this.stage().nativeElement;
      const mode = new URLSearchParams(location.search).get('webgl'); // QA switches: ?webgl=off forces the fallback; ?webgl=force skips the software-GPU check.
      if (mode === 'off' || (mode !== 'force' && !hasHardwareWebGL())) {
        // What: keep the CSS city. Why: no WebGL at all (spec 10), or WebGL drawn by the CPU (SwiftShader/llvmpipe), which can't reach
        // the spec's 30fps floor on any device and would only burn battery while blocking the main thread.
        this.setStatus('unavailable');
        return;
      }

      // What: start the 3D only once the browser is idle (or after 1.5s at most).
      // Why: spec 13 "title and input render before the 3D scene initializes": building the city during the hero's own boot
      // was the single longest task on the page (measured in Lighthouse).
      whenIdle(() => {
        if (!alive) return;
        Promise.all([
          import('../../three/city-engine'), // What: download three.js + the engine as a lazy chunk. Why: never in the initial bundle.
          document.fonts.load('400 1em Anton').catch(() => undefined), // What: wait for Anton. Why: the GW tower sign is drawn onto a canvas with it; drawn too early, it would use a fallback font forever.
        ])
          .then(([{ CityEngine }]) => this.zone.runOutsideAngular(async () => { // Outside Angular: the loop, listeners and GSAP tweens must never trigger change detection.
            if (!alive) return; // What: user already left. Why: don't start an engine nobody will dispose.
            try {
              this.city.engine = new CityEngine(canvas, {
                reduced: this.prefs.reducedMotion(),
                onContextLost: () => this.setStatus('unavailable'),
                checkShaderErrors: isDevMode(), // What: shader error logs in development only. Why: reading them blocks the main thread (see CityEngine).
              });
            } catch {
              this.setStatus('unavailable'); // What: WebGL context creation failed. Why: the CSS fallback stays; the app fully works (spec 10).
              return;
            }
            void this.city.engine.setShot(this.city.shot, false); // What: jump to whatever shot the app already asked for. Why: on a deep link, the loading screen asked for 'tower' before the engine existed.
            await this.city.engine.start(); // What: compile shaders without blocking, then draw the first frame. Why: never fade in an empty canvas.
            if (!alive) return;
            ctx.add(() => { // What: record the fade in this component's GSAP context. Why: cleaned up with everything else on destroy.
              gsap.to(canvas, { autoAlpha: 1, duration: reduced ? DUR.fast : DUR.slow, ease: EASE.enter }); // Reduced motion: a short fade (≤ 0.2s allowed).
            });
            this.setStatus('ready');
          }))
          .catch(() => this.setStatus('unavailable')); // What: chunk failed to download (offline). Why: fallback instead of a blank sky.
      });
    });

    // What: forward live motion changes (MOTION toggle / OS setting) to the engine.
    // Why: the engine is outside Angular and can't read signals itself.
    effect(() => {
      const reduced = this.prefs.reducedMotion();
      this.zone.runOutsideAngular(() => this.city.engine?.setReduced(reduced)); // Outside: setReduced starts GSAP tweens, which must not run in the zone.
    });
  }

  /** Signal writes from outside-zone callbacks go back through zone.run (brief rule). */
  private setStatus(status: 'ready' | 'unavailable'): void {
    this.zone.run(() => this.city.status.set(status));
  }
}

/** Longest we wait for an idle moment before building the 3D city anyway (ms). */
const SCENE_IDLE_TIMEOUT_MS = 1500;

/** Runs `cb` when the main thread is idle, or after SCENE_IDLE_TIMEOUT_MS. Safari has no requestIdleCallback: fall back to the timeout. */
function whenIdle(cb: () => void): void {
  if ('requestIdleCallback' in window) requestIdleCallback(() => cb(), { timeout: SCENE_IDLE_TIMEOUT_MS });
  else setTimeout(cb, SCENE_IDLE_TIMEOUT_MS);
}

/**
 * True when WebGL exists AND runs on a real GPU.
 * What: create a throwaway context, read the driver's renderer name, then release it.
 * Why: Chrome falls back to SwiftShader (CPU rendering) on blocklisted GPUs and in headless mode; a WebGL scene there runs at
 * a few frames per second and blocks the main thread. The CSS city is the better experience on those machines.
 */
function hasHardwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // What: free the probe context now. Why: browsers cap live WebGL contexts.
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

/** Builds a stepped skyline path in a 1000×200 box: low-rise with a few towers, like the 3D bands. */
function buildSkylinePath(): string {
  const rand = seededRandom(CITY_SEED);
  const bands = [40, 70, 110, 160]; // What: heights mirroring the 3D height bands (×10). Why: fallback and 3D read as the same city.
  let x = 0;
  let d = 'M0 200';
  while (x < 1000) {
    const w = 18 + rand() * 34;
    const r = rand();
    const h = r < 0.35 ? bands[0] : r < 0.65 ? bands[1] : r < 0.87 ? bands[2] : bands[3];
    const top = 200 - h * (0.8 + rand() * 0.4);
    const centre = Math.abs(x + w / 2 - 500) < 70; // What: keep a gap in the middle. Why: same boulevard as the 3D scene, so the sun shows through.
    d += ` L${x.toFixed(1)} ${centre ? 196 : top.toFixed(1)} L${(x + w).toFixed(1)} ${centre ? 196 : top.toFixed(1)}`;
    x += w;
  }
  return d + ' L1000 200 Z';
}
