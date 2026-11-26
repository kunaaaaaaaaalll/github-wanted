import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gsap } from 'gsap';
import { DISTANCE, DUR, EASE, FX, REVEAL, STAGGER } from '../../animation/motion-tokens';
import { gsapScope } from '../../animation/gsap-scope';
import type { Profile } from '../../models/profile.model';
import { avatarSrc } from '../../utils/avatar';

/**
 * Character card (spec 06): avatar in a bracketed frame, name (H1), @login (cyan link),
 * bio, location + "In the city since YYYY". Tilts toward the cursor (≤ 8°) on desktop.
 */
@Component({
  selector: 'gw-character-card',
  templateUrl: './character-card.component.html',
  styleUrl: './character-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterCardComponent {
  readonly profile = input.required<Profile>();

  /** What: GitHub's CDN at 2× size (see utils/avatar). Why: 160 CSS px on a retina screen needs 320 real pixels to look sharp. */
  protected readonly avatar = computed(() => avatarSrc(this.profile().avatarUrl));

  constructor() {
    gsapScope(({ host, reduced, ctx }) => {
      if (reduced) return; // No entrance, no tilt (spec 08 reduced-motion mapping).

      // --- Entrance: the card's contents slide in after the panel itself (big before small) ---
      gsap.from(host.querySelectorAll('.frame, .identity > *'), {
        autoAlpha: 0, x: -DISTANCE.min, duration: DUR.base, ease: EASE.enter,
        stagger: STAGGER.list, delay: REVEAL.card,
      });

      // --- 3D tilt toward the cursor (spec 08: ≤ 8°, eased back on leave, off on touch) ---
      // What: only with a real mouse on desktop layouts. Why: spec 09.4 "character card (no tilt)" on mobile; touch has no hover.
      if (!window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches) return;
      const card = host.querySelector<HTMLElement>('.card')!;
      gsap.set(card, { transformPerspective: FX.tilt.perspective }); // What: perspective for rotateX/Y. Why: without it, a 3D rotation looks like a flat squash.
      // What: one reusable tween per axis (quickTo). Why: a new tween per mousemove would pile up hundreds per second.
      const toX = gsap.quickTo(card, 'rotationX', { duration: DUR.slow, ease: EASE.enter });
      const toY = gsap.quickTo(card, 'rotationY', { duration: DUR.slow, ease: EASE.enter });
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        const r = card.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;  // −0.5 (left edge) … 0.5 (right edge)
        const ny = (e.clientY - r.top) / r.height - 0.5;  // −0.5 (top) … 0.5 (bottom)
        toY(nx * 2 * FX.tilt.maxDeg);   // What: right side of the card turns away from the cursor… Why: the card "faces" the pointer.
        toX(-ny * 2 * FX.tilt.maxDeg);  // …and the top tips back when the cursor is above centre. Both capped at 8°.
      };
      const leave = () => { toX(0); toY(0); }; // What: ease back flat. Why: spec 08 "eased back to 0 on mouse leave".
      ctx.add(() => {
        card.addEventListener('pointermove', move); // Registered here = outside NgZone (gsapScope runs us there): no change detection per mouse move.
        card.addEventListener('pointerleave', leave);
        return () => { // What: a cleanup function for this context. Why: ctx.revert() on destroy removes the listeners too.
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerleave', leave);
        };
      });
    });
  }
}

// In plain English: "Show who this is; slide the details in after the panel; on desktop, let the card lean gently toward the mouse."
