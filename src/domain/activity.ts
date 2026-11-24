import type { CommitLite, GhEvent, GhRepo } from '../types/github';

const DAY = 86_400_000;

function dayStart(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 14 daily buckets, oldest → newest. Commits preferred; push events fallback. */
export function sparkline(commits: CommitLite[], pushDates: string[], now: number, days = 14): number[] {
  const buckets = new Array<number>(days).fill(0);
  const today = dayStart(now);
  const src = commits.length ? commits.map((c) => c.date) : pushDates;
  for (const iso of src) {
    const idx = days - 1 - Math.round((today - dayStart(Date.parse(iso))) / DAY);
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

export interface HeatDay {
  date: string;
  count: number;
}

/** 90 daily buckets from events (pushes weigh by 1) + repo pushed_at as floor signal. */
export function heatStrip(events: GhEvent[], repos: GhRepo[], now: number, days = 90): HeatDay[] {
  const today = dayStart(now);
  const out: HeatDay[] = [];
  const idxOf = (iso: string) => days - 1 - Math.round((today - dayStart(Date.parse(iso))) / DAY);
  for (let i = days - 1; i >= 0; i--) out.push({ date: new Date(today - i * DAY).toISOString().slice(0, 10), count: 0 });
  const seenPush = new Set<string>();
  for (const e of events) {
    if (e.type !== 'PushEvent' && e.type !== 'CreateEvent' && e.type !== 'ReleaseEvent') continue;
    const i = idxOf(e.created_at);
    if (i >= 0 && i < days) (out[i] as HeatDay).count += 1;
    if (e.type === 'PushEvent') seenPush.add(`${e.repo.name.split('/')[1]}|${dayStart(Date.parse(e.created_at))}`);
  }
  for (const r of repos) {
    const key = `${r.name}|${dayStart(Date.parse(r.pushed_at))}`;
    if (seenPush.has(key)) continue;
    const i = idxOf(r.pushed_at);
    if (i >= 0 && i < days) (out[i] as HeatDay).count += 1;
  }
  return out;
}

export function velocity(commits14d: number, pushes14d: number, sizeKb: number): number {
  return commits14d * 1 + pushes14d * 2 + Math.log10(Math.max(1, sizeKb));
}
