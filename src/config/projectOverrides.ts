import type { ArtStyle, Category } from '../types/project';

export interface ProjectOverride {
  displayName: string;
  tagline: string;
  category: Category;
  /** Accent hue 0-360 (OKLCH, remapped outside 245-340 purple band). Overrides auto-derived hue. */
  accent: number;
  /** Absolute http(s) or site-relative image URL used instead of generated art. */
  screenshot: string;
  /** Force a specific live http(s) URL (otherwise homepage / verified GitHub Pages is resolved). */
  launchUrl: string;
  artStyle: ArtStyle;
  /** Lucide icon name from src/domain/glyphs.ts GLYPH_NAMES. */
  glyph: string;
  /** Exclude this repo from the deck by default (revealable via Show Hidden filter). */
  hidden: boolean;
  /** Always eligible for the spotlight. */
  featured: boolean;
}

/**
 * Static baseline curation layer. Keys are repository names.
 * User-level overrides saved in `vault.curation[slug]` take precedence over this map.
 * Art styles are deliberately diversified across categories to avoid visual repetition.
 */
export const PROJECT_OVERRIDES: Record<string, Partial<ProjectOverride>> = {
  'krunked-fpv.github.io': { hidden: true },
  'maul-forge': { category: 'Game', artStyle: 'topo' },
  krunked_skymap: { category: 'Hardware/Sky', artStyle: 'orbital' },
  discogs_sniper: { category: 'Audio/Vinyl', artStyle: 'groove' },
  discogs_collection: { category: 'Audio/Vinyl', artStyle: 'groove' },
  taxquest: { category: 'Game', artStyle: 'prism' },
  swarm_tycoon: { category: 'Game', artStyle: 'orbital' },
  'bitforge-80': { category: 'Game', artStyle: 'synthwave' },
  alchemists_ledger: { category: 'Game', artStyle: 'topo' },
  dojo: { category: 'Game', artStyle: 'orbital' },
  greg_n_friends: { category: 'Game', artStyle: 'synthwave' },
  'chaosdeck-sre': { category: 'Automation', artStyle: 'orbital' },
  'clausehound-ai': { category: 'Automation', artStyle: 'prism' },
  learning_languages: { category: 'App', artStyle: 'prism' },
  ozias_laboratory: { category: 'App', artStyle: 'topo' },
};
