import type { ChronoDay, CommitLite, GhEvent, GhRepo } from '../types/github';
import { isBotCommit, isSelfDeckRepo } from './sanitize';

const DAY = 86_400_000;

/** Strict UTC midnight timestamp (zero local timezone / DST drift). */
export function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Strict UTC YYYY-MM-DD key, or null for invalid timestamps. */
export function utcDateKey(input: number | string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(utcDayStart(ms)).toISOString().slice(0, 10);
}

/** Daily UTC buckets, oldest -> newest. Non-bot commits preferred; push dates fallback. */
export function sparkline(commits: CommitLite[], pushDates: string[], now: number, days = 30): number[] {
  const buckets = new Array<number>(days).fill(0);
  const today = utcDayStart(now);
  const cleanCommits = commits.filter((c) => !isBotCommit(c));
  const src = cleanCommits.length ? cleanCommits.map((c) => c.date) : pushDates;
  for (const iso of src) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    const idx = days - 1 - Math.round((today - utcDayStart(ms)) / DAY);
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

export type HeatDay = ChronoDay;

/** Build an exact chronological UTC window of `days` empty ChronoDay buckets ending at `now`. */
export function emptyChronoWindow(now: number, days = 90): ChronoDay[] {
  const today = utcDayStart(now);
  const out: ChronoDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({
      date: new Date(today - i * DAY).toISOString().slice(0, 10),
      count: 0,
      repos: [],
    });
  }
  return out;
}

/** 90 daily UTC buckets from events (pushes/creates/releases weigh by 1) + repo pushed_at as floor signal. */
export function heatStrip(events: GhEvent[], repos: GhRepo[], now: number, days = 90): ChronoDay[] {
  const out = emptyChronoWindow(now, days);
  const byDate = new Map<string, { count: number; repos: Set<string> }>();
  for (const day of out) byDate.set(day.date, { count: 0, repos: new Set() });

  const seenPush = new Set<string>();
  for (const e of events) {
    if (e.type !== 'PushEvent' && e.type !== 'CreateEvent' && e.type !== 'ReleaseEvent') continue;
    const key = utcDateKey(e.created_at);
    if (!key) continue;
    const bucket = byDate.get(key);
    if (!bucket) continue;
    const slug = e.repo.name.split('/')[1] ?? e.repo.name;
    bucket.count += 1;
    if (slug) bucket.repos.add(slug);
    if (e.type === 'PushEvent' && slug) seenPush.add(`${slug}|${key}`);
  }

  for (const r of repos) {
    const key = utcDateKey(r.pushed_at);
    if (!key) continue;
    if (seenPush.has(`${r.name}|${key}`)) continue;
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.repos.add(r.name);
  }

  for (const day of out) {
    const rec = byDate.get(day.date);
    if (rec) {
      day.count = rec.count;
      day.repos = [...rec.repos].sort();
    }
  }
  return out;
}

export interface ChronoPulseInput {
  baked?: ChronoDay[] | null;
  snapshotAt?: string | null;
  events: GhEvent[];
  repos: GhRepo[];
  commitsByRepo?: Map<string, CommitLite[]>;
  now: number;
  days?: number;
}

/**
 * Fuse Tier-1 SnapshotV2 chronoPulse90d (true bot-excluded 90d commits) with live
 * events/commits without double-counting, strictly aligned to UTC YYYY-MM-DD buckets.
 */
export function buildChronoPulse(input: ChronoPulseInput): ChronoDay[] {
  const { baked, snapshotAt, events, repos, commitsByRepo, now, days = 90 } = input;
  const hasBaked = Array.isArray(baked) && baked.length > 0;

  if (!hasBaked) {
    const base = heatStrip(events, repos, now, days);
    if (!commitsByRepo || commitsByRepo.size === 0) return base;

    // Upgrade per-day counts using actual non-bot commits when available.
    const commitCounts = new Map<string, { count: number; repos: Set<string> }>();
    const seenSha = new Set<string>();
    for (const [slug, list] of commitsByRepo.entries()) {
      for (const c of list) {
        if (!c.sha || seenSha.has(c.sha) || isBotCommit(c)) continue;
        seenSha.add(c.sha);
        const key = utcDateKey(c.date);
        if (!key) continue;
        const rec = commitCounts.get(key) ?? { count: 0, repos: new Set() };
        rec.count += 1;
        rec.repos.add(slug);
        commitCounts.set(key, rec);
      }
    }
    return base.map((d) => {
      const c = commitCounts.get(d.date);
      if (!c) return d;
      const mergedRepos = new Set([...d.repos, ...c.repos]);
      return {
        date: d.date,
        count: Math.max(d.count, c.count),
        repos: [...mergedRepos].sort(),
      };
    });
  }

  const out = emptyChronoWindow(now, days);
  const byDate = new Map<string, { count: number; repos: Set<string> }>();
  for (const day of out) byDate.set(day.date, { count: 0, repos: new Set() });

  for (const entry of baked) {
    if (!entry || typeof entry.date !== 'string') continue;
    const bucket = byDate.get(entry.date);
    if (!bucket) continue;
    const cnt = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
    bucket.count = Math.max(bucket.count, cnt);
    if (Array.isArray(entry.repos)) {
      for (const slug of entry.repos) {
        if (typeof slug === 'string' && slug) bucket.repos.add(slug);
      }
    }
  }

  const snapMs = snapshotAt ? Date.parse(snapshotAt) : 0;
  const cutoff = Number.isFinite(snapMs) && snapMs > 0 ? snapMs : 0;

  // Add incremental post-snapshot commits (bot-excluded, SHA-deduplicated).
  const seenSha = new Set<string>();
  const postCommitDays = new Set<string>();
  if (commitsByRepo && cutoff > 0) {
    for (const [slug, list] of commitsByRepo.entries()) {
      for (const c of list) {
        if (!c.sha || seenSha.has(c.sha) || isBotCommit(c)) continue;
        const ms = Date.parse(c.date);
        if (!Number.isFinite(ms) || ms <= cutoff) continue;
        seenSha.add(c.sha);
        const key = utcDateKey(ms);
        if (!key) continue;
        const bucket = byDate.get(key);
        if (!bucket) continue;
        bucket.count += 1;
        bucket.repos.add(slug);
        postCommitDays.add(`${slug}|${key}`);
      }
    }
  }

  // Add incremental post-snapshot push/create/release events not already covered by commits.
  if (cutoff > 0) {
    for (const e of events) {
      if (e.type !== 'PushEvent' && e.type !== 'CreateEvent' && e.type !== 'ReleaseEvent') continue;
      const ms = Date.parse(e.created_at);
      if (!Number.isFinite(ms) || ms <= cutoff) continue;
      const slug = e.repo.name.split('/')[1] ?? e.repo.name;
      if (isSelfDeckRepo(slug)) continue;
      const key = utcDateKey(ms);
      if (!key || postCommitDays.has(`${slug}|${key}`)) continue;
      const bucket = byDate.get(key);
      if (!bucket) continue;
      bucket.count += 1;
      if (slug) bucket.repos.add(slug);
    }
  }

  for (const day of out) {
    const rec = byDate.get(day.date);
    if (rec) {
      day.count = rec.count;
      day.repos = [...rec.repos].sort();
    }
  }

  return out;
}

export function velocity(commits14d: number, pushes14d: number, sizeKb: number): number {
  return commits14d * 1 + pushes14d * 2 + Math.log10(Math.max(1, sizeKb));
}
