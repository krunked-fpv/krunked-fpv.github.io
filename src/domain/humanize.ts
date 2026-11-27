import { stripHtmlAndEmojis } from './sanitize';

const ACRONYMS = new Set([
  'ai', 'sre', 'fpv', 'ui', 'api', 'cli', 'ml', 'rpg', 'pwa',
  'qr', 'dsp', 'gpu', 'sdk', 'edu', '2d', '3d', 'hud', 'rf',
  'vtx', 'osd', 'pid', 'gps', 'svg', 'json', 'iot', 'led', 'rgb',
  'cpu', 'ci', 'cd',
]);

export function humanizeName(name: string): string {
  const clean = stripHtmlAndEmojis(name);
  if (!clean) return '';
  return clean
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export interface TaglineContext {
  name?: string;
  commitMessages?: readonly string[];
  isPwa?: boolean;
  kind?: 'live' | 'code';
}

const FEATURE_SIGNALS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bco-?op\b/i, 'co-op action'],
  [/\bsplit-?screen\b/i, 'split-screen multiplayer'],
  [/\bkart/i, 'arcade kart racing'],
  [/\bdogfight/i, 'arcade dogfighter'],
  [/\bmetroidvania\b/i, 'interconnected Metroidvania'],
  [/\brogueli[kt]e\b/i, 'action roguelite'],
  [/\bplatformer\b/i, 'precision platformer'],
  [/\bboss\s*rush\b/i, 'boss-rush combat'],
  [/\bwall-?(?:climb|sling)\b/i, 'wall-sling traversal'],
  [/\bboard\s*zoom\b|\bcolor\s*editor\b/i, 'synesthetic puzzle'],
  [/\bwebgl2\b/i, 'WebGL2 renderer'],
  [/\bprocedural\s+atlas\b/i, 'procedural pixel atlas'],
  [/\bbiomes?\b/i, 'multi-biome worlds'],
  [/\bweapons?\b.*\bupgrades?\b|\bupgrades?\b.*\benemies\b/i, 'upgrades & boss progression'],
  [/\benemy\s+drops?\b|\bcrate\b/i, 'arena loot waves'],
  [/\bmountain\b|\bsummit\b/i, 'alpine summit ascent'],
  [/\bcustom\s*pack\b|\bpackmanager\b/i, 'custom asset packs'],
  [/\bgamepad\b|\bcontroller\b|\btouch\s*stick/i, 'gamepad & touch controls'],
];

export function fallbackTagline(
  category: string,
  language: string | null,
  context?: TaglineContext,
): string {
  const cat = stripHtmlAndEmojis(category) || 'Software';
  const lang = stripHtmlAndEmojis(language);

  if (context) {
    const corpus = stripHtmlAndEmojis(
      [context.name ?? '', ...(context.commitMessages ?? [])].join(' ').replace(/[-_]+/g, ' '),
    );
    const hits: string[] = [];
    for (const [re, label] of FEATURE_SIGNALS) {
      if (re.test(corpus) && !hits.includes(label)) {
        hits.push(label);
        if (hits.length >= 3) break;
      }
    }
    if (hits.length > 0) {
      const lead =
        cat === 'Game'
          ? 'Playable web game'
          : context.kind === 'live'
            ? `Interactive ${cat.toLowerCase()} build`
            : `${cat} build`;
      const suffix = context.isPwa ? ' · offline PWA' : lang ? ` · ${lang}` : '';
      return `${lead} featuring ${hits.join(', ')}${suffix}.`;
    }
    if (context.kind === 'live') {
      const prefix = cat === 'Game' ? 'Browser-playable arcade world' : `Live ${cat.toLowerCase()} build`;
      return lang ? `${prefix} built with ${lang}.` : `${prefix}.`;
    }
  }

  return lang ? `${cat} build · ${lang}` : `${cat} build`;
}
