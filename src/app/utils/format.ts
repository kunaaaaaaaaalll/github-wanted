/**
 * Number formatting rules from spec 10 ("Huge numbers").
 *
 * formatCount: abbreviate at 10,000+ → "12.4K", "1.2M". Used everywhere EXCEPT the cash counter.
 * formatExact: full number with thousands separators → "1,204,331". Used by the cash counter.
 */
const exact = new Intl.NumberFormat('en-US'); // What: one shared formatter. Why: creating Intl objects per call is slow; en-US fixes "," as the separator so the HUD looks the same everywhere.

export function formatExact(n: number): string {
  return exact.format(n);
}

export function formatCount(n: number): string {
  if (n < 10_000) return exact.format(n); // What: below 10K show the real number ("9,999"). Why: spec threshold; small numbers are short already.
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (n >= size) {
      // What: round DOWN to one decimal. Why: never overstate someone's numbers (12,480 → "12.4K", not "12.5K").
      const value = Math.floor((n / size) * 10) / 10;
      return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}${suffix}`; // "12K", not "12.0K".
    }
  }
  return exact.format(n);
}

// In plain English: "Big numbers get a K/M/B suffix (rounded down); the cash counter always shows every digit."
