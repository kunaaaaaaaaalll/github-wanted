import { ChangeDetectionStrategy, Component, ElementRef, NgZone, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Location } from '@angular/common';
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { DISTANCE, DUR, EASE, FX, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { BrandMarkComponent } from '../../components/brand-mark/brand-mark.component';
import { HudTogglesComponent } from '../../components/hud-toggles/hud-toggles.component';
import { CityService } from '../../services/city.service';
import { PreferencesService } from '../../services/preferences.service';
import { TransitionService } from '../../services/transition.service';
import { parseGithubInput } from '../../utils/parse-github-input';

/** Copy (spec 11 where defined; the hint and empty-input lines are additions, see milestone notes). */
const COPY = {
  hint: 'Works with github.com/name, @name or just name.',
  invalid: "That's not a GitHub address.", // Spec 10, exact.
  empty: 'Type a username first.',
} as const;

@Component({
  selector: 'gw-hero-page',
  imports: [BrandMarkComponent, HudTogglesComponent],
  templateUrl: './hero.page.html',
  styleUrl: './hero.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroPage {
  private readonly transitions = inject(TransitionService);
  private readonly zone = inject(NgZone);
  private readonly prefs = inject(PreferencesService);

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private readonly glow = viewChild.required<ElementRef<HTMLElement>>('glow');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  // What: a name handed back by the "SUSPECT NOT FOUND" screen via router state, if any.
  // Why: spec 10 "Try another name focuses input"; prefilling lets them fix a typo instead of retyping.
  private readonly retryName = (inject(Location).getState() as { retryName?: string } | null)?.retryName ?? null;

  protected readonly query = signal(this.retryName ?? ''); // What: the input's text. Why: chips write to it, submit reads it.
  protected readonly error = signal<string | null>(null); // What: the current validation message, or null.
  protected readonly submitting = signal(false);         // What: true during the exit glitch. Why: blocks double submits (CTA disabled state).
  protected readonly hint = COPY.hint;
  protected readonly examples = ['torvalds', 'gaearon', 'sindresorhus'] as const; // What: one-click examples (spec 09.1). Why: first-time visitors can try it without knowing a username.

  private ctx?: gsap.Context;   // What: this page's GSAP context. Why: event-driven tweens (glitch, pulse) get added to it so destroy cleans them up.
  private pulse?: gsap.core.Tween;

  constructor() {
    // What: bring the camera back to the street-level hero shot.
    // Why animate only when visible: under the route wipe nobody sees it, so jump; after browser Back, fly back.
    void inject(CityService).setShot('hero', !this.transitions.covering);

    // What: react to the MOTION toggle / OS setting changing while the page is open.
    // Why: reduced motion must stop the pulse immediately, not on the next visit.
    effect(() => {
      this.prefs.reducedMotion(); // Tracked read: re-run when it changes.
      untracked(() => this.syncPulse()); // untracked: syncPulse reads query(); typing shouldn't re-run this effect.
    });

    gsapScope(({ reduced, ctx }) => {
      this.ctx = ctx;
      const autofocus = () => {
        const field = this.field().nativeElement;
        if (this.retryName) {
          // What: always focus and select when coming back from "Try another name", even on mobile. Why: the visitor asked for it with a tap.
          field.focus({ preventScroll: true });
          field.select();
          return;
        }
        // What: otherwise focus on desktop only (spec 09.1). Why: on phones, focusing pops the keyboard over the city before the visitor has seen anything.
        if (window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) field.focus({ preventScroll: true });
      };
      if (reduced) {
        autofocus(); // What: no entrance at all; everything is already visible (CSS = final state).
        return;
      }

      this.syncPulse(); // What: start the idle pulse. Why: the input is empty on arrival.

      // --- Hero moment: the title slam ---
      const reveals = '.kicker, .reveal';
      gsap.set('.title', { autoAlpha: 0 });                          // What: hide the title until Anton has loaded. Why: splitting fallback-font letters, then swapping fonts, makes the letters jump.
      gsap.set(reveals, { autoAlpha: 0, y: DISTANCE.min });         // What: supporting UI starts hidden, 16px low. Why: we tween TO the CSS state below.

      document.fonts.ready.then(() => ctx.add(() => {               // What: wait for fonts, then record into the context. Why: SplitText measures glyphs; ctx.add keeps cleanup working for async work.
        // What: split into words AND letters, each letter in its own clipping mask. Why: letters rise "from behind a line";
        // the word wrappers keep "WANTED" whole on narrow screens (chars-only splitting let it break as "WANTE / D").
        // SplitText also adds aria-label so screen readers read the words, not letters.
        const split = SplitText.create('.title', { type: 'words,chars', mask: 'chars' });
        gsap.timeline()
          .set('.title', { autoAlpha: 1 })
          .from(split.chars, { yPercent: 110, duration: DUR.slow, stagger: STAGGER.letters, ease: EASE.reveal })   // What: letters punch up. Why: spec's hero moment; DUR.slow (0.6s) keeps the title readable inside 1s.
          .to('.kicker', { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.enter }, '<0.1')                   // What: kicker arrives with the title. Why: it's part of the title card.
          .to('.reveal', { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.enter, stagger: STAGGER.list }, '<0.25') // What: input, chips, footer in reading order. Why: big before small; the input is usable by ~1s.
          .call(autofocus); // What: focus once the input is visible. Why: a visibility:hidden input can't take focus.
      }));
    });
  }

  protected onInput(value: string): void {
    this.query.set(value);
    if (this.error()) this.error.set(null); // What: clear the error as soon as they edit. Why: don't keep scolding while they fix it.
    this.syncPulse();
  }

  protected useExample(name: string): void {
    this.query.set(`@${name}`); // What: fill, don't submit (spec 09.1). Why: visitors see how input works and press START MISSION themselves.
    this.error.set(null);
    this.syncPulse();
    this.field().nativeElement.focus();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault(); // What: stop the browser's full-page form submit. Why: we route inside the app.
    if (this.submitting()) return;

    const result = parseGithubInput(this.query());
    const reduced = this.prefs.reducedMotion();

    if (!result.ok) {
      this.error.set(result.reason === 'empty' ? COPY.empty : COPY.invalid);
      this.field().nativeElement.focus(); // What: keep focus in the input. Why: they'll type the fix next.
      if (!reduced) this.glitch(this.bar().nativeElement, false); // Spec 10: glitch the input once (≤ 0.3s). No navigation.
      return;
    }

    this.submitting.set(true);
    // What: one flash, change route at its peak; the loading screen + camera fly-in take over (GSAP guide 5.3).
    // Why through TransitionService: the flash lives in the app shell, so it survives this page being destroyed mid-fade.
    const go = () => void this.transitions.cut(['/u', result.username]);
    if (reduced) {
      go(); // Reduced motion: the service skips the flash and navigates directly.
      return;
    }
    this.glitch(this.title().nativeElement, true, go); // What: glitch first, then the flash cut.
  }

  /** Spec 08 glitch: ≤ 0.3s total, x jitter ≤ 6px, skew ≤ 10°, hard steps. */
  private glitch(target: HTMLElement, withSkew: boolean, onComplete?: () => void): void {
    this.zone.runOutsideAngular(() => { // What: run the tween outside Angular. Why: 60fps without change detection.
      this.ctx?.add(() => {
        gsap.timeline({ onComplete })
          .to(target, {
            x: FX.glitch.jitterX,
            skewX: withSkew ? FX.glitch.skew : 0, // What: skew only the title. Why: a skewed 640px input bar reads as broken, not glitchy.
            duration: FX.glitch.total / 6,        // What: 6 segments × 0.05s = 0.3s. Why: exactly the spec's cap.
            repeat: 5,
            yoyo: true,
            ease: EASE.glitch,                    // steps(1): no in-between frames; hard digital jumps.
          })
          .set(target, { x: 0, skewX: 0 });       // What: snap home. Why: guarantees no leftover offset.
      });
    });
  }

  /**
   * Pulse only while the input is empty (idle) AND motion is allowed.
   * Otherwise hand the glow back to CSS (visible only while focused).
   * Called on input, on chip click, and whenever the motion preference changes live.
   */
  private syncPulse(): void {
    const ctx = this.ctx;
    if (!ctx) return; // Not rendered yet; gsapScope's setup will call us.
    const glow = this.glow().nativeElement;
    const shouldPulse = !this.query() && !this.prefs.reducedMotion();
    this.zone.runOutsideAngular(() => { // What: GSAP calls outside the zone. Why: waking GSAP's ticker inside the zone would run change detection every frame.
      if (shouldPulse) {
        // What: create the pulse on first need, inside the page's context. Why: if the page loaded with motion off and the visitor turns it on, it must still appear, and still be cleaned up on destroy.
        this.pulse ??= ctx.add(() => gsap.fromTo(glow,
          { autoAlpha: FX.pulse.opacityMin },
          { autoAlpha: FX.pulse.opacityMax, duration: FX.pulse.period / 2, ease: EASE.idle, repeat: -1, yoyo: true, paused: true }, // Spec 08: 2s period (half each way, yoyo), opacity 0.4–0.8.
        )) as gsap.core.Tween;
        if (this.pulse.paused()) this.pulse.restart();
      } else if (this.pulse && !this.pulse.paused()) {
        this.pulse.pause();
        gsap.set(glow, { clearProps: 'opacity,visibility' }); // What: remove GSAP's inline styles. Why: lets the CSS :focus-within rule decide again.
      }
    });
  }
}

// In plain English: "Slam the title in once the font is ready, pulse the empty input, validate on submit,
// glitch on errors, and glitch-then-navigate on success. With reduced motion, skip every effect."
