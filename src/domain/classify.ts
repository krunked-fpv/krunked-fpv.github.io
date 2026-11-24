import type { Category, ProjectKind } from '../types/project';

const RULES: [RegExp, Category][] = [
  [/(game|tycoon|quest|arcade|rpg|dojo)|(^|[-_\s])80($|[-_\s])/i, 'Game'],
  [/(sky|star|astro|fpv|drone|\bmap)/i, 'Hardware/Sky'],
  [/(discogs|vinyl|audio|music|synth)/i, 'Audio/Vinyl'],
  [/(\bbot\b|automat|\bai\b|[-_]ai\b|sniper|agent|\bsre\b|[-_]sre\b)/i, 'Automation'],
];

export function classify(
  text: { name: string; topics: string[]; description: string | null },
  kind: ProjectKind,
  sizeKb: number,
  override?: Category,
): Category {
  if (override) return override;
  const hay = `${text.name} ${text.topics.join(' ')} ${text.description ?? ''}`;
  for (const [re, cat] of RULES) if (re.test(hay)) return cat;
  if (kind === 'live') return 'App';
  return sizeKb < 200 ? 'Utility' : 'Engine';
}
