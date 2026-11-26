import { DOCUMENT, Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Accessibility glue for a single-page app.
 *
 * Problem: in an SPA, changing routes doesn't load a new page, so screen readers
 * don't announce anything, and keyboard focus is left on a link that no longer exists
 * (it falls back to <body>, the very top of the document).
 *
 * Fix, after every in-app navigation:
 *  1. announce the new page title in a polite live region;
 *  2. if focus was lost, move it to the page's <main> (tabindex="-1"), so Tab continues from the content.
 *     Pages that place focus themselves (hero input, error headline) are left alone.
 */
@Injectable({ providedIn: 'root' })
export class RouteAnnouncerService {
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  /** Text for the app shell's live region. */
  readonly message = signal('');

  constructor() {
    let first = true;
    inject(Router).events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      if (first) { first = false; return; } // What: skip the initial page load. Why: the browser already announces a fresh load.
      afterNextRender(() => { // What: wait until the new page has rendered (and set its title). Why: we announce the NEW title and focus the NEW main.
        this.message.set(this.doc.title);
        const active = this.doc.activeElement;
        if (!active || active === this.doc.body) {
          this.doc.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
        }
      }, { injector: this.injector });
    });
  }
}

// In plain English: "After each page change, tell screen readers where they are and put the keyboard back on the content."
