import type { ArtStyle, Category } from '../types/project';

export interface ProjectOverride {
  displayName: string;
  tagline: string;
  category: Category;
  /** Accent hue 0–360 (OKLCH). Overrides the auto-derived colour. */
  accent: number;
  /** Absolute or site-relative image URL used instead of generated art. */
  screenshot: string;
  /** Force a specific live URL (otherwise homepage / GitHub Pages is resolved). */
  launchUrl: string;
  artStyle: ArtStyle;
  /** Lucide icon name from src/domain/glyphs.ts GLYPH_NAMES. */
  glyph: string;
  /** Exclude this repo from the deck entirely. */
  hidden: boolean;
  /** Always eligible for the spotlight. */
  featured: boolean;
}

/**
 * Curation layer. Keys are repository names. Everything is optional;
 * live GitHub data fills every gap. The categories below are editable guesses.
 *
 * Example:
 *   'dojo': { displayName: 'Dojo', tagline: 'Train. Repeat.', accent: 150, artStyle: 'synthwave' }
 */
export const PROJECT_OVERRIDES: Record<string, Partial<ProjectOverride>> = {
  'krunked-fpv.github.io': { hidden: true },
  krunked_skymap: { category: 'Hardware/Sky' },
  discogs_sniper: { category: 'Audio/Vinyl' },
  discogs_collection: { category: 'Audio/Vinyl' },
  taxquest: { category: 'Game' },
  swarm_tycoon: { category: 'Game' },
  'bitforge-80': { category: 'Game' },
  'chaosdeck-sre': { category: 'Game' },
  dojo: { category: 'Game' },
  'clausehound-ai': { category: 'Automation' },
};
