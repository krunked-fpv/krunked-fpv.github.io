import { useMemo } from 'react';
import { PROJECT_OVERRIDES } from '../config/projectOverrides';
import { SPOTLIGHT_COUNT } from '../config/site';
import { cachedCommits, cachedDeepHistory, cachedLanguages } from '../data/enrich';
import { buildChronoPulse, utcDateKey } from '../domain/activity';
import { buildProjects } from '../domain/buildProjects';
import { fuzzyFields } from '../domain/fuzzy';
import { toShipLogs, type ShipLog } from '../domain/shiplog';
import { useNow } from '../hooks/useNow';
import type { ChronoDay, ChronoWindow, CommitLite, GhEvent } from '../types/github';
import type { Project, SortMode } from '../types/project';
import { useDeck } from './deckStore';

const WEEK = 7 * 86_400_000;

export interface UseProjectsOptions {
  includeHidden?: boolean;
}

/** Projects rebuilt when data, pins, curation, or minute-bucket change (keeps freshness honest). */
export function useProjects(opts: UseProjectsOptions = {}): Project[] {
  const repos = useDeck((s) => s.repos);
  const events = useDeck((s) => s.events);
  const deep = useDeck((s) => s.deepEvents);
  const languages = useDeck((s) => s.languages);
  const pins = useDeck((s) => s.vault.pins);
  const curation = useDeck((s) => s.vault.curation);
  const showHidden = useDeck((s) => s.showHidden);
  const version = useDeck((s) => s.dataVersion);
  const now = useNow(60_000);
  const includeHidden = opts.includeHidden ?? showHidden;

  return useMemo(
    () =>
      buildProjects({
        repos,
        events: [...events, ...deep],
        pins,
        curation,
        includeHidden,
        languagesFor: (repo) => cachedLanguages(repo) ?? languages[repo],
        now,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, events, deep, languages, pins, curation, includeHidden, version, now],
  );
}

/** Number of non-fork, non-archived repositories currently hidden via static override or user curation. */
export function useHiddenCount(): number {
  const repos = useDeck((s) => s.repos);
  const curation = useDeck((s) => s.vault.curation);
  return useMemo(() => {
    let count = 0;
    for (const r of repos) {
      if (r.fork || r.archived) continue;
      const userOv = curation[r.name];
      const staticOv = PROJECT_OVERRIDES[r.name];
      const isHidden = userOv?.hidden !== undefined ? Boolean(userOv.hidden) : Boolean(staticOv?.hidden);
      if (isHidden) count += 1;
    }
    return count;
  }, [repos, curation]);
}

export function useAllEvents(): GhEvent[] {
  const events = useDeck((s) => s.events);
  const deep = useDeck((s) => s.deepEvents);
  const version = useDeck((s) => s.dataVersion);
  return useMemo(() => {
    const d = deep.length ? deep : cachedDeepHistory();
    const seen = new Set<string>();
    const all: GhEvent[] = [];
    for (const e of [...events, ...d]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      all.push(e);
    }
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, deep, version]);
}

function dateRangeOf(chrono?: ChronoWindow | string | null): { start: string; end: string } | null {
  if (!chrono) return null;
  if (typeof chrono === 'string') return { start: chrono, end: chrono };
  return chrono.startDate <= chrono.endDate
    ? { start: chrono.startDate, end: chrono.endDate }
    : { start: chrono.endDate, end: chrono.startDate };
}

export function useShipLogs(projects: Project[], chrono?: ChronoWindow | string | null): ShipLog[] {
  const events = useAllEvents();
  const repos = useDeck((s) => s.repos);
  const storeWindow = useDeck((s) => s.chronoWindow);
  const activeChrono = chrono === undefined ? storeWindow : chrono;

  return useMemo(() => {
    const idx = new Map<string, CommitLite>();
    for (const p of projects) for (const c of p.recentCommits) idx.set(c.sha, c);
    const allRepoNames = new Set(repos.map((r) => r.name));
    const visible = new Set(projects.filter((p) => !p.hidden).map((p) => p.name));
    const range = dateRangeOf(activeChrono);

    const filteredEvents = events.filter((e) => {
      const n = e.repo.name.split('/')[1] ?? '';
      if (allRepoNames.has(n) && !visible.has(n)) return false;
      if (range) {
        const key = utcDateKey(e.created_at);
        if (!key || key < range.start || key > range.end) return false;
      }
      return true;
    });

    return toShipLogs(filteredEvents, idx);
  }, [events, projects, repos, activeChrono]);
}

/** 90-day UTC Chrono-Pulse fusing SnapshotV2 baked commits with live events/commits. */
export function useChronoPulse(): ChronoDay[] {
  const baked = useDeck((s) => s.chronoPulse90d);
  const snapshotAt = useDeck((s) => s.snapshotAt);
  const events = useAllEvents();
  const repos = useDeck((s) => s.repos);
  const version = useDeck((s) => s.dataVersion);
  const now = useNow(3_600_000);

  return useMemo(() => {
    const commitsByRepo = new Map<string, CommitLite[]>();
    for (const r of repos) {
      const c = cachedCommits(r.name)?.commits;
      if (c && c.length > 0) commitsByRepo.set(r.name, c);
    }
    return buildChronoPulse({ baked, snapshotAt, events, repos, commitsByRepo, now, days: 90 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baked, snapshotAt, events, repos, version, now]);
}

/** Backward-compatible alias for useChronoPulse. */
export const useHeat = useChronoPulse;

function spotlightTier(p: Project): number {
  if (p.featured && (p.kind === 'live' || p.sizeKb > 0)) return 0;
  if (p.kind === 'live') return 1;
  if (p.sizeKb > 0) return 2;
  return 3; // empty sizeKb === 0 non-live repo: never ahead of real builds (SPEC.md §3.3)
}

export function spotlightOf(projects: Project[]): Project[] {
  return projects
    .filter((p) => !p.hidden)
    .sort((a, b) => {
      const tierDiff = spotlightTier(a) - spotlightTier(b);
      if (tierDiff !== 0) return tierDiff;
      const activityDiff = (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0);
      if (activityDiff !== 0) return activityDiff;
      return b.velocityScore - a.velocityScore;
    })
    .slice(0, SPOTLIGHT_COUNT);
}

/**
 * Ranks orbital constellation worlds with latest commits/activity first:
 * - First 6 occupy the inner ring (and mobile explode grid)
 * - Older worlds sit further out in the outer ring
 */
export function rankOrbitWorlds(projects: Project[]): Project[] {
  const visible = projects.filter((p) => !p.hidden);
  const live = visible.filter((p) => p.kind === 'live');
  const pool = live.length > 0 ? live : visible;
  return [...pool].sort((a, b) => {
    const aMs = Math.max(Date.parse(a.lastActivityAt) || 0, Date.parse(a.latestCommit?.date ?? '') || 0);
    const bMs = Math.max(Date.parse(b.lastActivityAt) || 0, Date.parse(b.latestCommit?.date ?? '') || 0);
    if (bMs !== aMs) return bMs - aMs;
    const fDiff = Number(b.featured) - Number(a.featured);
    if (fDiff !== 0) return fDiff;
    return b.velocityScore - a.velocityScore;
  });
}

export function filterProjects(
  projects: Project[],
  filter: string,
  chrono?: ChronoWindow | string | null,
  pulse?: ChronoDay[],
): Project[] {
  let out: Project[];
  if (filter === 'hidden') {
    out = projects.filter((p) => p.hidden);
  } else {
    const base = filter === 'all' ? projects : projects.filter((p) => !p.hidden);
    if (filter === 'all') out = base;
    else if (filter === 'live') out = base.filter((p) => p.kind === 'live');
    else if (filter === 'recent') out = base.filter((p) => p.freshness.ageMs < WEEK);
    else if (filter === 'pinned') out = base.filter((p) => p.pinned);
    else if (filter.startsWith('cat:')) out = base.filter((p) => p.category === filter.slice(4));
    else if (filter.startsWith('lang:')) out = base.filter((p) => p.language === filter.slice(5));
    else if (filter.startsWith('topic:')) out = base.filter((p) => p.topics.includes(filter.slice(6)));
    else out = base;
  }

  const range = dateRangeOf(chrono);
  if (!range) return out;

  const activeSlugs = new Set<string>();
  if (chrono && typeof chrono === 'object' && Array.isArray(chrono.repos)) {
    for (const slug of chrono.repos) activeSlugs.add(slug.toLowerCase());
  }
  if (Array.isArray(pulse)) {
    for (const day of pulse) {
      if (day.date >= range.start && day.date <= range.end) {
        for (const slug of day.repos) activeSlugs.add(slug.toLowerCase());
      }
    }
  }

  return out.filter((p) => {
    if (activeSlugs.has(p.name.toLowerCase())) return true;
    const pushedDay = utcDateKey(p.pushedAt);
    if (pushedDay && pushedDay >= range.start && pushedDay <= range.end) return true;
    return p.recentCommits.some((c) => {
      const d = utcDateKey(c.date);
      return Boolean(d && d >= range.start && d <= range.end);
    });
  });
}

export function sortProjects(projects: Project[], sort: SortMode): Project[] {
  const a = [...projects];
  switch (sort) {
    case 'push':
      return a.sort((x, y) => {
        const xMs = Math.max(Date.parse(x.lastActivityAt) || 0, Date.parse(x.latestCommit?.date ?? '') || 0);
        const yMs = Math.max(Date.parse(y.lastActivityAt) || 0, Date.parse(y.latestCommit?.date ?? '') || 0);
        return yMs - xMs;
      });
    case 'created':
      return a.sort((x, y) => (Date.parse(y.createdAt) || 0) - (Date.parse(x.createdAt) || 0));
    case 'velocity':
      return a.sort((x, y) => y.velocityScore - x.velocityScore || y.commits30dTotal - x.commits30dTotal || y.sizeKb - x.sizeKb);
    case 'alpha':
      return a.sort((x, y) => x.displayName.localeCompare(y.displayName));
  }
}

export interface FilterChip {
  key: string;
  label: string;
  count: number;
}

export function dynamicChips(projects: Project[]): FilterChip[] {
  const cats = new Map<string, number>();
  const langs = new Map<string, number>();
  const topics = new Map<string, number>();
  for (const p of projects) {
    if (p.hidden) continue;
    cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    if (p.language) langs.set(p.language, (langs.get(p.language) ?? 0) + 1);
    for (const t of p.topics) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const mk = (m: Map<string, number>, prefix: string) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ key: `${prefix}:${k}`, label: k, count: c }));
  return [...mk(cats, 'cat'), ...mk(langs, 'lang'), ...mk(topics, 'topic')];
}

export interface PaletteHit {
  project: Project;
  score: number;
  nameIdx: number[];
  commitSnippet: string | null;
}

export function searchProjects(projects: Project[], q: string): PaletteHit[] {
  const visible = projects.filter((p) => !p.hidden);
  if (!q.trim()) {
    return [...visible]
      .sort((a, b) => (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0))
      .map((project) => ({ project, score: 0, nameIdx: [], commitSnippet: null }));
  }
  const hits: PaletteHit[] = [];
  for (const p of visible) {
    const commitMsgs = p.recentCommits.map((c) => c.message).filter(Boolean);
    const nameRes = fuzzyFields(q, [
      { text: p.displayName, weight: 1 },
      { text: p.name, weight: 1 },
    ]);
    const other = fuzzyFields(q, [
      { text: p.topics.join(' '), weight: 0.7 },
      { text: p.category, weight: 0.7 },
      { text: p.language ?? '', weight: 0.7 },
      { text: p.tagline, weight: 0.5 },
      ...commitMsgs.map((m) => ({ text: m, weight: 0.5 })),
    ]);
    const best = Math.max(nameRes?.score ?? -1, other?.score ?? -1);
    if (best < 0) continue;
    let snippet: string | null = null;
    if (other && other.field >= 4 && (!nameRes || other.score > nameRes.score)) {
      snippet = commitMsgs[other.field - 4] ?? null;
    }
    hits.push({
      project: p,
      score: best,
      nameIdx: nameRes && nameRes.field === 0 ? nameRes.indices : [],
      commitSnippet: snippet,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export interface PaletteActionLike {
  id: string;
  label: string;
  hint?: string;
  keywords?: readonly string[];
}

export interface ActionHit<T extends PaletteActionLike = PaletteActionLike> {
  action: T;
  score: number;
  labelIdx: number[];
}

/** Ranked fuzzy search across command palette actions (label, hint, and synonyms/keywords). */
export function searchActions<T extends PaletteActionLike>(actions: readonly T[], q: string): ActionHit<T>[] {
  if (!q.trim()) {
    return actions.map((action) => ({ action, score: 0, labelIdx: [] }));
  }
  const hits: ActionHit<T>[] = [];
  for (const action of actions) {
    const res = fuzzyFields(q, [
      { text: action.label, weight: 1 },
      { text: action.keywords?.join(' ') ?? '', weight: 0.75 },
      { text: action.hint ?? '', weight: 0.65 },
    ]);
    if (!res) continue;
    hits.push({
      action,
      score: res.score,
      labelIdx: res.field === 0 ? res.indices : [],
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}
