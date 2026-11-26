/**
 * Reads the design tokens from CSS so the 3D city uses the exact same colors as the UI.
 * Why not hard-code hex values here? "One system": if a token changes in
 * _tokens.scss, the city follows automatically.
 */
export interface CityPalette {
  night: string;
  pink: string;
  orange: string;
  gold: string;
  cyan: string;
  purple: string;
  skyTop: string;
  building: string;
  ground: string;
  fog: string;
}

export function readPalette(): CityPalette {
  const css = getComputedStyle(document.documentElement); // What: resolved values of :root custom properties. Why: tokens live in CSS.
  const v = (name: string) => css.getPropertyValue(name).trim(); // What: "#ff2e88" with whitespace removed. Why: getPropertyValue keeps leading spaces, which THREE.Color rejects.
  return {
    night: v('--gw-night'),
    pink: v('--gw-pink'),
    orange: v('--gw-orange'),
    gold: v('--gw-gold'),
    cyan: v('--gw-cyan'),
    purple: v('--gw-purple'),
    skyTop: v('--gw-sky-top'),
    building: v('--gw-3d-building'),
    ground: v('--gw-3d-ground'),
    fog: v('--gw-3d-fog'),
  };
}

// In plain English: "Ask CSS for the token colors so the 3D world and the HUD are painted from one palette."
