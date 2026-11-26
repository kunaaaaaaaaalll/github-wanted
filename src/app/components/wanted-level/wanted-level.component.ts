import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, REVEAL, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { WantedLevel } from '../../models/profile.model';

/**
 * Wanted level (spec 06): 5 star slots, on = gold with a soft glow, off = muted outline.
 * The "on" stars drop in one by one: half of the profile's hero moment.
 */
@Component({
  selector: 'gw-wanted-level',
  template: `
    <p class="label" aria-hidden="true">Wanted level</p>
    <!-- One accessible image for the whole row. Why: "star, star, star, empty star…" read one by one is noise. -->
    <div class="stars" role="img" [attr.aria-label]="'Wanted level ' + level() + ' of 5'">
      @for (slot of slots; track slot) {
        <svg class="star" [class.on]="slot <= level()" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polygon points="12,1.5 15.1,8.1 22.3,8.9 16.9,13.8 18.4,20.9 12,17.3 5.6,20.9 7.1,13.8 1.7,8.9 8.9,8.1" />
        </svg>
      }
    </div>
  `,
  styleUrl: './wanted-level.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WantedLevelComponent {
  readonly level = input.required<WantedLevel>();
  protected readonly slots = [1, 2, 3, 4, 5] as const;

  constructor() {
    gsapScope(({ reduced }) => {
      if (reduced) return; // CSS already shows the final stars.
      gsap.from('.star.on', {
        y: -DISTANCE.max,        // What: fall from 40px above (the spec's max entrance distance).
        autoAlpha: 0,
        duration: DUR.base,
        ease: EASE.impact,       // back.out: overshoots and settles, like something landing.
        stagger: STAGGER.stars,  // What: 0.12s apart. Why: reads as "one… two… three…", a count, not a blink.
        delay: REVEAL.stars,     // What: its slot in the profile reveal (spec 07 chart).
      });
    });
  }
}

// In plain English: "Show five slots, light the earned ones gold, and drop them in one at a time."
