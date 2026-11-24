import type { Category } from '../types/project';

export const GLYPH_NAMES = [
  'Gamepad2', 'Telescope', 'Disc3', 'Receipt', 'FlaskRound', 'Languages', 'Scale', 'Activity',
  'Hexagon', 'Hammer', 'Swords', 'NotebookPen', 'FlaskConical', 'Orbit', 'Code2', 'AppWindow',
  'Radar', 'Bot', 'Wrench', 'Cpu',
] as const;
export type GlyphName = (typeof GLYPH_NAMES)[number];

const KEYWORDS: [RegExp, GlyphName][] = [
  [/(sky|star|astro)/i, 'Telescope'],
  [/(discogs|vinyl|audio)/i, 'Disc3'],
  [/(tax|ledger)/i, 'Receipt'],
  [/alchem/i, 'FlaskRound'],
  [/(learn|language)/i, 'Languages'],
  [/(clause|legal)/i, 'Scale'],
  [/(sre|chaos)/i, 'Activity'],
  [/swarm/i, 'Hexagon'],
  [/dojo/i, 'Swords'],
  [/homework/i, 'NotebookPen'],
  [/(lab)/i, 'FlaskConical'],
  [/cosmos/i, 'Orbit'],
  [/(forge|bit)/i, 'Hammer'],
  [/game/i, 'Gamepad2'],
];

const BY_CATEGORY: Record<Category, GlyphName> = {
  Game: 'Gamepad2',
  App: 'AppWindow',
  'Hardware/Sky': 'Radar',
  'Audio/Vinyl': 'Disc3',
  Automation: 'Bot',
  Engine: 'Cpu',
  Utility: 'Wrench',
};

export function pickGlyph(name: string, topics: string[], category: Category, override?: string): GlyphName {
  if (override && (GLYPH_NAMES as readonly string[]).includes(override)) return override as GlyphName;
  const hay = `${name} ${topics.join(' ')}`;
  for (const [re, g] of KEYWORDS) if (re.test(hay)) return g;
  return BY_CATEGORY[category] ?? 'Code2';
}
