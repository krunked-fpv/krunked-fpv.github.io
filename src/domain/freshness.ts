import type { Freshness } from '../types/project';

const H = 3_600_000;
const D = 24 * H;

export function freshnessOf(lastActivityIso: string, now: number): Freshness {
  const ageMs = Math.max(0, now - Date.parse(lastActivityIso));
  if (ageMs < D) return { tier: 'fresh', ageMs, pulse: true };
  if (ageMs < 7 * D) return { tier: 'active', ageMs, pulse: ageMs < 3 * D };
  return { tier: 'idle', ageMs, pulse: false };
}

/** Compact delta: 45s, 12m, 3h, 5d, 3w, 4mo */
export function formatDelta(ms: number): string {
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

export const TIER_COLOR = { fresh: '#10B981', active: '#F59E0B', idle: '#5C6570' } as const;
