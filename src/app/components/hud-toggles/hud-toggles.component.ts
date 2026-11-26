import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PreferencesService } from '../../services/preferences.service';

/**
 * MOTION / SCANLINES toggles (spec 09.1, top-right of the hero).
 * Real <button aria-pressed> elements: screen readers announce "Motion, toggle button, pressed".
 * The visible ON/OFF text is aria-hidden because aria-pressed already says it.
 */
@Component({
  selector: 'gw-hud-toggles',
  template: `
    <button type="button" class="toggle" [attr.aria-pressed]="motionOn()" (click)="prefs.toggleMotion()">
      <span class="dot" aria-hidden="true"></span>
      Motion
      <span class="state" aria-hidden="true">{{ motionOn() ? 'On' : 'Off' }}</span>
    </button>
    <button type="button" class="toggle" [attr.aria-pressed]="prefs.scanlines()" (click)="prefs.toggleScanlines()">
      <span class="dot" aria-hidden="true"></span>
      Scanlines
      <span class="state" aria-hidden="true">{{ prefs.scanlines() ? 'On' : 'Off' }}</span>
    </button>
  `,
  styleUrl: './hud-toggles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HudTogglesComponent {
  protected readonly prefs = inject(PreferencesService);
  protected readonly motionOn = computed(() => !this.prefs.reducedMotion());
}
