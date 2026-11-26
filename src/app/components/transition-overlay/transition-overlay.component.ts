import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { TransitionService } from '../../services/transition.service';

/**
 * The two full-screen overlays used between routes. Lives in the app shell, so it
 * outlives every page. Pure decoration: hidden from assistive tech, and the
 * route change itself is announced by the new page title.
 */
@Component({
  selector: 'gw-transition-overlay',
  template: `
    <div class="wipe" #wipe><span class="edge edge-left"></span><span class="edge edge-right"></span></div>
    <div class="flash" #flash></div>
  `,
  styleUrl: './transition-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class TransitionOverlayComponent {
  private readonly wipe = viewChild.required<ElementRef<HTMLElement>>('wipe');
  private readonly flash = viewChild.required<ElementRef<HTMLElement>>('flash');

  constructor() {
    const transitions = inject(TransitionService);
    // What: hand the elements to the service once they exist. Why: view queries resolve after render.
    afterNextRender(() => transitions.register({ wipe: this.wipe().nativeElement, flash: this.flash().nativeElement }));
  }
}
