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
 * Static baseline curation layer for KRUNKED STUDIO. Keys are repository names.
 * User-level overrides saved in `vault.curation[slug]` take precedence over this map.
 * Art styles, glyphs, and non-purple OKLCH accents are curated so zero neighboring builds repeat style or hue.
 */
export const PROJECT_OVERRIDES: Record<string, Partial<ProjectOverride>> = {
  'krunked-fpv.github.io': { hidden: true },

  discogs_sniper: {
    displayName: 'Discogs Sniper',
    tagline: 'Hardware vinyl-sniping console with bundle optimizer, haggle desk & 3D crate.',
    category: 'Audio/Vinyl',
    artStyle: 'prism',
    accent: 28,
    glyph: 'Radar',
    featured: true,
  },
  krunked_skymap: {
    displayName: 'Sky-Map',
    tagline: '60fps aerospace command deck — live ADS-B traffic, balloons & SGP4 orbits.',
    category: 'Hardware/Sky',
    artStyle: 'orbital',
    accent: 196,
    glyph: 'Telescope',
    featured: true,
  },
  discogs_collection: {
    displayName: 'Vinyl Vault',
    tagline: 'WebGL2 direct-drive turntable, twin-deck clash arena & tactile 3D crate.',
    category: 'Audio/Vinyl',
    artStyle: 'groove',
    accent: 46,
    glyph: 'Disc3',
    featured: true,
  },
  'chroma-cosmos': {
    displayName: 'Chroma Cosmos',
    tagline: 'Hi-bit cosmic coloring roguelike starring Violet, Lumi & Nova.',
    category: 'Game',
    artStyle: 'topo',
    accent: 162,
    glyph: 'Orbit',
    featured: true,
  },
  pokemath: {
    displayName: 'PokeMath',
    tagline: 'Adaptive Pokemon math workbench with manipulatives & offline PokeNav camp.',
    category: 'Game',
    artStyle: 'synthwave',
    accent: 20,
    glyph: 'Gamepad2',
  },
  learning_languages: {
    displayName: 'Wanderling',
    tagline: 'Tactile atlas of 16 living languages, 256 cultural units & 9 arcade games.',
    category: 'App',
    artStyle: 'orbital',
    accent: 218,
    glyph: 'Languages',
    featured: true,
  },
  ozias_laboratory: {
    displayName: "Ozias's Lab",
    tagline: 'Multi-grade math battle arena & Pokedex quest built for Ozias.',
    category: 'App',
    artStyle: 'groove',
    accent: 146,
    glyph: 'FlaskConical',
  },
  'maul-forge': {
    displayName: 'Maul-Forge',
    tagline: '2.5D Warcraft-style mazing tower defense with hybrid elemental fusions.',
    category: 'Game',
    artStyle: 'topo',
    accent: 68,
    glyph: 'Hammer',
  },
  dojo: {
    displayName: 'Starlight Island',
    tagline: 'Cozy retro handheld RPG across 18 biomes and all 1,025 Pokemon.',
    category: 'Game',
    artStyle: 'synthwave',
    accent: 184,
    glyph: 'Swords',
  },
  taxquest: {
    displayName: 'TaxQuest',
    tagline: 'Air-gapped W-2/1099 tax sanctuary & audit defense optimizer.',
    category: 'App',
    artStyle: 'prism',
    accent: 138,
    glyph: 'Receipt',
  },
  'bitforge-80': {
    displayName: 'BitForge-80',
    tagline: 'Tactile 128x128 pixel ASMR console & single-URL cartridge arcade.',
    category: 'Game',
    artStyle: 'groove',
    accent: 192,
    glyph: 'Cpu',
  },
  alchemists_ledger: {
    displayName: "Alchemist's Ledger",
    tagline: 'Zero-HUD apothecary studio, Suminagashi fluid workshop & kinetic cellar.',
    category: 'Game',
    artStyle: 'topo',
    accent: 38,
    glyph: 'FlaskRound',
  },
  swarm_tycoon: {
    displayName: 'Swarm Tycoon',
    tagline: 'Isometric semiconductor cleanroom & autonomous AI silicon foundry sim.',
    category: 'Game',
    artStyle: 'orbital',
    accent: 156,
    glyph: 'Hexagon',
  },
  'clausehound-ai': {
    displayName: 'ClauseHound',
    tagline: 'Offline contract trap analyzer, junk-fee scalpel & counter-drafter.',
    category: 'Automation',
    artStyle: 'prism',
    accent: 206,
    glyph: 'Scale',
  },
  'chaosdeck-sre': {
    displayName: 'ChaosDeck SRE',
    tagline: 'Tactical cloud outage simulator & incident commander roguelike.',
    category: 'Automation',
    artStyle: 'synthwave',
    accent: 34,
    glyph: 'Activity',
  },
  greg_n_friends: {
    displayName: 'WildPulse',
    tagline: 'Real-time bio-telemetry & kinetic wildlife command deck.',
    category: 'Hardware/Sky',
    artStyle: 'orbital',
    accent: 118,
    glyph: 'Radar',
  },
  violets_homework: {
    displayName: 'Firefly Sanctuary',
    tagline: "Violet's interactive twilight firefly learning & study sanctuary.",
    category: 'App',
    artStyle: 'synthwave',
    accent: 86,
    glyph: 'NotebookPen',
  },
  starlight_v2: {
    displayName: 'Starlight v2',
    tagline: 'Next-gen architecture prototype currently initializing on the bench.',
    category: 'Engine',
    artStyle: 'orbital',
    accent: 202,
    glyph: 'Wrench',
  },
};
