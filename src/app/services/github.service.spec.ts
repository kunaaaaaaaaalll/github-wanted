import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { GithubError } from '../models/github-error';
import type { Profile } from '../models/profile.model';
import { GithubService, toGithubError } from './github.service';

const API = 'https://api.github.com';
const userJson = {
  login: 'octo', name: null, avatar_url: 'a', html_url: 'h', bio: null, location: null, type: 'User',
  public_repos: 1, public_gists: 0, followers: 3, following: 0, created_at: '2020-05-05T00:00:00Z',
};

describe('GithubService', () => {
  let service: GithubService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GithubService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify()); // What: fail if any request was left unanswered or unexpected.

  const flushHappyPath = (login = 'octo') => {
    http.expectOne(`${API}/users/${login}`).flush(userJson);
    http.expectOne((r) => r.url === `${API}/users/${login}/repos` && r.params.get('per_page') === '100' && r.params.get('sort') === 'updated').flush([]);
    http.expectOne((r) => r.url === `${API}/users/${login}/events/public`).flush([]);
  };

  it('loads user, then repos + events, into a Profile', () => {
    let result: Profile | undefined;
    service.load('octo').subscribe((p) => (result = p));
    flushHappyPath();
    expect(result?.login).toBe('octo');
    expect(result?.wantedLevel).toBe(1);
  });

  it('caches per username, case-insensitively', () => {
    service.load('octo').subscribe();
    flushHappyPath();
    let second: Profile | undefined;
    service.load('OCTO').subscribe((p) => (second = p)); // No new requests expected (verify() would fail).
    expect(second?.login).toBe('octo');
  });

  it('spends only one request on a missing user', () => {
    let error: GithubError | undefined;
    service.load('ghost').subscribe({ error: (e) => (error = e) });
    http.expectOne(`${API}/users/ghost`).flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    expect(error).toEqual({ kind: 'not-found' });
  });

  it('does not cache failures, so retry really retries', () => {
    service.load('octo').subscribe({ error: () => undefined });
    http.expectOne(`${API}/users/octo`).error(new ProgressEvent('error')); // status 0 → network
    service.load('octo').subscribe();
    flushHappyPath();
  });

  it('still shows the profile when only events fail', () => {
    let result: Profile | undefined;
    service.load('octo').subscribe((p) => (result = p));
    http.expectOne(`${API}/users/octo`).flush(userJson);
    http.expectOne((r) => r.url.endsWith('/repos')).flush([]);
    http.expectOne((r) => r.url.endsWith('/events/public')).flush(null, { status: 500, statusText: 'Oops' });
    expect(result?.news).toEqual([]);
  });
});

describe('toGithubError', () => {
  const err = (status: number, headers: Record<string, string> = {}) =>
    new HttpErrorResponse({ status, headers: new HttpHeaders(headers) });

  it('maps status 0 to network', () => expect(toGithubError(err(0))).toEqual({ kind: 'network' }));
  it('maps 404 to not-found', () => expect(toGithubError(err(404))).toEqual({ kind: 'not-found' }));
  it('maps an exhausted 403 to rate-limited using x-ratelimit-reset (seconds → ms)', () => {
    expect(toGithubError(err(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' })))
      .toEqual({ kind: 'rate-limited', resetAt: 1_700_000_000_000 });
  });
  it('uses retry-after for secondary limits', () => {
    expect(toGithubError(err(403, { 'retry-after': '30' }), 1000)).toEqual({ kind: 'rate-limited', resetAt: 31_000 });
  });
  it('treats other 403s and 5xx as server errors', () => {
    expect(toGithubError(err(403))).toEqual({ kind: 'server', status: 403 });
    expect(toGithubError(err(502))).toEqual({ kind: 'server', status: 502 });
  });
});
