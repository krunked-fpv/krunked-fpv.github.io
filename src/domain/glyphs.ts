import { fnv1a32 } from '../art/swissEmblem';
import type { Category } from '../types/project';

export const GLYPH_NAMES = [
  'Gamepad2', 'Telescope', 'Disc3', 'Receipt', 'FlaskRound', 'Languages', 'Scale', 'Activity',
  'Hexagon', 'Hammer', 'Swords', 'NotebookPen', 'FlaskConical', 'Orbit', 'Code2', 'AppWindow',
  'Radar', 'Bot', 'Wrench', 'Cpu',
  'Mountain', 'Castle', 'CircuitBoard', 'Flame', 'Crown', 'Compass', 'Crosshair', 'Dna',
  'Rocket', 'Sparkles', 'Layers', 'Shield', 'Terminal', 'Gauge', 'Spade', 'Gem',
  'Ghost', 'Blocks', 'Radio', 'Music',
] as const;
export type GlyphName = (typeof GLYPH_NAMES)[number];

const KEYWORDS: [RegExp, GlyphName][] = [
  [/(cards?|deck|poker|tarot|blackjack)/i, 'Spade'],
  [/(kartz?|karts?|rac(e|ing|er)|drift|turbo|speedway)/i, 'Gauge'],
  [/(skybreaker|dogfight|fighter|jet|rocket|launch)/i, 'Rocket'],
  [/(sky|star|astro)/i, 'Telescope'],
  [/(discogs|vinyl)/i, 'Disc3'],
  [/(audio|music|beat|daw)/i, 'Music'],
  [/(radio|signal|sdr)/i, 'Radio'],
  [/(tax|ledger)/i, 'Receipt'],
  [/alchem/i, 'FlaskRound'],
  [/(learn|language)/i, 'Languages'],
  [/(clause|legal)/i, 'Scale'],
  [/(sre|chaos)/i, 'Activity'],
  [/swarm/i, 'Hexagon'],
  [/(circuit|pcb|chip|silicon|wire|hardware)/i, 'CircuitBoard'],
  [/(tower|spire|citadel|castle|fortress|bastion|keep)/i, 'Castle'],
  [/(throne|crown|king|empire|royale)/i, 'Crown'],
  [/\b(cells?|biology|biotech|bioluminesc\w*|dna|stem\s*cells?|microbes?|flora|spores?)\b/i, 'Dna'],
  [/(lumia|diamond|gem|crystal|prism|jewel)/i, 'Gem'],
  [/(summit|alpine|mountain|peak|cliff|crag|climb|fred)/i, 'Mountain'],
  [/(dweller|gothic|catacomb|matchstick|lantern|flame|hades|norse|runic|krunkedfall)/i, 'Flame'],
  [/(well|abyss|descent|cavern|mine|shaft|layers)/i, 'Layers'],
  [/(tato|arena|shooter|sniper|horde|survivor|bullet)/i, 'Crosshair'],
  [/(quest|atlas|biome|metroidvania|explore|overworld|compass)/i, 'Compass'],
  [/dojo/i, 'Swords'],
  [/homework/i, 'NotebookPen'],
  [/(lab)/i, 'FlaskConical'],
  [/cosmos/i, 'Orbit'],
  [/(forge|bit)/i, 'Hammer'],
  [/(shield|guard|defense|knight)/i, 'Shield'],
  [/(ghost|phantom|crypt|haunt)/i, 'Ghost'],
  [/(cli|shell|term)/i, 'Terminal'],
  [/(block|voxel|craft|sandbox)/i, 'Blocks'],
  [/game/i, 'Gamepad2'],
];

const POOLS_BY_CATEGORY: Record<Category, readonly GlyphName[]> = {
  Game: ['Gamepad2', 'Swords', 'Compass', 'Crosshair', 'Crown', 'Flame', 'Shield', 'Sparkles'],
  App: ['AppWindow', 'Layers', 'Compass', 'Sparkles', 'Blocks', 'Terminal'],
  'Hardware/Sky': ['Radar', 'Telescope', 'Rocket', 'CircuitBoard', 'Radio'],
  'Audio/Vinyl': ['Disc3', 'Music', 'Radio', 'Activity'],
  Automation: ['Bot', 'CircuitBoard', 'Activity', 'Terminal', 'Cpu'],
  Engine: ['Cpu', 'Blocks', 'Layers', 'CircuitBoard', 'Hammer'],
  Utility: ['Wrench', 'Terminal', 'Layers', 'Blocks', 'Code2'],
};

export function pickGlyph(
  name: string,
  topics: string[],
  category: Category,
  override?: string,
  contextText?: string,
): GlyphName {
  if (override && (GLYPH_NAMES as readonly string[]).includes(override)) return override as GlyphName;
  const primary = `${name} ${topics.join(' ')}`.replace(/[-_]+/g, ' ');
  for (const [re, g] of KEYWORDS) if (re.test(primary)) return g;

  if (contextText) {
    const secondary = contextText.replace(/[-_]+/g, ' ');
    for (const [re, g] of KEYWORDS) if (re.test(secondary)) return g;
  }

  const pool = POOLS_BY_CATEGORY[category];
  if (pool && pool.length > 0) {
    return pool[fnv1a32(name.toLowerCase()) % pool.length]!;
  }
  return 'Code2';
}
