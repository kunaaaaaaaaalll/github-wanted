// =============================================================================
// The app's own model of a "suspect": everything the profile HUD shows, already
// derived. Components render it; they never compute stats or touch raw API JSON.
// =============================================================================

/** 1–5 stars. Spec 06 tiers by followers: 0–9, 10–49, 50–199, 200–999, 1000+. */
export type WantedLevel = 1 | 2 | 3 | 4 | 5;

export interface LanguageShare {
  name: string;
  count: number;   // What: how many of the user's own repos use it.
  share: number;   // What: count / repos-with-a-language, 0–1. Why: spec 06: bar fill width = share of repos.
  percent: number; // What: share as a whole-number percent for the label.
}

/** A repository, as a card in the mission log. */
export interface Mission {
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  forks: number;
  pushedAt: string | null;
}

export interface Profile {
  login: string;
  /** Display name, falling back to the login when the user has no name set. */
  displayName: string;
  avatarUrl: string;
  url: string;
  bio: string | null;      // null → hide the line (spec 10)
  location: string | null; // null → hide the line; minimap says "Location unknown"
  joinedYear: number;      // "In the city since 2019"
  isOrg: boolean;          // true → label the card "CREW" instead of "SUSPECT"
  stats: { repos: number; followers: number; following: number; gists: number };
  totalStars: number;      // Cash counter: sum of stars on the user's own (non-fork) repos.
  wantedLevel: WantedLevel;
  languages: LanguageShare[]; // Top 5. Empty when there are no owned repos (skill stats hidden).
  missions: Mission[];        // Own repos, most stars first. The UI shows 6, then "Show all missions".
  news: string[];             // Ticker headlines, newest first. Empty → "Quiet on the streets."
  /** True when the user has more than the 100 repos one request returns, so stars/languages cover the 100 most recently updated. */
  reposTruncated: boolean;
}
