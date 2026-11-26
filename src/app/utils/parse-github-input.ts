/**
 * Turns whatever the visitor pasted into a GitHub username, or explains why not.
 *
 * Accepts (brief, "User flow" step 1):
 *   https://github.com/user   http://www.github.com/user   github.com/user
 *   @user   user
 * Also forgiving about: surrounding spaces, trailing slashes, ?query and #hash,
 * repo links (github.com/user/repo → user), and org links (github.com/orgs/acme → acme).
 */
export type ParseResult =
  | { ok: true; username: string }
  | { ok: false; reason: 'empty' | 'invalid' };

// What: GitHub's username rule: 1–39 chars, letters/digits/hyphens, no leading or trailing hyphen.
// Why: rejecting impossible names here saves an API call (and a rate-limit slot) on input that can never exist.
const USERNAME = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

// What: first path segments that are GitHub pages, not accounts.
// Why: "github.com/settings" passes the username regex but is not a person; sending it to the API wastes a request.
const RESERVED = new Set([
  'about', 'apps', 'collections', 'contact', 'customer-stories', 'dashboard', 'enterprise', 'events',
  'explore', 'features', 'issues', 'login', 'marketplace', 'new', 'notifications', 'pricing', 'pulls',
  'search', 'security', 'settings', 'signup', 'site', 'sponsors', 'team', 'topics', 'trending',
]);

export function parseGithubInput(raw: string): ParseResult {
  let s = raw.trim(); // What: drop pasted whitespace and newlines. Why: copy-paste often grabs a trailing space.
  if (!s) return { ok: false, reason: 'empty' };

  if (s.startsWith('@')) s = s.slice(1); // What: "@user" → "user". Why: people write handles that way.

  // What: anything that looks like a URL or a path gets parsed as one. Why: covers http(s)://, www., and bare "github.com/…".
  if (s.includes('/') || /^(https?:\/\/|www\.|github\.com)/i.test(s)) {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`; // What: URL() needs a scheme. Why: "github.com/user" alone throws.
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, ''); // What: normalise "www.github.com". Why: both hosts serve profiles.
    if (host !== 'github.com') return { ok: false, reason: 'invalid' }; // Why: gitlab.com/user or gist links are not GitHub profiles.

    const parts = url.pathname.split('/').filter(Boolean); // What: path segments without empty strings. Why: tolerates "//" and trailing "/".
    if (parts[0]?.toLowerCase() === 'orgs') parts.shift(); // What: "/orgs/acme/people" → "acme". Why: organization links are valid (they become a "CREW").
    s = parts[0] ?? '';
    if (RESERVED.has(s.toLowerCase())) return { ok: false, reason: 'invalid' };
  }

  return USERNAME.test(s) ? { ok: true, username: s } : { ok: false, reason: 'invalid' };
}

// In plain English: "Strip the URL, the @ and the junk; if what's left could be a GitHub username, use it."
