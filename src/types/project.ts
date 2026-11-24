import type { CommitLite } from './github';

export type Category = 'Game' | 'App' | 'Hardware/Sky' | 'Audio/Vinyl' | 'Automation' | 'Engine' | 'Utility';
export type ArtStyle = 'topo' | 'orbital' | 'synthwave' | 'prism' | 'groove';
export type FreshTier = 'fresh' | 'active' | 'idle';
export type ProjectKind = 'live' | 'code';

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
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  sizeKb: number;
  createdAt: string;
  pushedAt: string;
  lastActivityAt: string;
  freshness: Freshness;
  accentHue: number | null;
  art: { seed: number; style: ArtStyle };
  glyph: string;
  isPwa: boolean;
  ogImage: string | null;
  screenshot: string | null;
  pinned: boolean;
  featured: boolean;
  latestCommit: CommitLite | null;
  recentCommits: CommitLite[];
  sparkline: number[];
  pushes7d: number;
  velocityScore: number;
  defaultBranch: string;
}

export type ViewMode = 'bento' | 'grid' | 'matrix';
export type SortMode = 'push' | 'created' | 'velocity' | 'alpha';
export type FilterKey = string; // 'live' | 'recent' | 'pinned' | 'all' | 'cat:<x>' | 'lang:<x>' | 'topic:<x>'
