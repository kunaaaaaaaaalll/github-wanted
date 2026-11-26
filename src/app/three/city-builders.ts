// =============================================================================
// Port Solara: procedural pieces of the city (spec 12).
// Each builder returns plain three.js objects; the engine owns and disposes them.
// No model files: everything is boxes, planes and one shader.
// =============================================================================
import * as THREE from 'three';
import type { CityPalette } from './palette';

/** Scene layout constants, in world units (1 unit ≈ 1 storey-ish). Kept here, not scattered through the code. */
export const LAYOUT = {
  cameraHeight: 3,          // What: eye level above the street. Why: low enough that towers loom, high enough to see over the first row.
  horizonFromTop: 0.62,     // What: spec 12: horizon at ~62% of screen height. Why: the title sits in the sky, above the skyline.
  fov: 50,                  // What: vertical field of view in degrees. Why: a natural "35mm-ish" lens; wider distorts the towers.
  streetHalfWidth: 4,       // What: half-width of the empty boulevard down the middle. Why: keeps a clear line to the sun behind the title.
  rowStart: -26,            // What: z of the nearest building row. Why: leaves room for foreground palms and keeps near blocks from walling off the frame.
  nearRows: 3,              // What: the first rows only get the two lowest height bands. Why: tall towers up front block the skyline and the sun.
  rowStep: 6,               // What: distance between building rows. Why: gaps let the sunset glow through.
  colStep: 5,               // What: distance between building columns.
  rows: 20,                 // What: number of rows (≈ 120 units deep). Why: far rows dissolve into fog on desktop.
  heightBands: [3, 6, 10, 16] as const,          // What: spec 12's 3–4 height bands. Why: stepped skylines read as "planned city", not noise.
  bandWeights: [0.35, 0.3, 0.22, 0.13] as const, // What: how often each band appears. Why: mostly low-rise, a few towers.
  litChance: 0.15,          // What: spec 12: ~15% of window strips lit. Why: a city at dusk, not an office at noon.
  windowRowGap: 0.9,        // What: vertical distance between window strips.
  tower: { x: -12, z: -96, width: 5, height: 24 }, // What: the single tower with the GW sign (target of the loading fly-in). Why: off-centre so it never sits behind the title.
} as const;

// -----------------------------------------------------------------------------
// Sky: a full-screen shader quad with the --gw-sunset gradient and a synthwave sun.
// -----------------------------------------------------------------------------

/** Converts "#rrggbb" to a Vector3 of raw sRGB values (0–1). */
function srgb(hex: string): THREE.Vector3 {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace); // What: parse the hex as sRGB.
  c.convertLinearToSRGB(); // What: three.js stores colors linear; convert back to raw sRGB. Why: the shader blends in sRGB, exactly like the CSS gradient, so the 3D sky matches the fallback pixel for pixel.
  return new THREE.Vector3(c.r, c.g, c.b);
}

