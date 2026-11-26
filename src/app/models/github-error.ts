// =============================================================================
// Every way a lookup can fail, as a small closed set the UI can switch on.
// Why not pass HttpErrorResponse to components? Components would then need to
// know HTTP status codes and header names. This keeps that knowledge in one place
// (GithubService) and gives each state in spec 10 exactly one kind.
// =============================================================================

export type GithubError =
  | { kind: 'not-found' }                 // 404, or a name that can't be a GitHub username → "SUSPECT NOT FOUND"
  | { kind: 'rate-limited'; resetAt: number } // 403/429 with the limit used up → "TOO MUCH HEAT". resetAt = epoch ms.
  | { kind: 'network' }                   // no response at all (offline, DNS, CORS) → "SIGNAL LOST"
  | { kind: 'server'; status: number };   // GitHub answered with something unexpected (5xx…) → "SIGNAL LOST", different line

/** Type guard: is this thrown value one of ours? Why: catchError receives `unknown`. */
export function isGithubError(e: unknown): e is GithubError {
  return typeof e === 'object' && e !== null && 'kind' in e;
}
