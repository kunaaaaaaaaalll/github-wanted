import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TransitionLinkDirective } from '../transition-overlay/transition-link.directive';

/**
 * The original "GW" badge (spec 06): cyan hexagon outline, gold 5-point star,
 * "GW" in Anton. 32px tall, top-left on every screen, links home.
 * [link]="false" renders it as a plain image (the loading screen: nothing to click there).
 */
@Component({
  selector: 'gw-brand-mark',
  imports: [NgTemplateOutlet, TransitionLinkDirective],
  template: `
    @if (link()) {
      <!-- The accessible name starts with the visible text "GW" (WCAG 2.5.3 label in name): voice users can say "click GW". -->
      <a gwLink="/" class="mark" aria-label="GW, GitHub Wanted home"><ng-container [ngTemplateOutlet]="badge" /></a>
    } @else {
      <span class="mark is-static" role="img" aria-label="GW, GitHub Wanted"><ng-container [ngTemplateOutlet]="badge" /></span>
    }
    <ng-template #badge>
      <svg viewBox="0 0 40 34" focusable="false" aria-hidden="true">
        <!-- Flat-top hexagon, inset by half the stroke so it isn't clipped. -->
        <polygon class="hex" points="10.5,2 29.5,2 39,17 29.5,32 10.5,32 1,17" />
        <!-- Star sits on the top edge; the night "notch" behind it cuts the hexagon line so the star reads cleanly. -->
        <circle class="notch" cx="20" cy="2" r="4.6" />
        <polygon class="star" points="20,-1.6 21.2,0.9 23.9,1.2 21.9,3 22.4,5.7 20,4.4 17.6,5.7 18.1,3 16.1,1.2 18.8,0.9" />
        <text class="letters" x="20" y="24.6" text-anchor="middle">GW</text>
      </svg>
    </ng-template>
  `,
  styleUrl: './brand-mark.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {
  readonly link = input(true);
}
