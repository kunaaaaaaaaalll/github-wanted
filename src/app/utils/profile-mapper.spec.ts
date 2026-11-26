import type { GithubEventDto, GithubRepoDto, GithubUserDto } from '../models/github-api.models';
import type { WantedLevel } from '../models/profile.model';
import { toNews, toProfile, topLanguages, wantedLevel } from './profile-mapper';

const user = (over: Partial<GithubUserDto> = {}): GithubUserDto => ({
  login: 'octo', name: 'Octo Cat', avatar_url: 'a', html_url: 'h', bio: 'Builds things', location: 'Port Solara',
  type: 'User', public_repos: 3, public_gists: 1, followers: 42, following: 7, created_at: '2019-01-01T00:30:00Z', ...over,
});
const repo = (over: Partial<GithubRepoDto> = {}): GithubRepoDto => ({
  name: 'r', full_name: 'octo/r', html_url: 'u', description: null, fork: false, language: 'TypeScript',
  stargazers_count: 0, forks_count: 0, pushed_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', ...over,
});
const ev = (type: string, name: string, payload: GithubEventDto['payload'] = {}): GithubEventDto => ({
  type, repo: { name }, created_at: '2024-01-01T00:00:00Z', payload,
});

describe('wantedLevel', () => {
  const tiers: Array<[number, WantedLevel]> = [[0, 1], [9, 1], [10, 2], [49, 2], [50, 3], [199, 3], [200, 4], [999, 4], [1000, 5], [250000, 5]];
  for (const [followers, level] of tiers) it(`${followers} followers → ${level}`, () => expect(wantedLevel(followers)).toBe(level));
});

describe('toProfile', () => {
  it('ignores forks for stars, languages and missions', () => {
    const p = toProfile(user(), [
      repo({ name: 'a', stargazers_count: 10, language: 'Go' }),
      repo({ name: 'b', stargazers_count: 5, language: 'Go' }),
      repo({ name: 'f', stargazers_count: 900, fork: true, language: 'C' }),
    ], []);
    expect(p.totalStars).toBe(15);
    expect(p.missions.map((m) => m.name)).toEqual(['a', 'b']);
    expect(p.languages.map((l) => l.name)).toEqual(['Go']);
  });

  it('falls back to login and hides blank bio/location', () => {
    const p = toProfile(user({ name: '  ', bio: '', location: null }), [], []);
    expect(p.displayName).toBe('octo');
    expect(p.bio).toBeNull();
    expect(p.location).toBeNull();
  });

  it('flags organizations, join year (UTC) and truncated repo lists', () => {
    const p = toProfile(user({ type: 'Organization', public_repos: 250 }), [], []);
    expect(p.isOrg).toBeTrue();
    expect(p.joinedYear).toBe(2019);
    expect(p.reposTruncated).toBeTrue();
  });

  it('handles zero repos', () => {
    const p = toProfile(user({ public_repos: 0 }), [], []);
    expect(p.missions).toEqual([]);
    expect(p.languages).toEqual([]);
    expect(p.totalStars).toBe(0);
  });
});

describe('topLanguages', () => {
  it('keeps the top 5 with shares of repos that have a language', () => {
    const langs = ['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E', 'F', null];
    const result = topLanguages(langs.map((language) => repo({ language })));
    expect(result.length).toBe(5);
    expect(result[0]).toEqual({ name: 'A', count: 3, share: 3 / 9, percent: 33 });
    expect(result.map((l) => l.name)).toEqual(['A', 'B', 'C', 'D', 'E']); // ties alphabetical
  });
});

describe('toNews', () => {
  it('merges consecutive pushes and uses the spec copy', () => {
    const lines = toNews('octo', [
      ev('PushEvent', 'octo/app', { size: 2 }),
      ev('PushEvent', 'octo/app', { size: 1 }),
      ev('CreateEvent', 'octo/new-thing', { ref_type: 'repository' }),
      ev('PushEvent', 'other/lib', { size: 1 }),
    ]);
    expect(lines).toEqual([
      'octo pushed 3 commits to app',
      'octo opened a new operation: new-thing',
      'octo pushed 1 commit to other/lib',
    ]);
  });

  it('omits the commit count when GitHub leaves it out', () => {
    expect(toNews('octo', [ev('PushEvent', 'octo/app')])).toEqual(['octo pushed to app']);
  });

  it('skips noise (branch creation, unknown types)', () => {
    expect(toNews('octo', [ev('CreateEvent', 'octo/x', { ref_type: 'branch', ref: 'dev' }), ev('GollumEvent', 'octo/x')])).toEqual([]);
  });
});
