import { cyrb53 } from '../../art/hash';
import { remapHue } from '../../art/color';

const KNOWN: Record<string, string> = {
  JavaScript: '#E8C547',
  TypeScript: '#3B82F6',
  HTML: '#F0613A',
  Python: '#4FA3D1',
  Rust: '#D9825B',
  Go: '#38BDF8',
  Shell: '#86EFAC',
};

export function langColor(lang: string | null): string {
  if (!lang) return '#5C6570';
  return KNOWN[lang] ?? `oklch(0.75 0.13 ${remapHue(cyrb53(lang) % 360)})`;
}

export function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
