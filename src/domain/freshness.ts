import type { Freshness } from '../types/project';

const H = 3_600_000;
const D = 24 * H;

export function freshnessOf(lastActivityIso: string, now: number): Freshness {
  const parsed = Date.parse(lastActivityIso);
  if (!Number.isFinite(parsed)) return { tier: 'idle', ageMs: Number.POSITIVE_INFINITY, pulse: false };
  const ageMs = Math.max(0, now - parsed);
  if (ageMs < D) return { tier: 'fresh', ageMs, pulse: true };
  if (ageMs < 7 * D) return { tier: 'active', ageMs, pulse: ageMs < 3 * D };
  return { tier: 'idle', ageMs, pulse: false };
}

/** Compact delta: 45s, 12m, 3h, 5d, 3w, 4mo */
export function formatDelta(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.floor(d / 7)}w`;
  return `${Math.floor(d / 30)}mo`;
}

export function badgeLabel(iso: string, now: number): string {
  const f = freshnessOf(iso, now);
  const d = formatDelta(f.ageMs);
  if (f.tier === 'fresh') return `SHIPPED ${d} AGO`;
  if (f.tier === 'active') return `UPDATED ${d} AGO`;
  return `IDLE ${d}`;
}

/** Hardware LED palette aligned with SPEC.md §2 & §3.3 (Obsidian / Braun Daylight). */
export const TIER_COLOR = {
  fresh: '#FF4F00',
  active: '#F59E0B',
  idle: '#848F9E',
} as const;

export const TIER_CSS_VAR = {
  fresh: 'var(--led-hot)',
  active: 'var(--led-active)',
  idle: 'var(--ink-muted)',
} as const;

export const TIER_INK_VAR = {
  fresh: 'var(--led-hot-ink)',
  active: 'var(--led-active-ink)',
  idle: 'var(--ink-muted)',
} as const;
