// =============================================================================
// Raw API data → Profile. Pure functions (no Angular, no HTTP), so every rule
// here is unit-tested in isolation.
// =============================================================================
import type { GithubEventDto, GithubRepoDto, GithubUserDto } from '../models/github-api.models';
import type { LanguageShare, Mission, Profile, WantedLevel } from '../models/profile.model';

/** Repos per request (brief: per_page=100). Exported so the service and the "truncated" flag agree. */
export const REPOS_PER_PAGE = 100;
/** How many ticker headlines to keep. Why: the ticker loops; more than this is never read. */
const MAX_NEWS = 12;
/** Skill stats show the top 5 languages (spec 06). */
const TOP_LANGUAGES = 5;

export function toProfile(user: GithubUserDto, repos: GithubRepoDto[], events: GithubEventDto[]): Profile {
  const own = repos.filter((r) => !r.fork); // What: drop forks. Why: a fork's stars and language belong to someone else's work.
  return {
    login: user.login,
    displayName: user.name?.trim() || user.login, // What: name, or login if empty. Why: many accounts never set a name.
    avatarUrl: user.avatar_url,
    url: user.html_url,
    bio: user.bio?.trim() || null,           // What: blank bios count as missing. Why: spec 10 hides the line entirely.
    location: user.location?.trim() || null,
    joinedYear: new Date(user.created_at).getUTCFullYear(), // UTC: a Jan 1st 00:30 signup shouldn't show the previous year in some time zones.
    isOrg: user.type === 'Organization',
    stats: {
      repos: user.public_repos,   // What: GitHub's own count (forks included). Why: matches what visitors see on github.com.
      followers: user.followers,
      following: user.following,
      gists: user.public_gists,
    },
    totalStars: own.reduce((sum, r) => sum + r.stargazers_count, 0),
    wantedLevel: wantedLevel(user.followers),
    languages: topLanguages(own),
    missions: toMissions(own),
    news: toNews(user.login, events),
    reposTruncated: user.public_repos > REPOS_PER_PAGE, // What: one page can't hold them all. Why: the UI can say totals cover the latest 100.
  };
}

/** Spec 06 tiers: 0–9 → 1 ★, 10–49 → 2, 50–199 → 3, 200–999 → 4, 1000+ → 5. */
export function wantedLevel(followers: number): WantedLevel {
  if (followers >= 1000) return 5;
  if (followers >= 200) return 4;
  if (followers >= 50) return 3;
  if (followers >= 10) return 2;
  return 1;
}

/** Top languages by number of own repos (brief: from each repo's `language` field). */
export function topLanguages(own: GithubRepoDto[]): LanguageShare[] {
  const counts = new Map<string, number>();
  for (const r of own) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const withLanguage = [...counts.values()].reduce((a, b) => a + b, 0);
  if (withLanguage === 0) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) // What: most repos first, ties alphabetical. Why: a stable order, so reloads don't shuffle bars.
    .slice(0, TOP_LANGUAGES)
    .map(([name, count]) => ({ name, count, share: count / withLanguage, percent: Math.round((count / withLanguage) * 100) }));
}

/** Own repos as missions: most stars first, then most recently pushed. */
export function toMissions(own: GithubRepoDto[]): Mission[] {
  return own
    .map((r) => ({
      name: r.name,
      description: r.description?.trim() || null,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      pushedAt: r.pushed_at,
    }))
    .sort((a, b) => b.stars - a.stars || (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '')); // ISO dates sort correctly as strings.
}

/**
 * Event feed → ticker headlines (spec 11 voice).
 * Consecutive pushes to the same repo merge into one line ("pushed 7 commits to x"),
 * otherwise a busy day would fill the ticker with near-identical lines.
 */
export function toNews(login: string, events: GithubEventDto[]): string[] {
  const lines: string[] = [];
  let push: { repo: string; commits: number; known: boolean } | null = null; // What: the push run being merged.

  const flushPush = () => {
    if (!push) return;
    const what = push.known ? `${push.commits} ${push.commits === 1 ? 'commit' : 'commits'} to` : 'to';
    lines.push(`${login} pushed ${what} ${push.repo}`); // Spec 11: "{user} pushed 3 commits to {repo}".
    push = null;
  };

  for (const e of events) {
    const repo = shortRepo(login, e.repo.name);
    if (e.type === 'PushEvent') {
      const size = e.payload.size;
      if (push && push.repo === repo) {
        push.commits += size ?? 0;
        push.known &&= size !== undefined;
      } else {
        flushPush();
        push = { repo, commits: size ?? 0, known: size !== undefined };
      }
      continue;
    }
    flushPush();
    const line = describe(login, repo, e);
    if (line) lines.push(line);
    if (lines.length >= MAX_NEWS) break;
  }
  flushPush();
  return lines.slice(0, MAX_NEWS);
}

/** One non-push event → a headline, or null for event types that would only be noise. */
function describe(login: string, repo: string, e: GithubEventDto): string | null {
  const p = e.payload;
  switch (e.type) {
    case 'CreateEvent':
      if (p.ref_type === 'repository') return `${login} opened a new operation: ${repo}`; // Spec 11, exact.
      if (p.ref_type === 'tag' && p.ref) return `${login} tagged ${p.ref} on ${repo}`;
      return null; // Branch creation: too frequent to be news.
    case 'ReleaseEvent':
      return p.action === 'published' && p.release?.tag_name ? `${login} shipped ${p.release.tag_name} of ${repo}` : null;
    case 'PullRequestEvent':
      if (p.action === 'opened') return `${login} opened a pull request on ${repo}`;
      if (p.action === 'closed' && p.pull_request?.merged) return `${login} merged a pull request into ${repo}`;
      return null;
    case 'IssuesEvent':
      return p.action === 'opened' ? `${login} filed a report on ${repo}` : null;
    case 'ForkEvent':
      return `${login} forked ${repo}`;
    case 'WatchEvent':
      return `${login} starred ${repo}`;
    default:
      return null;
  }
}

/** "torvalds/linux" → "linux" when it's the user's own repo; other people's repos keep the owner. */
function shortRepo(login: string, fullName: string): string {
  const [owner, name] = fullName.split('/');
  return owner?.toLowerCase() === login.toLowerCase() && name ? name : fullName;
}

// In plain English: "Ignore forks, add up stars, rank languages and repos, pick the wanted level from
// followers, and turn recent activity into short radio-style headlines."
