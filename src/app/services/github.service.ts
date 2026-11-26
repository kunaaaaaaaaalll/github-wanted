import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import type { GithubEventDto, GithubRepoDto, GithubUserDto } from '../models/github-api.models';
import type { GithubError } from '../models/github-error';
import type { Profile } from '../models/profile.model';
import { REPOS_PER_PAGE, toProfile } from '../utils/profile-mapper';

const API = 'https://api.github.com';

/**
 * Talks to the public GitHub REST API from the browser (brief: no token, no backend in v1).
 *
 * - load(username) emits one Profile, or errors with a GithubError (never a raw HttpErrorResponse).
 * - Results are cached in memory per username for the session, so going back and
 *   forth between profiles costs no extra requests (60/hour is the unauthenticated limit).
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly http = inject(HttpClient);

  // What: username (lowercased) → the shared Observable of its profile.
  // Why cache the Observable, not the Profile? Two callers asking at the same time
  // (e.g. the loading screen and the profile page) then share ONE set of requests.
  private readonly cache = new Map<string, Observable<Profile>>();

  // What: ask for GitHub's documented JSON media type.
  // Why only Accept? It's a CORS-safelisted header, so the browser sends no extra preflight (OPTIONS) request.
  // A custom header like X-GitHub-Api-Version would double every request's latency.
  private readonly headers = new HttpHeaders({ Accept: 'application/vnd.github+json' });

  load(username: string): Observable<Profile> {
    const key = username.toLowerCase(); // What: case-insensitive key. Why: GitHub logins are case-insensitive; "Torvalds" and "torvalds" are one person.
    const cached = this.cache.get(key);
    if (cached) return cached;

    const name = encodeURIComponent(username); // What: escape the path segment. Why: defence in depth; the parser already restricts characters.
    const request$ = this.get<GithubUserDto>(`/users/${name}`).pipe(
      // What: fetch the user first, then repos + events in parallel.
      // Why not all three at once? If the user doesn't exist, we spend 1 request instead of 3 of the 60/hour.
      switchMap((user) =>
        forkJoin({ // What: run both requests in parallel, emit once both complete. Why: the profile needs both.
          repos: this.get<GithubRepoDto[]>(`/users/${name}/repos`, { per_page: REPOS_PER_PAGE, sort: 'updated' }),
          events: this.get<GithubEventDto[]>(`/users/${name}/events/public`, { per_page: 30 }).pipe(
            // What: events are nice-to-have. If they fail for any reason except the rate limit, show the profile anyway.
            // Why: the ticker has its own empty state ("Quiet on the streets."); losing it shouldn't cost the whole page.
            catchError((e: GithubError) => (e.kind === 'rate-limited' ? throwError(() => e) : of([] as GithubEventDto[]))),
          ),
        }).pipe(map(({ repos, events }) => toProfile(user, repos, events))),
      ),
      catchError((e: GithubError) => {
        this.cache.delete(key); // What: forget failures. Why: "Retry" must actually retry, not replay the cached error.
        return throwError(() => e);
      }),
      // What: replay the last value to every subscriber, and keep it after they unsubscribe.
      // Why: refCount:false means leaving the page doesn't cancel and re-fetch; the profile stays cached.
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.cache.set(key, request$);
    return request$;
  }

  /** GET with error mapping: every failure leaves here as a GithubError. */
  private get<T>(path: string, params?: Record<string, string | number>): Observable<T> {
    return this.http
      .get<T>(`${API}${path}`, { headers: this.headers, params })
      .pipe(catchError((e: HttpErrorResponse) => throwError(() => toGithubError(e))));
  }
}

/**
 * HttpErrorResponse → GithubError. The one place that knows GitHub's status codes and headers.
 * Exported for unit tests.
 */
export function toGithubError(e: HttpErrorResponse, now = Date.now()): GithubError {
  if (e.status === 0) return { kind: 'network' }; // What: status 0 = no HTTP response at all (offline, DNS, blocked). Why: "SIGNAL LOST".
  if (e.status === 404) return { kind: 'not-found' };

  if (e.status === 403 || e.status === 429) {
    const remaining = e.headers.get('x-ratelimit-remaining');
    const reset = Number(e.headers.get('x-ratelimit-reset'));   // What: epoch SECONDS when the hourly window resets. Why: drives the "Lay low" countdown.
    const retryAfter = Number(e.headers.get('retry-after'));    // What: seconds to wait (GitHub's secondary/abuse limit).
    if (remaining === '0' && reset > 0) return { kind: 'rate-limited', resetAt: reset * 1000 };
    if (retryAfter > 0) return { kind: 'rate-limited', resetAt: now + retryAfter * 1000 };
    if (e.status === 429) return { kind: 'rate-limited', resetAt: now + 60_000 }; // What: limited but no hint. Why: one minute is GitHub's documented minimum wait.
  }
  return { kind: 'server', status: e.status }; // Anything else (5xx, odd 403s): GitHub answered, but not with data.
}

// In plain English: "Fetch the user, then their repos and events together, turn it all into a Profile,
// remember it per username, and translate every failure into one of four plain error kinds."
