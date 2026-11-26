import { Injectable, NgZone, inject } from '@angular/core';
import { NavigationBehaviorOptions, Router, UrlTree } from '@angular/router';
import { gsap } from 'gsap';
import { DUR, EASE, FX, exit } from '../animation/motion-tokens';
import { PreferencesService } from './preferences.service';

/** What a page may pass: route commands (['/u', name]) or a ready UrlTree. */
type Target = readonly unknown[] | UrlTree;

/**
 * One consistent cut between routes (GSAP guide 5.9), plus the submit flash (5.3).
 *
 * go():  wipe covers the screen → navigate (inside the zone) → wipe reveals the new page.
 * cut(): one flash (peak ≤ 0.6, spec 08) → navigate at the peak → flash fades over the next screen.
 *
 * The overlay elements live in the app shell (TransitionOverlayComponent) and register
 * here, so they survive the route change they cover.
 */
@Injectable({ providedIn: 'root' })
export class TransitionService {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly prefs = inject(PreferencesService);

  private wipe?: HTMLElement;
  private flash?: HTMLElement;
  private busy = false; // What: a transition is running. Why: a double-click mustn't start two wipes fighting over one element.

  /** True while the wipe hides the screen. Pages read it to decide whether their own entrance is visible (e.g. snap vs fly the camera). */
  covering = false;

  /** Called once by TransitionOverlayComponent after it renders. */
  register(els: { wipe: HTMLElement; flash: HTMLElement }): void {
    this.wipe = els.wipe;
    this.flash = els.flash;
  }

  /** Navigate with the wipe. Falls back to plain navigation with reduced motion or before the overlay exists. */
  async go(target: Target, extras?: NavigationBehaviorOptions): Promise<boolean> {
    const tree = this.toTree(target);
    if (this.router.url === this.router.serializeUrl(tree) && !extras?.state) return false; // What: already here. Why: a wipe that reveals the same page looks like a glitch.
    const wipe = this.wipe;
    if (this.busy || !wipe || this.prefs.reducedMotion()) return this.navigate(tree, extras);

    this.busy = true;
    try {
      await this.zone.runOutsideAngular(() =>
        gsap.timeline()
          .set(wipe, { xPercent: -100, autoAlpha: 1 })                              // What: park it off-screen left, visible.
          .to(wipe, { xPercent: 0, duration: exit(DUR.base), ease: EASE.exit }),     // What: cover. Why: the old page is EXITING: faster (70%), exit ease (spec 07).
      );
      this.covering = true;
      const ok = await this.navigate(tree, extras).catch(() => false); // What: a failed navigation still reveals. Why: never leave the visitor staring at a night-coloured wall.
      await nextFrame(); // What: wait one frame. Why: lets the new page paint under the wipe before we reveal it.
      this.covering = false;
      await this.zone.runOutsideAngular(() =>
        gsap.timeline()
          .to(wipe, { xPercent: 100, duration: DUR.base, ease: EASE.enter })         // What: reveal by continuing the sweep right. Why: the new page is ENTERING: slower, enter ease.
          .set(wipe, { autoAlpha: 0 }),                                             // What: hide it fully. Why: visibility:hidden also stops it catching clicks.
      );
      return ok;
    } finally {
      this.busy = false;
      this.covering = false;
    }
  }

  /** Navigate with one flash: the "cut" after the submit glitch. */
  cut(target: Target, extras?: NavigationBehaviorOptions): Promise<boolean> {
    const flash = this.flash;
    const tree = this.toTree(target);
    if (!flash || this.prefs.reducedMotion()) return this.navigate(tree, extras); // Reduced motion: no flash, ever.

    return new Promise((resolve) => {
      this.zone.runOutsideAngular(() => {
        gsap.timeline()
          .set(flash, { autoAlpha: 0 })
          .to(flash, { autoAlpha: FX.flash.peakOpacity, duration: DUR.instant, ease: EASE.enter }) // What: one flash, peak 0.6 (spec 08 cap).
          .call(() => { void this.navigate(tree, extras).then(resolve); })                      // What: change route at the peak. Why: the flash hides the swap.
          .to(flash, { autoAlpha: 0, duration: DUR.base, ease: EASE.enter });                    // What: fade out over the loading screen. Why: one flash per event; 0.45s total keeps it far under 3 flashes/s.
      });
    });
  }

  private navigate(tree: UrlTree, extras?: NavigationBehaviorOptions): Promise<boolean> {
    return this.zone.run(() => this.router.navigateByUrl(tree, extras)); // What: navigate inside the zone. Why: brief rule: app-state changes from animation callbacks go through zone.run().
  }

  private toTree(target: Target): UrlTree {
    return target instanceof UrlTree ? target : this.router.createUrlTree([...target]);
  }
}

/** Resolves on the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// In plain English: "Cover the screen, swap the page, uncover it, always the same way.
// For the big submit moment, flash once instead. With reduced motion, just switch pages."
