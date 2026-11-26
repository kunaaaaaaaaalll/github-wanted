import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gsap } from 'gsap';
import { DUR, EASE, REVEAL } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { formatExact } from '../../utils/format';

/**
 * Cash counter (spec 06): "$" in orange + Anton numerals, sub-label "TOTAL STARS".
 * Always the exact number with separators (spec 10: the one place we never abbreviate).
 */
@Component({
  selector: 'gw-cash-counter',
  template: `
    <!-- The visible number animates; screen readers get the final value from hidden text instead (spec 13).
         Hidden text, not aria-label: a <p> isn't allowed an accessible name (axe: aria-prohibited-attr). -->
    <p class="cash">
      <span class="visually-hidden">{{ formatted() }} total stars</span>
      <span class="dollar" aria-hidden="true">$</span>
      <!-- min-width in ch = final digit count. Why: with tabular digits the number never changes width while counting. -->
      <span class="value" aria-hidden="true" [style.min-width.ch]="formatted().length">{{ formatted() }}</span>
    </p>
    <p class="sub" aria-hidden="true">Total stars</p>
  `,
  styleUrl: './cash-counter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashCounterComponent {
  readonly stars = input.required<number>();
  protected readonly formatted = computed(() => formatExact(this.stars()));

  constructor() {
    gsapScope(({ host, reduced }) => {
      const el = host.querySelector<HTMLElement>('.value')!; // What: the number's DOM node. Why: we write to it directly, 60 times a second, with no change detection.
      const target = this.stars();                         // What: the final total, also already rendered by the template. Why: the template stays the source of truth.
      if (reduced || target === 0) return;                 // What: keep the final value as rendered. Why: no rolling for reduced motion; nothing to roll from 0 to 0.
      const counter = { value: 0 };                        // What: a plain object to animate. Why: GSAP can tween any number on any object.
      el.textContent = '0';                                // What: start visibly at 0. Why: otherwise the final number flashes before the count begins.
      gsap.to(counter, {
        value: target,
        duration: DUR.count,   // 1.6s (spec 07 "number count-ups").
        ease: EASE.enter,      // Fast start, soft landing: big jumps first, the last digits settle slowly.
        delay: REVEAL.cash,
        snap: { value: 1 },    // What: whole numbers each frame. Why: "$1,204.37" looks broken.
        onUpdate: () => { el.textContent = formatExact(counter.value); }, // What: direct DOM write. Why: no signals, no change detection per frame.
      });
    });
  }
}

// In plain English: "Show the exact total; if motion is on, roll up to it from zero, painting each step straight onto the screen."
