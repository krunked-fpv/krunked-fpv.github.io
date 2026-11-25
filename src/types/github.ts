export interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  has_pages: boolean;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  size: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
}

export interface GhEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: {
    ref?: string | null;
    ref_type?: string;
    head?: string;
    before?: string;
    size?: number;
    action?: string;
    number?: number;
    pull_request?: { merged?: boolean; title?: string; number?: number };
    release?: { tag_name?: string; name?: string };
  };
  created_at: string;
}

export interface CommitLite {
  sha: string;
  /** Sanitized single-line message with zero raw HTML or Unicode emojis. */
  message: string;
  date: string;
  author: string;
  url?: string;
}

export interface CommitsEntry {
  pushedAt: string;
  /** Up to 15 most recent non-bot commits. */
  commits: CommitLite[];
  /** Optional 30 daily UTC buckets (oldest -> newest) baked by Tier-1 harvester. */
  commits30d?: number[];
  commits30dTotal?: number;
  commits90dTotal?: number;
}

export type SnapshotSourceMode = 'live-github-bake' | 'preserved-cache' | 'offline-fallback';

export interface SnapshotManifest {
  url: string | null;
  name: string | null;
  shortName: string | null;
  themeColor: string | null;
  iconUrl: string | null;
}

export interface SnapshotProbe {
  candidateUrl: string | null;
  resolvedUrl: string | null;
  liveVerified: boolean;
  httpStatus: number | null;
  /** True on HTTP >= 400 or GitHub Pages soft-404 ("Site not found"). */
  isNotFound: boolean;
  /** Explicit link[rel~=manifest] or valid JSON web app manifest. */
  isPwa: boolean;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  /** Strict hex color (#RGB/#RGBA/#RRGGBB/#RRGGBBAA) or null. */
  themeColor: string | null;
  /** Sanitized absolute http(s) URL or null. */
  ogImage: string | null;
  /** Scored manifest / apple-touch-icon / favicon http(s) URL or null. */
  iconUrl: string | null;
  manifest: SnapshotManifest | null;
  probedAt: string;
}

/** Alias used by Tier-2 live probe modules. */
export type LiveProbeMeta = SnapshotProbe;

/** Canonical UTC day bucket shared across SnapshotV2, selectors, and Chrono-Pulse UI. */
export interface ChronoDay {
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** Bot-excluded human commit/ship count on this UTC day. */
  count: number;
  /** Sorted unique repo slugs active on this UTC day. */
  repos: string[];
}

export type ChronoPulseDay = ChronoDay;

/** Interactive sprint/day window selected in the 90d Chrono-Pulse scrubber. */
export interface ChronoWindow {
  startDate: string;
  endDate: string;
  startIdx: number;
  endIdx: number;
  totalCount: number;
  repos: string[];
}

export interface SnapshotTotals {
  totalRepos: number;
  /** Verified live visible apps (excluding hidden self-deck & dead 404 Pages). */
  liveApps: number;
  verifiedPages: number;
  deadPages: number;
  commits30d: number;
  commits90d: number;
  lastPushAt: string | null;
}

/** Backward-tolerant snapshot container accepted by Tier-2 loader. */
export interface SnapshotFile {
  schemaVersion?: 'SnapshotV2' | 2;
  generatedAt: string;
  owner?: string;
  sourceMode?: SnapshotSourceMode;
  user: GhUser | null;
  repos: GhRepo[];
  events: GhEvent[];
  commits: Record<string, CommitsEntry>;
  /** repo slug -> { languageName: byteCount } */
  languages?: Record<string, Record<string, number>>;
  /** repo slug -> verified Pages/HTML/manifest probe */
  probes?: Record<string, SnapshotProbe>;
  /** Exact 90 chronological UTC days (oldest -> newest). */
  chronoPulse90d?: ChronoDay[];
  totals?: SnapshotTotals;
}

/** Strict V2 payload emitted by scripts/build-snapshot.mjs. */
export interface SnapshotV2 extends SnapshotFile {
  schemaVersion: 'SnapshotV2';
  owner: string;
  sourceMode: SnapshotSourceMode;
  languages: Record<string, Record<string, number>>;
  probes: Record<string, SnapshotProbe>;
  chronoPulse90d: ChronoDay[];
  totals: SnapshotTotals;
}
