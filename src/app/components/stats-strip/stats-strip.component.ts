import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, REVEAL, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { Profile } from '../../models/profile.model';
import { formatCount, formatExact } from '../../utils/format';

/** Stats strip (spec 06): 4 equal cells (Repos, Followers, Following, Gists), numeral above label. */
@Component({
  selector: 'gw-stats-strip',
  template: `
    <section class="panel" aria-labelledby="gw-stats-title">
      <h2 class="tag" id="gw-stats-title">Rap sheet</h2>
      <!-- A description list: label/value pairs, which is exactly what screen readers should hear. -->
      <dl class="cells">
        @for (s of cells(); track s.label) {
          <div class="cell">
            <!-- title = the exact number when abbreviated (12.4K → "12,480"). Why: abbreviation shouldn't hide the real value from anyone. -->
            <dt class="label">{{ s.label }}</dt>
            <dd class="value" [attr.title]="s.exact">{{ s.short }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
  styleUrl: './stats-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsStripComponent {
  readonly stats = input.required<Profile['stats']>();

  protected readonly cells = computed(() => {
    const s = this.stats();
    return [
      { label: 'Repos', n: s.repos },
      { label: 'Followers', n: s.followers },
      { label: 'Following', n: s.following },
      { label: 'Gists', n: s.gists },
    ].map((c) => ({ label: c.label, short: formatCount(c.n), exact: formatExact(c.n) })); // Spec 10: abbreviate at 10,000+.
  });

  constructor() {
    gsapScope(({ reduced }) => {
      if (reduced) return;
      gsap.from('.cell', { autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter, stagger: STAGGER.list, delay: REVEAL.stats }); // Left to right, reading order.
    });
  }
}
