import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CityBackdropComponent } from './components/city-backdrop/city-backdrop.component';
import { ScreenOverlaysComponent } from './components/screen-overlays/screen-overlays.component';
import { TransitionOverlayComponent } from './components/transition-overlay/transition-overlay.component';
import { PreferencesService } from './services/preferences.service';
import { RouteAnnouncerService } from './services/route-announcer.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CityBackdropComponent, ScreenOverlaysComponent, TransitionOverlayComponent],
  template: `
    <!-- First Tab stop: jump straight to the page content (WCAG 2.4.1). -->
    <a class="skip-link" href="#main" (click)="skipToMain($event)">Skip to content</a>
    <!-- Polite live region: announces the page title after in-app navigation (see RouteAnnouncerService). -->
    <p class="visually-hidden" aria-live="polite">{{ announcer.message() }}</p>
    <!-- What: one city behind every route. Why: the hero → loading fly-in continues the same scene instead of rebuilding it. -->
    <gw-city-backdrop />
    <div class="content"><router-outlet /></div>
    <gw-screen-overlays />
    <!-- What: route wipe + submit flash, above everything. Why: they must outlive the page they cover. -->
    <gw-transition-overlay />
  `,
  styles: `
    .content {
      position: relative;            /* What: creates a stacking context. */
      z-index: var(--gw-z-content);  /* Why: pages always sit above the fixed 3D canvas (3D guide step 02). */
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // What: instantiate preferences at startup. Why: its effect writes <html data-motion> before any page animates.
  private readonly prefs = inject(PreferencesService);
  protected readonly announcer = inject(RouteAnnouncerService);

  /** What: focus the page's <main> instead of following the #main hash. Why: a hash link would change the URL and can trip the router. */
  protected skipToMain(e: Event): void {
    e.preventDefault();
    document.querySelector<HTMLElement>('main')?.focus();
  }
}
