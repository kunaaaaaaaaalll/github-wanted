// =============================================================================
// Raw GitHub REST API shapes (only the fields we use).
// Why only some fields? Typing the full payload would document data we never
// read; a smaller type makes it obvious what the UI depends on.
// Docs: https://docs.github.com/en/rest/users/users, /repos/repos, /activity/events
// =============================================================================

/** GET /users/{username} */
export interface GithubUserDto {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  location: string | null;
  type: 'User' | 'Organization' | 'Bot'; // What: account kind. Why: organizations become a "CREW" (spec 10).
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string; // ISO 8601, e.g. "2011-09-03T15:26:22Z"
}

/** One item of GET /users/{username}/repos */
export interface GithubRepoDto {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;              // What: true if this repo is a fork. Why: forks aren't the user's own "missions" or skills.
  language: string | null;    // What: GitHub's detected main language. Why: brief: languages come from this field, no per-repo calls.
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  updated_at: string;
}

/** One item of GET /users/{username}/events/public (a union; we narrow on `type`). */
export interface GithubEventDto {
  type: string; // e.g. 'PushEvent', 'CreateEvent', 'WatchEvent'…
  repo: { name: string }; // "owner/name"
  created_at: string;
  payload: {
    // PushEvent. `size` may be missing: GitHub stopped including commit counts in public push events in 2025.
    size?: number;
    // CreateEvent
    ref_type?: 'repository' | 'branch' | 'tag';
    ref?: string | null;
    // PullRequestEvent / IssuesEvent
    action?: string;
    pull_request?: { merged?: boolean };
    // ReleaseEvent
    release?: { tag_name?: string };
  };
}
