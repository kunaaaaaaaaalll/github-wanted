import { Directive, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TransitionService } from '../../services/transition.service';

/**
 * <a gwLink="/">: an in-app link that navigates with the route wipe.
 *
 * Why not routerLink? routerLink navigates instantly; we need the wipe first.
 * Why still an <a href>? Real links keep everything people expect: middle-click
 * and Ctrl/Cmd-click open a new tab, "copy link" works, screen readers say "link".
 */
@Directive({
  selector: 'a[gwLink]',
  host: {
    '[attr.href]': 'href()',
    '(click)': 'onClick($event)',
  },
})
export class TransitionLinkDirective {
  readonly gwLink = input.required<string | readonly unknown[]>();

  private readonly router = inject(Router);
  private readonly transitions = inject(TransitionService);

  private readonly tree = computed(() => {
    const target = this.gwLink();
    return this.router.createUrlTree(typeof target === 'string' ? [target] : [...target]);
  });
  protected readonly href = computed(() => this.router.serializeUrl(this.tree()));

  protected onClick(e: MouseEvent): void {
    // What: let the browser handle anything but a plain left click. Why: new-tab and download gestures must keep working.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); // What: stop the full page load. Why: we navigate inside the app, after the wipe.
    void this.transitions.go(this.tree());
  }
}
