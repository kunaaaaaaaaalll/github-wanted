import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, FX } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { seededRandom } from '../../utils/seeded-random';

/**
 * Minimap card (spec 06): a circular, stylised street grid in cyan on night, a pink
 * pulse dot at the centre, location text below. No real map tiles (it's a vibe, not GPS).
 * No location → "Location unknown" over static noise (spec 10).
 */
@Component({
  selector: 'gw-minimap-card',
  templateUrl: './minimap-card.component.html',
  styleUrl: './minimap-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinimapCardComponent {
  readonly location = input<string | null>(null);

  /**
   * What: street lines generated from the location text.
   * Why seeded by the location: "Berlin" always draws the same streets and "Tokyo" different ones,
   * so the map feels specific to the suspect without pretending to be a real map.
   */
  protected readonly streets = computed(() => {
    const loc = this.location();
    if (!loc) return [];
    let seed = 0;
    for (const ch of loc) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = seededRandom(seed);
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    for (let i = 0; i < 6; i++) { // Avenues: near-vertical.
      const x = 10 + i * 16 + (rand() - 0.5) * 8;
      lines.push({ x1: x + (rand() - 0.5) * 10, y1: 0, x2: x + (rand() - 0.5) * 10, y2: 100, major: rand() < 0.3 });
    }
    for (let i = 0; i < 6; i++) { // Streets: near-horizontal.
      const y = 10 + i * 16 + (rand() - 0.5) * 8;
      lines.push({ x1: 0, y1: y + (rand() - 0.5) * 6, x2: 100, y2: y + (rand() - 0.5) * 6, major: rand() < 0.3 });
    }
    lines.push({ x1: 0, y1: rand() * 40 + 60, x2: 100, y2: rand() * 40, major: true }); // One diagonal boulevard.
    return lines;
  });

  constructor() {
    gsapScope(({ host, reduced }) => {
      if (reduced) return; // Static map and dot.
      gsap.from(host.querySelector('.panel'), {
        autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter,
        scrollTrigger: { trigger: host, start: 'top 92%', once: true }, // Below the fold on most screens (spec 07).
      });
      if (!this.location()) return; // No dot to pulse when the location is unknown.
      // What: a ring expanding from the dot and fading, every 2s. Why: "you are here" without blinking (spec 08 pulse period/opacity range).
      gsap.fromTo(host.querySelector('.ping'),
        { scale: 1, autoAlpha: FX.pulse.opacityMax },
        { scale: FX.ping.scale, autoAlpha: 0, duration: FX.pulse.period, ease: EASE.idle, repeat: -1 });
    });
  }
}

// In plain English: "Draw a little made-up street map for the suspect's city and ping their position on it."
