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

export function fallbackTagline(category: string, language: string | null): string {
  const cat = stripHtmlAndEmojis(category) || 'Software';
  const lang = stripHtmlAndEmojis(language);
  return lang ? `${cat} build · ${lang}` : `${cat} build`;
}
