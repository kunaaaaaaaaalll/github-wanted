import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, inject, input, output, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, STAGGER, TIMING, exit } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import { CityService } from '../../services/city.service';
import { BrandMarkComponent } from '../brand-mark/brand-mark.component';

/** Spec 11, exact. */
const TIPS = [
  'Stars are earned through repositories other devs love.',
  'Followers raise your wanted level.',
  'Forks are crew members running your plays.',
] as const;

/** Segments in the spinner. */
const SEGMENTS = 8;

/**
 * Loading (spec 09.2): the camera flies into the city while GitHub answers.
 *
 * It waits for BOTH (GSAP guide 5.4):
 *   - the intro: at least TIMING.loadingMin (1.2s), so fast data never skips the shot;
 *   - the data: `ready` turns true when the lookup has settled (profile or error).
 * Then it plays its own exit and emits `finished`. The parent swaps in the profile.
 */
@Component({
  selector: 'gw-loading-screen',
  imports: [BrandMarkComponent],
  templateUrl: './loading-screen.component.html',
  styleUrl: './loading-screen.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingScreenComponent {
  /** True once the lookup has settled (success or error). */
  readonly ready = input(false);
  /** Emitted after intro + data + exit animation. */
  readonly finished = output<void>();

  private readonly zone = inject(NgZone);
  private readonly city = inject(CityService);

  protected readonly tips = TIPS;
  protected readonly segments = Array.from({ length: SEGMENTS }, (_, i) => i);
  protected readonly tipIndex = signal(0);
  protected readonly stillSearching = signal(false);
  /** Screen-reader status text. Set after render so the live region exists first; otherwise some readers skip it. */
  protected readonly status = signal('');

  constructor() {
    // What: a promise that resolves once data has settled. Why: lets us await it alongside the intro.
    // Why not firstValueFrom? If the visitor leaves mid-load (Back button), toObservable completes without a value
    // and firstValueFrom REJECTS with EmptyError: an unhandled error in the console. This promise just never resolves then.
    const readyPromise = new Promise<void>((resolve) => {
      toObservable(this.ready).pipe(filter(Boolean), take(1)).subscribe(() => resolve());
    });

    // --- Timers (inside the zone: they change what the template shows, a few times in total) ---
    const still = setTimeout(() => {
      this.stillSearching.set(true); // Spec 09.2: after 6s, reassure.
      this.status.set('Still searching…');
    }, TIMING.stillSearching * 1000);
    inject(DestroyRef).onDestroy(() => clearTimeout(still));

    gsapScope(({ host, reduced, ctx }) => {
      this.zone.run(() => this.status.set('Loading profile')); // Spec 09.2: announce once.

      // --- Rotating tips: one per 2.5s. Outside-zone GSAP crossfade, index change back inside the zone. ---
      const nextTip = () => this.zone.run(() => this.tipIndex.update((i) => (i + 1) % TIPS.length));
      const tipLoop = gsap.delayedCall(TIMING.tipInterval, function rotate() {
        if (reduced) {
          nextTip(); // Reduced motion: swap the text, no animation.
        } else {
          gsap.timeline()
            .to('.tip-text', { autoAlpha: 0, duration: exit(DUR.fast), ease: EASE.exit })
            .call(nextTip)
            .to('.tip-text', { autoAlpha: 1, duration: DUR.fast, ease: EASE.enter });
        }
        tipLoop.restart(true); // What: schedule the next rotation. Why: delayedCall is one-shot; restarting it makes a loop that ctx.revert() can kill.
      });

      // --- Segmented spinner: one segment lights up after another (hard steps, no blur). ---
      if (!reduced) {
        const segs = host.querySelectorAll<HTMLElement>('.seg');
        const spin = gsap.timeline({ repeat: -1 });
        segs.forEach((seg, i) => {
          spin.to(seg, { autoAlpha: 1, duration: DUR.instant, ease: EASE.glitch }, i * DUR.instant) // What: segment i turns on at its slot. Why: steps read as a game HUD, not a web spinner.
              .to(seg, { autoAlpha: 0.25, duration: DUR.slow, ease: EASE.enter }, i * DUR.instant + DUR.instant); // What: then fades, leaving a short tail.
        });
      }

      // --- Intro: mark, tip, spinner in; camera flies to the GW tower; never shorter than 1.2s. ---
      const intro = gsap.timeline();
      if (!reduced) {
        intro
          .from('.brand', { autoAlpha: 0, duration: DUR.slow, ease: EASE.reveal })
          .from('.tip, .spinner-block', { autoAlpha: 0, y: DISTANCE.min, duration: DUR.base, ease: EASE.enter, stagger: STAGGER.list }, '<0.2');
      }
      intro.to({}, { duration: Math.max(0, TIMING.loadingMin - intro.duration()) }); // What: an empty tween as padding. Why: total length reaches the spec's 1.2s minimum.

      const flight = this.city.setShot('tower', true); // Spec 09.2/12: the camera flies to the GW tower (instant jump with reduced motion).

      Promise.all([intro.then(), flight, readyPromise]).then(() => ctx.add(() => {
        // What: everything is ready; play our exit, then hand over. Why: the profile should never pop in under a visible loading screen.
        gsap.to(host, {
          autoAlpha: 0,
          duration: reduced ? DUR.fast : exit(DUR.base), // Reduced motion: a short fade (≤ 0.2s allowed).
          ease: EASE.exit,
          onComplete: () => this.zone.run(() => this.finished.emit()), // What: output back inside the zone. Why: the parent swaps templates on it.
        });
      }));
    });
  }
}


// In plain English: "Fly to the tower, show a tip and a spinner, wait for both the shot and GitHub,
// then fade out and tell the profile page it's on."
