/** Avatar size we request from GitHub's CDN, in real pixels. 2× the 160px CSS size, so it's sharp on retina screens. */
const AVATAR_PX = 320;

/** Returns the avatar URL at retina size. One function, so the preload and the <img> request the exact same URL (one download). */
export function avatarSrc(avatarUrl: string): string {
  const url = new URL(avatarUrl);
  url.searchParams.set('s', String(AVATAR_PX));
  return url.toString();
}

/**
 * Starts downloading the avatar now, before the <img> exists.
 * Why: the profile HUD mounts only after the loading screen's exit; starting the download as soon as the data
 * arrives means the image is already in the HTTP cache when the card appears.
 */
export function preloadAvatar(avatarUrl: string): void {
  const img = new Image();
  img.decoding = 'async';
  img.src = avatarSrc(avatarUrl);
}
