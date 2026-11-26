import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, FX, REVEAL, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { BrandMarkComponent } from '../../components/brand-mark/brand-mark.component';
import { CashCounterComponent } from '../../components/cash-counter/cash-counter.component';
import { CharacterCardComponent } from '../../components/character-card/character-card.component';
import { MinimapCardComponent } from '../../components/minimap-card/minimap-card.component';
import { MissionLogComponent } from '../../components/mission-log/mission-log.component';
import { MissionToastComponent } from '../../components/mission-toast/mission-toast.component';
import { NewsTickerComponent } from '../../components/news-ticker/news-ticker.component';
import { SkillStatsComponent } from '../../components/skill-stats/skill-stats.component';
import { StatsStripComponent } from '../../components/stats-strip/stats-strip.component';
import { TransitionLinkDirective } from '../../components/transition-overlay/transition-link.directive';
import { WantedLevelComponent } from '../../components/wanted-level/wanted-level.component';
import type { Profile } from '../../models/profile.model';

/**
 * The profile HUD (spec 09.3 / 09.4). Mounted only once the Profile exists
 * ("animate on mount, mount on data"), so every child's gsapScope fires exactly at reveal time.
 *
 * This component directs the shared parts of the reveal (spec 07 chart):
 *   - HUD panels fade/slide in, in reading order (REVEAL.panels, STAGGER.list apart)
 *   - Screen shake when the 5th star lands (wanted level 5 only, spec 08)
 * Each child plays its own slot (card 0.2s, stars 0.5s, cash 0.6s, stats 0.7s, toast 1.0s).
 */
@Component({
  selector: 'gw-profile-hud',
  imports: [
    BrandMarkComponent, TransitionLinkDirective, WantedLevelComponent, CashCounterComponent, CharacterCardComponent,
    StatsStripComponent, SkillStatsComponent, MissionLogComponent, MinimapCardComponent, NewsTickerComponent, MissionToastComponent,
  ],
  templateUrl: './profile-hud.component.html',
  styleUrl: './profile-hud.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileHudComponent {
  readonly profile = input.required<Profile>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // --- Sticky column height → CSS (see .col-left in the SCSS) ---
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const left = this.host.querySelector<HTMLElement>('.col-left');
      if (!left) return;
      zone.runOutsideAngular(() => { // What: create the observer outside the zone. Why: its callbacks then never trigger change detection.
        const ro = new ResizeObserver(([entry]) => {
          left.style.setProperty('--col-h', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`); // What: direct style write. Why: pure layout data; no template needs it.
        });
        ro.observe(left);
        destroyRef.onDestroy(() => ro.disconnect()); // What: stop observing. Why: no callbacks into a destroyed view.
      });
    });

    gsapScope(({ host, reduced }) => {
      if (reduced) return; // Everything is already in its final CSS state.

      // 1. HUD panels, top-left to bottom-right (spec 07). Only the ones above the fold: the rest reveal on scroll.
      gsap.from(host.querySelectorAll('.reveal'), {
        autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter,
        stagger: STAGGER.list, delay: REVEAL.panels,
      });

      // 2. Screen shake as the 5th star lands: wanted level 5 only (spec 08).
      if (this.profile().wantedLevel === 5) {
        const amp = window.matchMedia('(max-width: 599px)').matches ? FX.shake.mobile : FX.shake.desktop; // 6px desktop / 4px mobile.
        const landing = REVEAL.stars + 4 * STAGGER.stars + DUR.base; // What: 5th star's start + its drop time. Why: shake on impact, not before.
        gsap.to(host.querySelector('.hud'), {
          // What: alternating offsets that shrink to 0. Why: spec 08 "decays to 0"; a constant shake reads as an error.
          keyframes: { x: [amp, -amp * 0.75, amp * 0.5, -amp * 0.25, 0], y: [-amp * 0.5, amp * 0.4, -amp * 0.25, amp * 0.1, 0] },
          duration: FX.shake.duration, // ≤ 0.3s.
          ease: EASE.glitch,           // Hard steps between offsets: an impact jolt, not a wobble.
          delay: landing,
          clearProps: 'transform',     // What: remove the inline transform afterwards. Why: a leftover transform on an ancestor breaks position: sticky/fixed descendants.
        });
      }
    });
  }
}

// In plain English: "Lay out the whole wanted poster, fade the top panels in reading order, and give the
// screen one sharp jolt when a five-star suspect's last star lands."
