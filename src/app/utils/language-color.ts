/**
 * Language dot colors, from the token palette only.
 * Why not GitHub's official language colors? They'd bring dozens of off-palette
 * colors into a strictly tokenised HUD (spec 03 "one system"). The language name
 * is always printed next to the dot, so the color is decoration, not information.
 */
const PALETTE = ['var(--gw-cyan)', 'var(--gw-pink)', 'var(--gw-orange)', 'var(--gw-gold)', 'var(--gw-muted)'] as const;

export function languageColor(language: string | null): string {
  if (!language) return 'var(--gw-muted)';
  let hash = 0;
  for (const ch of language) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0; // What: a tiny stable string hash. Why: the same language gets the same color on every card and every visit.
  return PALETTE[hash % PALETTE.length];
}
