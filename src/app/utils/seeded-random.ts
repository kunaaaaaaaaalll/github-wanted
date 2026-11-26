/**
 * Mulberry32: a tiny, fast pseudo-random generator with a seed.
 * What: returns a function that yields numbers in [0, 1), the same sequence for the same seed.
 * Why: Math.random() would build a different city on every visit. A seed makes
 * Port Solara a real place: same skyline every time, and the CSS fallback skyline
 * stays stable between renders.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0; // What: force an unsigned 32-bit integer. Why: the bit math below assumes it.
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; // What: advance the state by a large odd constant. Why: visits every 32-bit value before repeating.
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); // What: scramble the bits (multiply + xor-shift). Why: neighbouring states give unrelated outputs.
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // What: map the 32-bit result to [0, 1). Why: same contract as Math.random().
  };
}

/** The city's seed. Change it and Port Solara gets a new skyline. */
export const CITY_SEED = 0x50_52_54; // "PRT" in hex: Port Solara.

// In plain English: "A dice roller that always rolls the same numbers for the same seed, so the city never changes."
