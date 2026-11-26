import { ChangeDetectionStrategy, Component, ElementRef, Injector, NgZone, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DISTANCE, DUR, EASE, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { Mission } from '../../models/profile.model';
import { formatCount, formatExact } from '../../utils/format';
import { languageColor } from '../../utils/language-color';

/** Spec 09.3: top 6 by stars, then "Show all missions". */
const INITIAL = 6;

/**
 * Mission log (spec 06): repos as cards in a 2-column grid (1 on mobile).
 * Each whole card is a link to the repo (new tab). Cards reveal in batches on scroll.
 */
@Component({
  selector: 'gw-mission-log',
  templateUrl: './mission-log.component.html',
  styleUrl: './mission-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionLogComponent {
  readonly missions = input.required<Mission[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private ctx?: gsap.Context;
  private reduced = false;

  protected readonly expanded = signal(false);
  protected readonly visible = computed(() => (this.expanded() ? this.missions() : this.missions().slice(0, INITIAL)));
  protected readonly hiddenCount = computed(() => this.missions().length - INITIAL);
  protected readonly formatCount = formatCount;
  protected readonly formatExact = formatExact;
  protected readonly languageColor = languageColor;

  constructor() {
    gsapScope(({ host, reduced, ctx }) => {
      this.ctx = ctx;
      this.reduced = reduced;
      if (reduced) return;
      gsap.from(host.querySelector('.head'), {
        autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter,
        scrollTrigger: { trigger: host, start: 'top 90%', once: true },
      });
      this.reveal(host.querySelectorAll<HTMLElement>('.mission'));
    });
  }

  protected showAll(): void {
    const before = this.visible().length;
    this.expanded.set(true);
    // What: after Angular renders the new cards, reveal them and re-measure scroll positions.
    // Why: ScrollTrigger measured the page before it grew; without refresh(), later triggers fire at the wrong spot.
    afterNextRender(() => {
      const cards = Array.from(this.host.querySelectorAll<HTMLElement>('.mission')).slice(before);
      this.zone.runOutsideAngular(() => { // What: GSAP work outside the zone. Why: this callback came from a click (inside the zone); tweens started here must not trigger change detection per frame.
        this.ctx?.add(() => this.reveal(cards)); // ctx.add: recorded in this component's context, so destroy cleans it up.
        ScrollTrigger.refresh();
      });
      cards[0]?.querySelector<HTMLElement>('a')?.focus(); // What: move focus to the first new card. Why: the button disappears; keyboard users continue where the new content starts.
    }, { injector: this.injector });
  }

  /** GSAP guide 5.7: batched reveal. Cards entering together stagger as one tidy row. */
  private reveal(cards: ArrayLike<HTMLElement>): void {
    if (this.reduced || cards.length === 0) return; // Reduced motion: skip the set too, or cards would stay hidden forever.
    gsap.set(cards, { autoAlpha: 0, y: DISTANCE.min }); // What: hide them before they scroll in. Why: batch only animates TO visible.
    ScrollTrigger.batch(Array.from(cards), {
      start: 'top 92%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.enter, stagger: STAGGER.list }),
    });
  }
}

// In plain English: "Show the six most-starred repos as cards that fade up as you scroll; reveal the rest on request."
