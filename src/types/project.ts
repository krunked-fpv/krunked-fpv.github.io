import type { CommitLite } from './github';

export type ThemeMode = 'obsidian' | 'daylight';
export type ArtTheme = ThemeMode;

export type Category = 'Game' | 'App' | 'Hardware/Sky' | 'Audio/Vinyl' | 'Automation' | 'Engine' | 'Utility';
export type ArtStyle = 'topo' | 'orbital' | 'synthwave' | 'prism' | 'groove';
export type FreshTier = 'fresh' | 'active' | 'idle';
export type ProjectKind = 'live' | 'code';

export type ViewMode = 'bento' | 'grid' | 'matrix';
export type SortMode = 'push' | 'created' | 'velocity' | 'alpha';
export type FilterKey = string; // 'live' | 'recent' | 'pinned' | 'all' | 'cat:<x>' | 'lang:<x>' | 'topic:<x>'

export type PeekTab = 'sandbox' | 'brief' | 'qr' | 'curate';
export type SettingsTab = 'prefs' | 'vault' | 'diagnostics';

export interface Freshness {
  tier: FreshTier;
  ageMs: number;
  pulse: boolean;
}

export interface Project {
  id: string;
  name: string;
  displayName: string;
  tagline: string;
  kind: ProjectKind;
  category: Category;
  launchUrl: string | null;
  sourceUrl: string;
  actionsUrl: string;
  language: string | null;
  /** Language byte breakdown from SnapshotV2 or /languages enrichment. */
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  forks: number;
  sizeKb: number;
  createdAt: string;
  pushedAt: string;
  lastActivityAt: string;
  freshness: Freshness;
  accentHue: number | null;
  art: { seed: number; style: ArtStyle; customStyle?: ArtStyle };
  glyph: string;
  isPwa: boolean;
  /** True when this repo is the host Forge Deck site (<owner>.github.io). */
  isSelfDeck: boolean;
  /** true = HTTP 200 non-404 verified; false = confirmed 404/soft-404; null = unprobed/custom. */
  liveVerified: boolean | null;
  ogImage: string | null;
  iconUrl: string | null;
  screenshot: string | null;
  pinned: boolean;
  featured: boolean;
  /** True when local vault.curation[slug] modifies this project. */
  hasCustomCuration: boolean;
  /** True when hidden via static override or user curation. */
  hidden: boolean;
  latestCommit: CommitLite | null;
  recentCommits: CommitLite[];
  /** 30 daily UTC commit/ship buckets (oldest -> newest). */
  sparkline: number[];
  pushes7d: number;
  commits30dTotal: number;
  velocityScore: number;
  defaultBranch: string;
}