export function buildSky(p: CityPalette): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: srgb(p.skyTop) },
      uPurple: { value: srgb(p.purple) },
      uPink: { value: srgb(p.pink) },
      uOrange: { value: srgb(p.orange) },
      uGold: { value: srgb(p.gold) },
      uHorizon: { value: 1 - LAYOUT.horizonFromTop }, // What: horizon height in screen space (0 = bottom, 1 = top). Updated every frame from the camera pitch.
      uSunX: { value: 0.5 },                          // What: sun centre x in screen space. Updated from camera yaw so the sun parallaxes like something infinitely far.
      uAspect: { value: 1 },                          // What: width / height. Why: keeps the sun round on any screen.
      uSunRadius: { value: 0.2 },                     // What: sun radius as a fraction of screen height.
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // What: write the quad straight into clip space, at the far plane.
        // Why: the sky must fill the screen whatever the camera does; no matrices needed.
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uPurple, uPink, uOrange, uGold;
      uniform float uHorizon, uSunX, uAspect, uSunRadius;
      varying vec2 vUv;

      // What: the --gw-sunset gradient: 0% top, 35% purple, 70% pink, 100% orange at the horizon.
      // Why: identical stops to the CSS token, linear between stops like CSS.
      vec3 sunset(float t) {
        vec3 c = mix(uTop, uPurple, clamp(t / 0.35, 0.0, 1.0));
        c = mix(c, uPink, clamp((t - 0.35) / 0.35, 0.0, 1.0));
        c = mix(c, uOrange, clamp((t - 0.70) / 0.30, 0.0, 1.0));
        return c;
      }

      void main() {
        float t = clamp((1.0 - vUv.y) / (1.0 - uHorizon), 0.0, 1.0); // What: 0 at the top of the screen, 1 at the horizon.
        vec3 color = sunset(t);

        // --- Synthwave sun, low on the horizon ---
        vec2 center = vec2(uSunX, uHorizon + uSunRadius * 0.45);      // What: centre just above the horizon. Why: the ground hides the bottom, so it "sets".
        vec2 d = vec2((vUv.x - center.x) * uAspect, vUv.y - center.y); // What: offset in height units. Why: aspect correction keeps it a circle.
        float dist = length(d);
        float edge = fwidth(dist);                                     // What: one pixel in distance units. Why: anti-aliased edge without MSAA.
        float disc = 1.0 - smoothstep(uSunRadius - edge, uSunRadius + edge, dist);

        float s = clamp(-d.y / uSunRadius, 0.0, 1.0);                  // What: 0 at the sun's middle, 1 at its bottom.
        float band = fract(s * 7.0);                                   // What: 7 horizontal bands across the lower half.
        float gap = mix(0.04, 0.42, s) * step(0.001, s);               // What: cut lines that thicken toward the bottom. Why: the classic synthwave "venetian blind" sun.
        float bw = fwidth(s * 7.0);
        float cut = smoothstep(gap - bw, gap + bw, band);              // What: 0 inside a cut line, 1 on the sun. Anti-aliased.

        vec3 sunColor = mix(uGold, uPink, clamp((center.y + uSunRadius - vUv.y) / (uSunRadius * 2.0), 0.0, 1.0)); // What: gold on top fading to pink. Why: spec: gold = sun highlights.
        color = mix(color, sunColor, disc * cut);

        float halo = exp(-max(dist - uSunRadius, 0.0) * 9.0) * (1.0 - disc) * 0.22; // What: a soft warm glow around the disc. Why: the sun should light the haze, not look pasted on.
        color = mix(color, uGold, halo);

        gl_FragColor = vec4(color, 1.0); // What: output raw sRGB (no colorspace chunk on purpose). Why: matches the CSS gradient exactly.
      }
    `,
    depthTest: false,  // What: ignore the depth buffer. Why: the sky is always behind everything.
    depthWrite: false, // What: don't write depth either. Why: buildings drawn later must never be hidden by the sky.
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; // What: never skip it. Why: its real position (clip space) confuses three's culling test.
  mesh.renderOrder = -1;      // What: draw first. Why: everything else paints over it.
  return mesh;
}

// -----------------------------------------------------------------------------
// Buildings + window strips: two InstancedMeshes = two draw calls for the whole city.
// -----------------------------------------------------------------------------

export interface CityBlocks {
  buildings: THREE.InstancedMesh;
  windows: THREE.InstancedMesh;
  tower: THREE.Mesh;
  sign: THREE.Mesh;
}

interface Box { x: number; z: number; w: number; d: number; h: number; }

export function buildBlocks(p: CityPalette, rand: () => number, count: number, maxX: number, signTexture: THREE.Texture): CityBlocks {
  // 1. Candidate lots on a jittered grid, minus the central boulevard.
  const lots: Box[] = [];
  for (let r = 0; r < LAYOUT.rows; r++) {
    const z = LAYOUT.rowStart - r * LAYOUT.rowStep;
    for (let x = -maxX; x <= maxX; x += LAYOUT.colStep) {
      if (Math.abs(x) < LAYOUT.streetHalfWidth + LAYOUT.colStep / 2) continue; // What: keep the boulevard empty. Why: clear view to the sun and the fly-in path.
      if (Math.abs(x - LAYOUT.tower.x) < LAYOUT.colStep && Math.abs(z - LAYOUT.tower.z) < LAYOUT.rowStep * 1.5) continue; // What: clear space around the GW tower. Why: the fly-in needs a clean approach.
      lots.push({ x, z, w: 0, d: 0, h: 0 });
    }
  }

  // 2. Shuffle (Fisher–Yates with the seeded rand) and keep `count` lots.
  for (let i = lots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [lots[i], lots[j]] = [lots[j], lots[i]];
  }
  const chosen = lots.slice(0, count);

  // 3. Size each building: footprint 2–4 units, height from a weighted band ±20%.
  for (const b of chosen) {
    b.x += (rand() - 0.5) * 1.2; // What: small jitter. Why: a perfect grid looks like a spreadsheet.
    b.z += (rand() - 0.5) * 1.6;
    b.w = 2 + rand() * 2;
    b.d = 2 + rand() * 2;
    const near = b.z > LAYOUT.rowStart - LAYOUT.rowStep * LAYOUT.nearRows;
    b.h = Math.min(pickBand(rand), near ? LAYOUT.heightBands[1] : Infinity) * (0.8 + rand() * 0.4); // What: cap near buildings at band 2. Why: depth reads front-low, back-high.
  }

  // 4. Buildings: one box geometry, many instances.
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0); // What: move the pivot to the base. Why: scaling y then grows the building upward from the street, not into the ground.
  const buildingMat = new THREE.MeshLambertMaterial({ color: p.building }); // What: cheap diffuse lighting. Why: spec 12 wants flat shading, and Lambert is the fastest lit material.
  const buildings = new THREE.InstancedMesh(box, buildingMat, chosen.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion(); // What: no rotation. Why: buildings stay square to the street.
  chosen.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    buildings.setMatrixAt(i, m); // What: one transform per instance. Why: the GPU draws all of them in one call.
  });

  // 5. Window strips on each facade facing the camera, ~15% lit.
  const neon = [p.pink, p.orange, p.cyan].map((c) => new THREE.Color(c));
  const strips: Array<{ x: number; y: number; z: number; w: number; color: THREE.Color }> = [];
  const addStrips = (b: Box, chance: number, skip?: { from: number; to: number }) => {
    for (let y = 1; y < b.h - 0.6; y += LAYOUT.windowRowGap) {
      if (skip && y > skip.from && y < skip.to) continue; // What: leave a band dark. Why: window strips crossing the GW sign made it unreadable in the loading close-up.
      if (rand() < chance) strips.push({ x: b.x, y, z: b.z + b.d / 2 + 0.02, w: b.w * 0.72, color: neon[Math.floor(rand() * neon.length)] }); // z + 0.02: sits just in front of the facade. Why: avoids z-fighting flicker.
    }
  };
  chosen.forEach((b) => addStrips(b, LAYOUT.litChance));
  const t = LAYOUT.tower;
  const towerBox: Box = { x: t.x, z: t.z, w: t.width, d: t.width, h: t.height };
  const signCentre = t.height - t.width * 0.6;     // Same placement as the sign mesh below.
  const signHalf = (t.width * 0.9 * 0.8) / 2 + 0.6; // Half the sign's height plus a margin of dark facade around it.
  // What: the dark band runs from the sign down past the loading shot's aim point (5 units below the sign, see CityEngine shots).
  // Why: the loading screen's centred GW mark lands there; a lit strip behind it read like a strikethrough.
  addStrips(towerBox, LAYOUT.litChance * 2, { from: signCentre - 7, to: signCentre + signHalf }); // The tower is a little brighter otherwise: it's the landmark the loading shot flies to.

  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // What: unlit (self-lit) material, white base. Why: per-instance colors multiply white, giving pure neon; lights don't dim them.
  const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.14), windowMat, strips.length);
  strips.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.w, 1, 1));
    windows.setMatrixAt(i, m);
    windows.setColorAt(i, s.color); // What: per-instance color. Why: pink/orange/cyan windows in one draw call.
  });

  // 6. The GW tower and its sign (original mark, spec 12).
  const tower = new THREE.Mesh(box, buildingMat);
  tower.position.set(t.x, 0, t.z);
  tower.scale.set(t.width, t.height, t.width);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(t.width * 0.9, t.width * 0.9 * 0.8),
    new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false }), // transparent: the sign's corners are see-through.
  );
  sign.position.set(t.x, t.height - t.width * 0.6, t.z + t.width / 2 + 0.05);

  return { buildings, windows, tower, sign };
}

function pickBand(rand: () => number): number {
  let r = rand();
  for (let i = 0; i < LAYOUT.heightBands.length; i++) {
    r -= LAYOUT.bandWeights[i];
    if (r <= 0) return LAYOUT.heightBands[i];
  }
  return LAYOUT.heightBands[0];
}

/** Draws the GW sign onto a canvas: cyan hexagon, gold star, "GW" in Anton. Same mark as the brand badge. */
export function drawSignTexture(p: CityPalette): THREE.CanvasTexture {
  const W = 512, H = 410;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const cx = W / 2, cy = H / 2 + 14, r = 170;
  ctx.shadowColor = p.cyan;
  ctx.shadowBlur = 24; // What: canvas glow. Why: neon tubes bleed light; the texture fakes it without a bloom pass.
  ctx.lineWidth = 14;
  ctx.strokeStyle = p.cyan;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i; // flat-top hexagon
    const x = cx + r * Math.cos(a), y = cy + r * 0.82 * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowColor = p.pink;
  ctx.fillStyle = p.pink;
  ctx.font = '400 168px Anton, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GW', cx, cy + 10);
  ctx.shadowColor = p.gold;
  ctx.fillStyle = p.gold;
  drawStar(ctx, cx, cy - r * 0.82, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // What: tag the pixels as sRGB. Why: otherwise three treats them as linear and the sign renders washed out.
  return texture;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45; // What: alternate outer and inner points. Why: that's what makes 5 spikes.
    const a = -Math.PI / 2 + (Math.PI / 5) * i;
    const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// -----------------------------------------------------------------------------
// Palms: flat silhouettes (planes with a shape), foreground only (spec 12).
// -----------------------------------------------------------------------------

export function buildPalmGeometry(): THREE.ShapeGeometry {
  const crown = new THREE.Vector2(0.7, 8); // What: where the fronds sprout. Why: the trunk leans, so the crown is offset from the base.
  const trunk = new THREE.Shape();
  trunk.moveTo(-0.22, 0);
  trunk.quadraticCurveTo(0.05, 4, crown.x - 0.09, crown.y); // What: left edge, a gentle lean. Why: straight trunks look like poles.
  trunk.lineTo(crown.x + 0.09, crown.y);
  trunk.quadraticCurveTo(0.45, 4, 0.22, 0);
  trunk.closePath();

  const shapes: THREE.Shape[] = [trunk];
  const fronds = [ // [angle in degrees, length, droop]
    [168, 3.4, 1.6], [140, 3.0, 0.9], [110, 2.4, 0.2], [80, 2.2, 0.1],
    [48, 2.9, 0.8], [18, 3.4, 1.5], [-8, 3.0, 2.0], [192, 2.8, 2.0],
  ] as const;
  for (const [deg, len, droop] of fronds) {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const perp = new THREE.Vector2(-dir.y, dir.x);
    const tip = crown.clone().addScaledVector(dir, len).add(new THREE.Vector2(0, -droop)); // What: frond tip, pulled down. Why: palm leaves arc and hang.
    const mid = crown.clone().addScaledVector(dir, len * 0.55);
    const leaf = new THREE.Shape();
    leaf.moveTo(crown.x, crown.y);
    leaf.quadraticCurveTo(mid.x + perp.x * 0.45, mid.y + perp.y * 0.45 + 0.3, tip.x, tip.y); // What: upper edge bulges out. Why: gives the leaf width.
    leaf.quadraticCurveTo(mid.x - perp.x * 0.1, mid.y - perp.y * 0.1, crown.x, crown.y);     // What: lower edge hugs the spine. Why: a tapered blade, not a balloon.
    shapes.push(leaf);
  }
  return new THREE.ShapeGeometry(shapes, 6); // What: one geometry for trunk + all fronds. Why: one draw call per palm group.
}

// In plain English: "A shader sky with a striped sun, a city of instanced boxes with a few neon windows,
// one tower with our GW sign, and flat palm cut-outs at the edges."
