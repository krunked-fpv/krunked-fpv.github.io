import { cyrb53 } from '../../art/hash';
import { remapHue } from '../../art/color';

const KNOWN: Record<string, string> = {
  JavaScript: '#E8C547',
  TypeScript: '#3B82F6',
  HTML: '#FF6B35',
  CSS: '#22C55E',
  Python: '#38BDF8',
  Rust: '#EA7D4C',
  Go: '#0EA5E9',
  Shell: '#10B981',
  Shader: '#F59E0B',
  GLSL: '#F59E0B',
  C: '#94A3B8',
  'C++': '#60A5FA',
};

export function langColor(lang: string | null): string {
  if (!lang) return 'var(--ink-muted)';
  return KNOWN[lang] ?? `oklch(0.72 0.13 ${remapHue(cyrb53(lang) % 360)})`;
}

export interface LanguageSlice {
  name: string;
  bytes: number;
  pct: number;
  color: string;
}

export function topLanguages(languages: Record<string, number> | undefined, limit = 5): LanguageSlice[] {
  if (!languages) return [];
  const entries = Object.entries(languages).filter(([, b]) => typeof b === 'number' && b > 0);
  const total = entries.reduce((sum, [, b]) => sum + b, 0);
  if (total <= 0) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, bytes]) => ({
      name,
      bytes,
      pct: Math.max(0.5, (bytes / total) * 100),
      color: langColor(name),
    }));
}

export function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
