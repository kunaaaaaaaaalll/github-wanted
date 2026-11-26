// =============================================================================
// gsapScope: the ONE way to animate in this app (GSAP guide, part 03).
//
// It solves three Angular + GSAP problems at once:
//   1. Timing:  ngOnInit runs before the DOM exists → selectors find nothing.
//   2. Leaks:   after navigating away, tweens/ScrollTriggers keep running on
//               dead elements unless something kills them.
//   3. Perf:    GSAP ticks 60×/s via requestAnimationFrame; inside NgZone each
//               tick can trigger change detection for the whole app.
// =============================================================================
import { DestroyRef, ElementRef, NgZone, afterNextRender, inject } from '@angular/core';
import { gsap } from 'gsap';
import { PreferencesService } from '../services/preferences.service';

export interface GsapScope {
  /** This component's root element. Selector strings are scoped to it. */
  host: HTMLElement;
  /** True when the OS asks for reduced motion. Skip motion; CSS already shows the final state. */
  reduced: boolean;
  /** The GSAP context recording everything. Use ctx.add() for work created later (e.g. after fonts load). */
  ctx: gsap.Context;
}

/**
 * Call in a component's constructor (it uses inject()).
 *
 * @example
 * constructor() {
 *   gsapScope(({ reduced }) => {
 *     if (reduced) return;
 *     gsap.from('.star', { y: -DISTANCE.max, autoAlpha: 0, stagger: STAGGER.stars, duration: DUR.base, ease: EASE.impact });
 *   });
 * }
 */
export function gsapScope(setup: (scope: GsapScope) => void): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement; // What: this component's root DOM element. Why: animations must stay inside it.
  const zone = inject(NgZone); // What: Angular's change-detection zone. Why: we need to step outside it.
  const destroyRef = inject(DestroyRef); // What: lifecycle hook object. Why: lets us clean up without implementing ngOnDestroy.
  const prefs = inject(PreferencesService); // What: the app's motion decision (OS setting + MOTION toggle). Why: GSAP and CSS must agree on "reduced".

  let ctx: gsap.Context | undefined; // What: GSAP's "recording" of everything we create. Why: one revert() undoes it all.
  let destroyed = false; // What: remembers if the component died before its first render. Why: otherwise afterNextRender could start animations on a dead component.

  afterNextRender(() => { // What: runs once, after the DOM exists, only in the browser. Why: fixes the timing problem and is SSR-safe.
    if (destroyed) return; // What: bail out if we were destroyed first. Why: fast back-navigation can destroy before render.
    const reduced = prefs.reducedMotion(); // What: reads the motion decision once, at mount. Why: setup() can skip heavy motion. (The guide reads the media query directly; we add the in-app toggle on top.)
    zone.runOutsideAngular(() => { // What: everything inside escapes change detection. Why: 60fps updates won't re-render the app.
      ctx = gsap.context((self) => setup({ host, reduced, ctx: self }), host); // What: records all tweens/ScrollTriggers; scopes selector text to host. Why: '.star' can't hit another component's .star.
    });
  });

  destroyRef.onDestroy(() => { // What: runs when Angular destroys the component. Why: no leaks, no zombie ScrollTriggers.
    destroyed = true;
    ctx?.revert(); // What: kills every recorded animation and restores inline styles. Why: coming back to the page starts clean.
  });
}

// In plain English: "When my component appears, run my animations quietly outside Angular,
// keep them inside my component, and wipe them all when I leave."
