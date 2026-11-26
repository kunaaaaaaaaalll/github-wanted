import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, FX } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { GithubError } from '../../models/github-error';
import { CityService } from '../../services/city.service';
import { TransitionService } from '../../services/transition.service';

/** Spec 10 headlines + spec 11 voice. */
const COPY = {
  'not-found': {
    headline: 'Suspect not found',
    body: 'No one in Port Solara goes by that name. Check the spelling, or try someone else.',
    action: 'Try another name',
  },
  'rate-limited': {
    headline: 'Too much heat',
    body: 'GitHub allows 60 lookups an hour without signing in. Profiles you already opened still work.',
    action: 'Retry',
  },
  network: {
    headline: 'Signal lost',
    body: "We couldn't reach GitHub. Check your connection and try again.",
    action: 'Retry',
  },
  server: {
    headline: 'Signal lost',
    body: "GitHub didn't answer the call. Give it a moment and try again.",
    action: 'Retry',
  },
} as const;

/**
 * Full-screen error states (spec 10): city dimmed, one panel, one clear next action.
 */
@Component({
  selector: 'gw-error-screen',
  templateUrl: './error-screen.component.html',
  styleUrl: './error-screen.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorScreenComponent {
  readonly error = input.required<GithubError>();
  readonly username = input.required<string>();
  /** Emitted for retryable errors (rate limit after the countdown, network, server). */
  readonly retry = output<void>();

  private readonly transitions = inject(TransitionService);
  private readonly zone = inject(NgZone);
  private readonly city = inject(CityService);
  private readonly headline = viewChild.required<ElementRef<HTMLElement>>('headline');

  protected readonly copy = computed(() => COPY[this.error().kind]);

  /** Milliseconds until the rate limit resets; ticks once a second. 0 when not rate-limited or done. */
  protected readonly remainingMs = signal(0);
  protected readonly retryReady = computed(() => this.error().kind !== 'rate-limited' || this.remainingMs() <= 0);
  /** "Lay low for 12 minutes" (spec 10), rounded up so it never promises less wait than real. */
  protected readonly layLow = computed(() => {
    const minutes = Math.ceil(this.remainingMs() / 60_000);
    return `Lay low for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  });
  /** Live countdown "mm:ss". */
  protected readonly clock = computed(() => {
    const total = Math.ceil(this.remainingMs() / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });

  constructor() {
    // --- Countdown (rate limit only) ---
    // What: a 1-second interval inside Angular's zone. Why: it changes what the template shows once a second;
    // running it in the zone lets change detection pick that up (a 1Hz tick costs nothing).
    const tick = () => {
      const e = this.error();
      const remaining = e.kind === 'rate-limited' ? Math.max(0, e.resetAt - Date.now()) : 0;
      this.remainingMs.set(remaining);
      if (remaining === 0) clearInterval(timer); // What: stop ticking when there's nothing to count. Why: no pointless change detection every second.
    };
    const timer = setInterval(tick, 1000);
    queueMicrotask(tick); // What: first value right away. Why: inputs aren't set yet in the constructor; a microtask runs after they are.

    // --- Dim and pause the city behind us (spec 10: "city dimmed") ---
    this.zone.runOutsideAngular(() => this.city.engine?.setActive(false)); // What: stop rendering while hidden behind the scrim. Why: no GPU work for frames nobody sees clearly.
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.zone.runOutsideAngular(() => this.city.engine?.setActive(true));
    });

    gsapScope(({ reduced }) => {
      this.headline().nativeElement.focus({ preventScroll: true }); // What: move focus to the headline. Why: screen readers announce the new state; keyboard users start from here.
      if (reduced) return;
      gsap.timeline()
        .from('.panel', { autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter }) // Big before small: panel first.
        .to('.headline', { // Spec 08: glitch on error screens, ≤ 0.3s, x ≤ 6px, skew ≤ 10°.
          x: FX.glitch.jitterX, skewX: FX.glitch.skew, duration: FX.glitch.total / 6,
          repeat: 5, yoyo: true, ease: EASE.glitch,
        }, '<0.1')
        .set('.headline', { x: 0, skewX: 0 });
    });
  }

  protected onAction(): void {
    if (this.error().kind === 'not-found') {
      // What: go back to the hero with the name prefilled and the input focused (spec 10: "Try another name" focuses input).
      // Why prefill? Most misses are typos; fixing one letter beats retyping.
      void this.transitions.go(['/'], { state: { retryName: this.username() } }); // Same wipe as every other route change.
      return;
    }
    if (this.retryReady()) this.retry.emit();
  }
}

// In plain English: "Dim the city, glitch the headline once, say what happened in plain words,
// and offer exactly one next step, waiting out GitHub's limit when we have to."
