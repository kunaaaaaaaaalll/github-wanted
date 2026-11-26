import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PreferencesService } from '../../services/preferences.service';

/**
 * Global scanline + film-grain overlays (spec 08).
 * Static (no animation), pointer-events: none, opacity capped by tokens.
 * Both are controlled by the SCANLINES toggle.
 */
@Component({
  selector: 'gw-screen-overlays',
  template: `
    @if (prefs.scanlines()) {
      <div class="grain"></div>
      <div class="scanlines"></div>
    }
  `,
  styleUrl: './screen-overlays.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' }, // Pure decoration.
})
export class ScreenOverlaysComponent {
  protected readonly prefs = inject(PreferencesService);
}
