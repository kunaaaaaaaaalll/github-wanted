// =============================================================================
// Motion tokens: docs/design-motion-spec.pdf, sections 07 and 08.
// Every GSAP duration, ease, stagger and effect limit in the app comes from
// this file. If you need a value that isn't here, the answer is "use a token",
// not "add a number in the component".
// =============================================================================

// --- Section 07: exactly as the spec defines ---------------------------------

/** Durations in seconds (GSAP's unit). */
export const DUR = { instant: 0.1, fast: 0.2, base: 0.35, slow: 0.6, cinematic: 1.2, count: 1.6 } as const; // What: every allowed duration. Why: one place to tune the whole app's speed.

/** GSAP ease strings. */
export const EASE = { enter: 'power3.out', reveal: 'expo.out', exit: 'power2.in', impact: 'back.out(1.7)', camera: 'power3.inOut', idle: 'sine.inOut', glitch: 'steps(1)' } as const; // What: every allowed curve. Why: no random eases sneaking in.

/** Gaps between items in a sequence, in seconds. */
export const STAGGER = { letters: 0.035, list: 0.08, stars: 0.12 } as const; // What: gaps between items in a sequence. Why: consistent rhythm everywhere.

// In plain English: "These are the only speeds, curves and rhythms the app is allowed to use."

// --- Section 07: choreography principles, as numbers -------------------------

/** "Enter slower than exit: exits use ~70% of the enter duration." */
export const EXIT_RATIO = 0.7; // What: multiplier for exit durations. Why: leaving fast and arriving slower feels responsive.

/** Returns the exit duration for a given enter duration, e.g. exit(DUR.base). */
export const exit = (enterDuration: number): number => enterDuration * EXIT_RATIO; // What: a helper. Why: nobody hand-computes 0.245 in a component.

/** "Distance is small: entrances travel 16–40px." */
export const DISTANCE = { min: 16, max: 40 } as const; // What: allowed entrance travel in px. Why: big distances feel cheap and slow.

// --- Section 08: game-feel effect HARD LIMITS --------------------------------
// These are ceilings, not suggestions. Components read them so a limit can't
// be exceeded by accident.

export const FX = {
  glitch: { total: 0.3, jitterX: 6, skew: 10 },  // What: glitch ≤ 0.3s, x jitter ≤ 6px, skew ≤ 10°. Why: digital "broken TV" feel without nausea.
  flash: { peakOpacity: 0.6, maxPerSecond: 3 },  // What: one flash per event, peak ≤ 0.6, never > 3/s. Why: WCAG 2.3.1 seizure safety.
  shake: { desktop: 6, mobile: 4, duration: 0.3 }, // What: wanted level 5 only; px amplitude, decays to 0. Why: impact without motion sickness.
  tilt: { maxDeg: 8, perspective: 900 },          // What: character card tilt ≤ 8°, viewed from 900px away. Why: depth, not a spinning card; a far viewpoint keeps the distortion subtle.
  parallax: { cameraDeg: 2, domPx: 12 },          // What: camera offset ≤ 2°, DOM layers ≤ 12px. Why: subtle depth, never disorienting.
  pulse: { period: 2, opacityMin: 0.4, opacityMax: 0.8 }, // What: glow pulse for input idle + LIVE tag. Why: "alive" without blinking.
  grainFps: 12,                                   // What: film grain refreshes ≤ 12fps (or static). Why: cheap, and calm.
  ping: { scale: 3 },                             // What: the minimap "you are here" ring grows to 3× the dot, then fades. Why: visible at 140px, still small.
  slam: { scale: 1.35, tracking: '0.5em' },       // What: "Mission passed" start state (GSAP guide 5.8): big and wide-spaced. Why: letters "snap together" into the toast.
} as const;

// --- Section 07: profile reveal timeline (desktop chart), start times in seconds ---
// What: when each part of the profile starts its entrance, measured from the HUD mounting.
// Why one table: the choreography lives in one place; components read their slot instead of inventing delays.
export const REVEAL = {
  panels: 0,   // HUD panels fade/slide in (reading order, STAGGER.list apart)
  card: 0.2,   // Character card contents + tilt on
  stars: 0.5,  // Wanted stars drop (STAGGER.stars apart). Hero moment, part 1.
  cash: 0.6,   // Cash count-up (DUR.count)
  stats: 0.7,  // Stats strip cells
  toast: 1.0,  // "Mission passed". Hero moment, part 2.
} as const;

// --- Sections 06 + 09: timing rules for specific components ------------------

export const TIMING = {
  tickerSpeed: 40,      // What: news ticker scroll speed in px/s. Why: spec 06; readable at a glance.
  tickerEase: 'none',   // What: GSAP's linear ease. Why: "40px/s" is a constant speed; any curve would make the ticker surge and stall at each loop.
  toastHold: 1.6,       // What: "Mission passed" auto-hides after 1.6s. Why: celebrate, then get out of the way.
  tipInterval: 2.5,     // What: one loading tip per 2.5s. Why: spec 09.2; long enough to read a line.
  loadingMin: 1.2,      // What: loading screen minimum. Why: fast data shouldn't skip the intro.
  stillSearching: 6,    // What: after 6s, show "Still searching...". Why: tell slow-network users we're alive.
  cameraDrift: { min: 12, max: 20 }, // What: idle camera sine loop length in seconds. Why: spec 12; slow enough to feel like breathing.
} as const;

// In plain English: "Section 08's limits and the spec's fixed timings, written down once so no component can exceed them."
