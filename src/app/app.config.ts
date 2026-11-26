import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // What: keep zone.js-based change detection. Why: the brief relies on NgZone.runOutsideAngular / zone.run for GSAP and the Three.js loop.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      // What: route params (":username") arrive as component inputs. Why: `username = input<string>()` instead of subscribing to ActivatedRoute.
      withComponentInputBinding(),
      // What: new pages start at the top; back/forward restores position. Why: without it, a profile can open scrolled halfway down.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // What: HttpClient using the browser's fetch(). Why: GithubService (Milestone 3) needs it; fetch exposes the x-ratelimit-reset header we use for "TOO MUCH HEAT".
    provideHttpClient(withFetch()),
  ],
};

// In plain English: "Zones on, router with URL-to-input binding and sane scrolling, and an HTTP client for GitHub."
