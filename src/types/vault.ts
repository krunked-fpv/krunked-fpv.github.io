import type { ArtStyle, Category, FilterKey, SortMode, ThemeMode, ViewMode } from './project';

export interface CurationOverride {
  /** Sanitized plain text, max 72 chars, zero emojis/HTML. */
  displayName?: string;
  /** Sanitized plain text, max 200 chars, zero emojis/HTML. */
  tagline?: string;
  category?: Category;
  /** Strict http(s) URL without embedded credentials. */
  launchUrl?: string;
  /** Accent hue 0..360 (remapped out of 245..340 purple/magenta band at render). */
  accent?: number;
  artStyle?: ArtStyle;
  hidden?: boolean;
  featured?: boolean;
}

export type UserCurationOverride = CurationOverride;

export interface VaultPrefs {
  view: ViewMode;
  sort: SortMode;
  filter: FilterKey;
  theme: ThemeMode;
  soundEnabled: boolean;
}

export interface VaultData {
  v: 2;
  /** Monotonic revision counter incremented on every write. */
  rev: number;
  updatedAt: number;
  pins: string[];
  prefs: VaultPrefs;
  curation: Record<string, CurationOverride>;
  seen: Record<string, string>;
}

export type VaultStoreName = 'localStorage' | 'indexedDB' | 'cookie';
export type CookieShedLevel = 'none' | 'seen' | 'curation' | 'pins';

export interface VaultStorageStatus {
  rev: number;
  updatedAt: number;
  cookieBytes: number;
  cookieBudget: number;
  cookieShedLevel: CookieShedLevel;
  stores: Record<VaultStoreName, boolean>;
  healthyCount: 0 | 1 | 2 | 3;
  lastHealedFrom: VaultStoreName | 'default' | 'none';
  lastRepairedStores: VaultStoreName[];
}

export interface KrunkedDeckConfigV2 {
  schema: 'KrunkedDeckConfigV2';
  exportedAt: string;
  /** Guaranteed strictly stripped of any PAT or secret fields. */
  state: VaultData;
}

export type PatScope = 'session' | 'device';

export interface PatStatus {
  configured: boolean;
  scope: PatScope | null;
  maskedHint: string;
}
