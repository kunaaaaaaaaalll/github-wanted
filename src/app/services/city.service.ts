import { Injectable, NgZone, inject, signal } from '@angular/core';
import type { CityEngine, CityShot } from '../three/city-engine'; // What: type-only import. Why: a value import would pull three.js into the initial bundle (3D guide, wall #5).

/** 'pending' while three.js downloads, 'ready' once the first frame is on screen, 'unavailable' when WebGL is missing or lost. */
export type CityStatus = 'pending' | 'ready' | 'unavailable';

/**
 * Shared handle on the one city scene.
 * Why a service? The city lives in the app shell (behind every page), but pages
 * need to talk to it: the loading screen flies the camera, the hero brings it back,
 * full-screen errors pause it. They call this instead of reaching into the DOM.
 */
@Injectable({ providedIn: 'root' })
export class CityService {
  private readonly zone = inject(NgZone);

  /** Discrete state only (3D guide: "signals carry discrete state, never per-frame values"). */
  readonly status = signal<CityStatus>('pending');

  /** The engine, once created. Undefined while loading or when WebGL is unavailable. */
  engine?: CityEngine;

  /** The shot the app wants. Why remember it? On a deep link the engine may arrive after the page asked; the backdrop applies this on creation. */
  shot: CityShot = 'hero';

  /**
   * Point the camera at a shot. Safe to call any time: resolves immediately when there's no engine
   * (still downloading, or no WebGL), so callers never wait on decoration.
   */
  setShot(shot: CityShot, animate: boolean): Promise<void> {
    this.shot = shot;
    const engine = this.engine;
    if (!engine) return Promise.resolve();
    return this.zone.runOutsideAngular(() => engine.setShot(shot, animate)); // Outside: starts a GSAP tween; must not wake change detection per frame.
  }
}
