import type { ChronoDay, ChronoWindow } from '../types/github';

export type { ChronoDay, ChronoWindow };

export interface ChronoDayInput {
  date: string;
  count: number;
  repos?: readonly string[];
}

const DAY_MS = 86_400_000;

function toUtcIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseUtcDateMs(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/** Normalizes any input series into exact `length` (default 90) chronological UTC ChronoDays. */
export function normalizeChronoDays(
  days: readonly ChronoDayInput[],
  length = 90,
  nowMs: number = Date.now(),
): ChronoDay[] {
  const targetLen = Math.max(1, Math.round(length));
  const raw = Array.isArray(days) ? days.slice(-targetLen) : [];
  const todayUtcMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );

  const normalized: ChronoDay[] = raw.map((entry, idx) => {
    const count = Math.max(0, Math.round(Number(entry?.count) || 0));
    const rawRepos = Array.isArray(entry?.repos) ? entry.repos : [];
    const repoSet = new Set<string>();
    for (const r of rawRepos) {
      const cleaned = String(r).trim();
      if (cleaned) repoSet.add(cleaned);
    }
    const repoList = Array.from(repoSet).sort();
    const fallbackMs = todayUtcMs - (raw.length - 1 - idx) * DAY_MS;
    const rawDate = typeof entry?.date === 'string' ? entry.date : '';
    const date = rawDate && parseUtcDateMs(rawDate) !== null ? rawDate.slice(0, 10) : toUtcIsoDate(fallbackMs);
    return { date, count, repos: repoList };
  });

  if (normalized.length === targetLen) return normalized;

  const firstMs = normalized.length > 0 ? parseUtcDateMs(normalized[0]!.date) : null;
  const anchorMs = firstMs !== null ? firstMs : todayUtcMs + DAY_MS;
  const padCount = targetLen - normalized.length;
  const padded: ChronoDay[] = [];
  for (let i = padCount; i >= 1; i--) {
    padded.push({
      date: toUtcIsoDate(anchorMs - i * DAY_MS),
      count: 0,
      repos: [],
    });
  }
  return padded.concat(normalized);
}

/** Builds a locked ChronoWindow aggregate over an inclusive index range. */
export function buildChronoWindow(
  days: readonly ChronoDay[],
  rawStartIdx: number,
  rawEndIdx: number,
): ChronoWindow | null {
  if (!days.length) return null;
  const a = Math.max(0, Math.min(days.length - 1, Math.min(rawStartIdx, rawEndIdx)));
  const b = Math.max(0, Math.min(days.length - 1, Math.max(rawStartIdx, rawEndIdx)));
  const startDay = days[a];
  const endDay = days[b];
  if (!startDay || !endDay) return null;

  let totalCount = 0;
  const repoSet = new Set<string>();
  for (let i = a; i <= b; i++) {
    const d = days[i]!;
    totalCount += d.count;
    for (const r of d.repos) repoSet.add(r);
  }
  return {
    startDate: startDay.date,
    endDate: endDay.date,
    startIdx: a,
    endIdx: b,
    totalCount,
    repos: Array.from(repoSet).sort(),
  };
}

/** Resolves an active window (by index or UTC date bounds) to an inclusive [startIdx, endIdx] tuple. */
export function resolveChronoWindowRange(
  activeWindow: { startDate: string; endDate: string; startIdx?: number; endIdx?: number } | null | undefined,
  days: readonly ChronoDay[],
): [number, number] | null {
  if (!activeWindow || !days.length) return null;
  if (
    typeof activeWindow.startIdx === 'number' &&
    typeof activeWindow.endIdx === 'number' &&
    Number.isInteger(activeWindow.startIdx) &&
    Number.isInteger(activeWindow.endIdx) &&
    activeWindow.startIdx >= 0 &&
    activeWindow.endIdx < days.length &&
    days[activeWindow.startIdx]?.date === activeWindow.startDate &&
    days[activeWindow.endIdx]?.date === activeWindow.endDate
  ) {
    return [
      Math.min(activeWindow.startIdx, activeWindow.endIdx),
      Math.max(activeWindow.startIdx, activeWindow.endIdx),
    ];
  }
  const startDate = activeWindow.startDate;
  const endDate = activeWindow.endDate || startDate;
  if (!startDate) return null;

  const startIdx = days.findIndex((d) => d.date >= startDate);
  let endIdx = -1;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]!.date <= endDate) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
  return [startIdx, endIdx];
}

/** Maps a day's commit/ship count into a 4-tier thermal scale matching --heat-0..3. */
export function thermalTier(count: number, maxCount: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  const ratio = maxCount > 0 ? count / maxCount : 1;
  if (ratio >= 0.65 || count >= 5) return 3;
  if (ratio >= 0.3 || count >= 2) return 2;
  return 1;
}

/** Concise active repo slug readout for tooltip/header display. */
export function formatRepoSummary(repos: readonly string[], maxShown = 3): string {
  if (!repos || repos.length === 0) return 'no active repos';
  if (repos.length <= maxShown) return repos.join(', ');
  return `${repos.slice(0, maxShown).join(', ')} +${repos.length - maxShown}`;
}

/** Builds a smoothed 3-day moving-average SVG polyline path for the Chrono-Pulse momentum envelope. */
export function buildMomentumPath(
  days: readonly ChronoDay[],
  baselineY: number,
  maxBarH: number,
  slotWidth = 4,
): string {
  if (!days.length) return '';
  const max = Math.max(1, ...days.map((d) => d.count));
  const pts: string[] = [];
  for (let i = 0; i < days.length; i++) {
    const prev = days[i - 1]?.count ?? days[i]!.count;
    const curr = days[i]!.count;
    const next = days[i + 1]?.count ?? curr;
    const avg = (prev + curr * 2 + next) / 4;
    const x = i * slotWidth + slotWidth * 0.5;
    const y = baselineY - (avg / max) * (maxBarH * 0.88);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
