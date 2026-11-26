import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

/** 'system' = follow the OS setting; 'full' / 'reduced' = the visitor chose with the MOTION toggle. */
export type MotionPref = 'system' | 'full' | 'reduced';

const MOTION_KEY = 'gw.motion';
const SCANLINES_KEY = 'gw.scanlines';

/**
 * Visitor preferences: motion and the scanline overlay.
 * Stored in localStorage as a per-visitor convenience. Every read and write is
 * wrapped in try/catch because storage can be blocked (private mode, strict
 * settings); the app must work without it.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');

  /** What: the OS "reduce motion" setting, live. Why: users can flip it while the page is open. */
  private readonly osReduced = signal(this.media?.matches ?? false);
  private readonly motionPref = signal<MotionPref>(read<MotionPref>(MOTION_KEY, 'system'));

  /** What: true when motion should be reduced. Why: one answer for GSAP, Three.js and CSS. */
  readonly reducedMotion = computed(() => {
    const pref = this.motionPref();
    return pref === 'system' ? this.osReduced() : pref === 'reduced'; // What: explicit choice wins, else follow the OS. Why: the toggle is a deliberate act.
  });

  /** What: scanline + grain overlay on/off. Why: spec 08 says the user can turn it off. Default on. */
  readonly scanlines = signal(read<boolean>(SCANLINES_KEY, true));

  constructor() {
    // What: keep osReduced in sync with the OS. Why: matchMedia only reports the value at read time.
    this.media?.addEventListener('change', (e) => this.osReduced.set(e.matches));

    // What: mirror the decision onto <html data-motion>. Why: CSS (the motion-ok mixin) reads it, so CSS transitions obey the same toggle as GSAP.
    effect(() => {
      this.doc.documentElement.dataset['motion'] = this.reducedMotion() ? 'reduced' : 'full';
    });
  }

  /** Flips motion relative to what the visitor currently sees. */
  toggleMotion(): void {
    const next: MotionPref = this.reducedMotion() ? 'full' : 'reduced';
    this.motionPref.set(next);
    write(MOTION_KEY, next);
  }

  toggleScanlines(): void {
    this.scanlines.update((on) => !on);
    write(SCANLINES_KEY, this.scanlines());
  }
}

// What: storage helpers that never throw. Why: a blocked localStorage must not break the app.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the preference lasts for this visit only */
  }
}

// In plain English: "Remember whether this visitor wants motion and scanlines, default to their OS setting,
// and tell CSS about it with one attribute on <html>."
