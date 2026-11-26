import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { LanguageShare } from '../../models/profile.model';

/**
 * Skill stats (spec 06): top 5 languages. Row = name · bar track · gradient fill · percent.
 * Fill width = share of repos. Bars fill when scrolled into view (once).
 */
@Component({
  selector: 'gw-skill-stats',
  template: `
    <section class="panel" aria-labelledby="gw-skills-title">
      <h2 class="tag" id="gw-skills-title">Skill stats</h2>
      <ul role="list" class="rows">
        @for (l of languages(); track l.name) {
          <li class="row">
            <span class="name">{{ l.name }}</span>
            <!-- The bar is decoration for sighted users; the percent text carries the value for everyone. -->
            <span class="track" aria-hidden="true">
              <span class="fill" [style.width.%]="l.share * 100"></span>
            </span>
            <span class="percent">{{ l.percent }}%</span>
          </li>
        }
      </ul>
      @if (truncated()) {
        <p class="note">Based on the 100 most recently updated repositories.</p>
      }
    </section>
  `,
  styleUrl: './skill-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillStatsComponent {
  readonly languages = input.required<LanguageShare[]>();
  /** True when the user has more than 100 repos (see Profile.reposTruncated). */
  readonly truncated = input(false);

  constructor() {
    gsapScope(({ host, reduced }) => {
      if (reduced) return;
      // What: the panel fades up when it scrolls into view. Why: spec 07: below-fold items animate on scroll, not on the reveal clock.
      gsap.from(host.querySelector('.panel'), {
        autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter,
        scrollTrigger: { trigger: host, start: 'top 90%', once: true }, // once: scrolling back up doesn't replay it.
      });
      host.querySelectorAll<HTMLElement>('.fill').forEach((bar, i) => {
        gsap.from(bar, {
          scaleX: 0,                       // What: grow from nothing to its real width. Why: transform only; CSS transform-origin: left makes it fill left to right.
          duration: DUR.slow, ease: EASE.enter,
          delay: i * STAGGER.list,         // What: top row first. Why: top-left to bottom-right (spec 07).
          scrollTrigger: { trigger: bar, start: 'top 85%', once: true }, // What: start when the bar is 85% down the viewport. Why: animate when seen, not when loaded.
        });
      });
    });
  }
}

// In plain English: "List the top languages with their share; when the panel scrolls into view, grow each bar from the left."
