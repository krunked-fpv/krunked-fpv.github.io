import type { Category, ProjectKind } from '../types/project';
import { stripHtmlAndEmojis } from './sanitize';

const PRIMARY_RULES: [RegExp, Category][] = [
  [
    /(game|tycoon|quest|arcade|rpg|dojo|roguelike|roguelite|metroidvania|platformer|dogfight|shooter|kartz?|brawler|survivor|deckbuilder|puzzle|tower|throne|dungeon|hades|cards|dweller|skybreaker|tato)|(^|[-_\s])(80|td)($|[-_\s])/i,
    'Game',
  ],
  [/(sky|star|astro|fpv|drone|\bmap)/i, 'Hardware/Sky'],
  [/(discogs|vinyl|audio|music|synth)/i, 'Audio/Vinyl'],
  [/(\bbot\b|automat|\bai\b|[-_]ai\b|sniper|agent|\bsre\b|[-_]sre\b|chaos|telemetry)/i, 'Automation'],
];

const EXTRA_GAME_SIGNAL_RE =
  /\b(roguelike|roguelite|metroidvania|platformer|dogfighter|arcade|gamepad|boss\s*(?:arena|rush|fight|hp)|biomes?|playtest|co-?op|split-?screen|gunboot|chiptune|pixel-?art|16-?bit|8-?bit|enemies|weapons|kart|twin-?stick|falling-?block|deckbuilder)\b/i;

export function classify(
  text: { name: string; topics: string[]; description: string | null; extraText?: string | null },
  kind: ProjectKind,
  sizeKb: number,
  override?: Category,
): Category {
  if (override) return override;
  const primary = stripHtmlAndEmojis(`${text.name} ${text.topics.join(' ')} ${text.description ?? ''}`);
  const extra = text.extraText ? stripHtmlAndEmojis(text.extraText) : '';

  if (extra && EXTRA_GAME_SIGNAL_RE.test(extra)) {
    // Explicit game signals from probed README/commits beat ambiguous slug terms (e.g. skybreaker)
    if (!/(discogs|vinyl)/i.test(primary)) return 'Game';
  }

  for (const [re, cat] of PRIMARY_RULES) if (re.test(primary)) return cat;

  if (extra) {
    for (const [re, cat] of PRIMARY_RULES) if (re.test(extra)) return cat;
  }

  if (kind === 'live') return 'App';
  return sizeKb < 200 ? 'Utility' : 'Engine';
}
