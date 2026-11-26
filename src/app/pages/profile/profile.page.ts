import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, combineLatest, map, of, startWith, switchMap, tap } from 'rxjs';
import { preloadAvatar } from '../../utils/avatar';
import { BrandMarkComponent } from '../../components/brand-mark/brand-mark.component';
import { ErrorScreenComponent } from '../../components/error-screen/error-screen.component';
import { LoadingScreenComponent } from '../../components/loading-screen/loading-screen.component';
import { TransitionLinkDirective } from '../../components/transition-overlay/transition-link.directive';
import { isGithubError, type GithubError } from '../../models/github-error';
import type { Profile } from '../../models/profile.model';
import { GithubService } from '../../services/github.service';
import { parseGithubInput } from '../../utils/parse-github-input';
import { ProfileHudComponent } from './profile-hud.component';

/** Everything the page can be showing. One union, so the template can't show two states at once. */
type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'error'; error: GithubError };

/**
 * /u/:username (deep-linkable). Owns the lookup state and picks the screen:
 * loading (until intro + data are both done) → error screen or the profile HUD.
 */
@Component({
  selector: 'gw-profile-page',
  imports: [BrandMarkComponent, ErrorScreenComponent, LoadingScreenComponent, ProfileHudComponent, TransitionLinkDirective],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly github = inject(GithubService);

  /** The ":username" URL segment (withComponentInputBinding). */
  readonly username = input.required<string>();

  private readonly retry$ = new Subject<void>(); // What: a "try again" signal from the error screen.

  /**
   * What: the page state, driven by the username and retry clicks.
   * Why switchMap: if the URL changes mid-request (back/forward between profiles), the old request is
   * dropped, so a slow response for the previous user can never overwrite the new one.
   */
  protected readonly state = toSignal(
    combineLatest([toObservable(this.username), this.retry$.pipe(startWith(undefined))]).pipe(
      switchMap(([name]) => this.load(name)),
    ),
    { initialValue: { status: 'loading' } as ProfileState },
  );

  /** True once the lookup has settled (profile or error). Feeds the loading screen's "data" half. */
  protected readonly settled = computed(() => this.state().status !== 'loading');

  /**
   * What: has the loading screen finished (intro + data + its exit) for the CURRENT lookup?
   * Why linkedSignal: it resets to false by itself whenever a new lookup starts (new username or Retry),
   * so the loading screen comes back without any manual bookkeeping.
   */
  protected readonly loadingDone = linkedSignal({
    source: () => this.state().status === 'loading',
    computation: () => false,
  });

  protected onRetry(): void {
    this.retry$.next();
  }

  private load(raw: string): Observable<ProfileState> {
    const parsed = parseGithubInput(raw); // What: validate deep links too. Why: /u/-oops can never exist; skip the API call and show "not found".
    if (!parsed.ok) return of({ status: 'error', error: { kind: 'not-found' } });
    return this.github.load(parsed.username).pipe(
      tap((profile) => preloadAvatar(profile.avatarUrl)), // What: start the avatar download while the loading screen is still up. Why: it's ready when the card appears.
      map((profile): ProfileState => ({ status: 'ready', profile })),
      catchError((e: unknown) => of<ProfileState>({ status: 'error', error: isGithubError(e) ? e : { kind: 'network' } })),
      startWith<ProfileState>({ status: 'loading' }), // What: show loading immediately on every (re)try.
    );
  }
}

// In plain English: "Watch the URL; for each username, show loading, then the profile or the right error,
// and start over when the visitor presses Retry."
