import { ChangeDetectionStrategy, Component, Injector, NgZone, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { gsap } from 'gsap';
import { EASE, FX, TIMING } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { PreferencesService } from '../../services/preferences.service';

/** Spec 06: reduced motion shows a static list of the 3 latest. */
const STATIC_COUNT = 3;

/**
 * LIVE news ticker (spec 06): fixed to the bottom, 40px. Headlines scroll left at 40px/s,
 * pause on hover/focus, and have a pause button (WCAG 2.2.2: moving content must be pausable).
 * Reduced motion: a static list of the 3 latest. No events: "Quiet on the streets." (spec 10).
 */
@Component({
  selector: 'gw-news-ticker',
  templateUrl: './news-ticker.component.html',
  styleUrl: './news-ticker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsTickerComponent {
  readonly news = input.required<string[]>();

  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  protected readonly reduced = inject(PreferencesService).reducedMotion;

  /**
   * Scrolling only makes sense with motion on and at least two headlines.
   * Why two: a single headline looped across the screen reads as spam, not news; it stays still instead.
   */
  protected readonly scrolling = computed(() => !this.reduced() && this.news().length > 1);
  protected readonly staticLines = computed(() => this.news().slice(0, STATIC_COUNT));
  /** How many copies of the headline list to render, so the loop never shows a gap (measured after render). */
  protected readonly copies = signal([0, 1]);
  /** The pause button's state. */
  protected readonly paused = signal(false);

  private tween?: gsap.core.Tween;
  private hovering = false;

  constructor() {
    gsapScope(({ host, reduced, ctx }) => {
      if (reduced || this.news().length === 0) return; // Nothing to pulse or scroll. (One headline: the LIVE pulse runs, the text stays still.)

      // LIVE tag glow pulse (spec 08: period 2s, opacity 0.4–0.8).
      gsap.fromTo(host.querySelector('.live-glow'),
        { autoAlpha: FX.pulse.opacityMin },
        { autoAlpha: FX.pulse.opacityMax, duration: FX.pulse.period / 2, ease: EASE.idle, repeat: -1, yoyo: true });

      document.fonts.ready.then(() => ctx.add(() => {
        // 1. Measure one copy of the headlines. Why after fonts: the width depends on Rajdhani being loaded.
        const first = host.querySelector<HTMLElement>('.copy');
        if (!first) return; // Not scrolling (single headline): nothing to measure.
        const copyWidth = first.offsetWidth;
        // 2. Enough copies to cover the widest the window could become (+1 so the seam is always off-screen).
        const needed = Math.max(2, Math.ceil(Math.max(window.innerWidth, screen.width) / copyWidth) + 1);
        this.zone.run(() => this.copies.set(Array.from({ length: needed }, (_, i) => i))); // Signal write → back in the zone (brief rule).
        // 3. After Angular renders the copies, start the loop: move exactly one copy width, then jump back (invisible: copy 2 sits where copy 1 was).
        afterNextRender(() => this.zone.runOutsideAngular(() => ctx.add(() => {
          this.tween = gsap.fromTo(host.querySelector('.track'),
            { x: 0 },
            { x: -copyWidth, duration: copyWidth / TIMING.tickerSpeed, ease: TIMING.tickerEase, repeat: -1 }); // duration = distance / speed → exactly 40px/s.
          if (this.paused()) this.tween.pause();
        })), { injector: this.injector });
      }));
    });
  }

  // Pause on hover/focus (spec 06). Pausing/resuming an existing tween doesn't start GSAP's ticker, so it's safe from inside the zone.
  protected onEnter(): void { this.hovering = true; this.tween?.pause(); }
  protected onLeave(): void { this.hovering = false; if (!this.paused()) this.tween?.resume(); }

  protected togglePause(): void {
    this.paused.update((p) => !p);
    if (this.paused()) this.tween?.pause();
    else if (!this.hovering) this.tween?.resume();
  }
}

// In plain English: "Scroll the suspect's latest activity along the bottom like a news channel, stop when
// someone's reading it, and show a still list instead when motion is reduced."
