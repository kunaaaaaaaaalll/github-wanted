import { ChangeDetectionStrategy, Component, NgZone, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, FX, REVEAL, TIMING, exit } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';

/**
 * "MISSION PASSED · PROFILE LOADED" (spec 06): centred, gold, auto-hides after 1.6s.
 * The second half of the profile's hero moment. role="status" announces it politely.
 */
@Component({
  selector: 'gw-mission-toast',
  template: `
    <!-- The live region exists from the start; its text is set when the toast plays, so screen readers announce it. -->
    <div class="toast" role="status">
      @if (message()) {
        <p class="headline">Mission passed</p>
        <p class="sub">Profile loaded</p>
      }
    </div>
  `,
  styleUrl: './mission-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionToastComponent {
  private readonly zone = inject(NgZone);
  protected readonly message = signal(false);

  constructor() {
    gsapScope(({ host, reduced }) => {
      const toast = host.querySelector<HTMLElement>('.toast')!;
      const show = () => this.zone.run(() => this.message.set(true)); // Signal write from a GSAP callback → inside the zone (brief rule).

      if (reduced) {
        // Reduced motion: no slam. Appear, hold, short fade out (≤ 0.2s allowed).
        gsap.timeline()
          .call(show)
          .set(toast, { autoAlpha: 1 })
          .to(toast, { autoAlpha: 0, duration: DUR.fast, ease: EASE.exit }, `+=${TIMING.toastHold}`);
        return;
      }

      gsap.timeline({ delay: REVEAL.toast })
        .call(show)
        // GSAP guide 5.8: starts big and wide-spaced, letters "snap together" = the slam.
        .fromTo(toast,
          { autoAlpha: 0, scale: FX.slam.scale, letterSpacing: FX.slam.tracking },
          { autoAlpha: 1, scale: 1, letterSpacing: 'normal', duration: DUR.base, ease: EASE.reveal }) // DUR.base: the mapping agreed for the toast (guide's 0.45s → nearest token).
        // Hold 1.6s, then leave upward, faster than it arrived (exits ≈ 70%).
        .to(toast, { autoAlpha: 0, y: -DISTANCE.min, duration: exit(DUR.base), ease: EASE.exit }, `+=${TIMING.toastHold}`);
    });
  }
}

// In plain English: "Slam 'Mission passed' into the middle of the screen, hold it for a beat, then get out of the way."
