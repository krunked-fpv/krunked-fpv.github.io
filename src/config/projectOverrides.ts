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
 * Static baseline curation layer for KRUNKED // MONOLITH STUDIO.
 * Keys are repository names; user overrides in `vault.curation[slug]` take precedence.
 * Non-purple OKLCH accents, bespoke scene identities, and punchy editorial copy across all 18 builds.
 */
export const PROJECT_OVERRIDES: Record<string, Partial<ProjectOverride>> = {
  'krunked-fpv.github.io': { hidden: true },

  discogs_sniper: {
    displayName: 'Discogs Sniper',
    tagline: 'Hardware vinyl-sniping console with bundle optimizer, haggle desk & 3D crate.',
    category: 'Audio/Vinyl',
    artStyle: 'prism',
    accent: 72,
    glyph: 'Radar',
    featured: true,
  },
  krunked_skymap: {
    displayName: 'Sky-Map',
    tagline: '60fps aerospace command deck tracking live ADS-B traffic, balloons & SGP4 orbits.',
    category: 'Hardware/Sky',
    artStyle: 'orbital',
    accent: 196,
    glyph: 'Telescope',
    featured: true,
  },
  discogs_collection: {
    displayName: 'Vinyl Vault',
    tagline: 'WebGL2 direct-drive turntable, twin-deck clash arena & tactile 3D record crate.',
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
    tagline: 'Adaptive Pokemon math workbench with tactile manipulatives & offline PokeNav camp.',
    category: 'Game',
    artStyle: 'synthwave',
    accent: 28,
    glyph: 'Gamepad2',
  },
  learning_languages: {
    displayName: 'Wanderling',
    tagline: 'Tactile world atlas of 16 living languages, 256 cultural units & 9 arcade games.',
    category: 'App',
    artStyle: 'orbital',
    accent: 214,
    glyph: 'Languages',
    featured: true,
  },
  ozias_laboratory: {
    displayName: "Ozias's Lab",
    tagline: 'Multi-grade math battle arena & Pokedex quest engineered for Ozias.',
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
    accent: 64,
    glyph: 'Hammer',
  },
  dojo: {
    displayName: 'Starlight Island',
    tagline: 'Cozy retro handheld RPG spanning 18 biomes and all 1,025 Pokemon.',
    category: 'Game',
    artStyle: 'synthwave',
    accent: 184,
    glyph: 'Swords',
  },
  taxquest: {
    displayName: 'TaxQuest',
    tagline: 'Air-gapped W-2/1099 tax sanctuary & audit-defense optimizer.',
    category: 'App',
    artStyle: 'prism',
    accent: 138,
    glyph: 'Receipt',
  },
  'bitforge-80': {
    displayName: 'BitForge-80',
    tagline: 'Tactile 128x128 pixel ASMR fantasy console & single-URL cartridge arcade.',
    category: 'Game',
    artStyle: 'groove',
    accent: 112,
    glyph: 'Cpu',
  },
  alchemists_ledger: {
    displayName: "Alchemist's Ledger",
    tagline: 'Zero-HUD apothecary studio, Suminagashi fluid workshop & kinetic cellar.',
    category: 'Game',
    artStyle: 'topo',
    accent: 42,
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
    tagline: 'Offline contract trap analyzer, junk-fee scalpel & precision counter-drafter.',
    category: 'Automation',
    artStyle: 'prism',
    accent: 206,
    glyph: 'Scale',
  },
  'chaosdeck-sre': {
    displayName: 'ChaosDeck SRE',
    tagline: 'Tactical cloud outage simulator & real-time incident commander roguelike.',
    category: 'Automation',
    artStyle: 'synthwave',
    accent: 32,
    glyph: 'Activity',
  },
  greg_n_friends: {
    displayName: 'WildPulse',
    tagline: 'Real-time bio-telemetry radar & kinetic wildlife command deck.',
    category: 'Hardware/Sky',
    artStyle: 'groove',
    accent: 128,
    glyph: 'Radar',
  },
  violets_homework: {
    displayName: 'Firefly Sanctuary',
    tagline: "Violet's twilight firefly learning bench & calm study sanctuary.",
    category: 'App',
    artStyle: 'topo',
    accent: 92,
    glyph: 'NotebookPen',
  },
  starlight_v2: {
    displayName: 'Starlight v2',
    tagline: 'Next-gen architectural prototype currently initializing on the bench.',
    category: 'Engine',
    artStyle: 'orbital',
    accent: 202,
    glyph: 'Wrench',
  },
};
