import { useMemo } from 'react';
import { SPOTLIGHT_COUNT } from '../config/site';
import { cachedDeepHistory } from '../data/enrich';
import { buildProjects } from '../domain/buildProjects';
import { toShipLogs, type ShipLog } from '../domain/shiplog';
import { heatStrip, type HeatDay } from '../domain/activity';
import { fuzzyFields } from '../domain/fuzzy';
import { useDeck } from './deckStore';
import { useNow } from '../hooks/useNow';
import type { CommitLite, GhEvent } from '../types/github';
import type { Project, SortMode } from '../types/project';

const WEEK = 7 * 86_400_000;

/** Projects rebuilt when data, pins or the minute-bucket change (keeps freshness tiers honest). */
export function useProjects(): Project[] {
  const repos = useDeck((s) => s.repos);
  const events = useDeck((s) => s.events);
  const deep = useDeck((s) => s.deepEvents);
  const pins = useDeck((s) => s.vault.pins);
  const version = useDeck((s) => s.dataVersion);
  const now = useNow(60_000);
  return useMemo(
    () => buildProjects({ repos, events: [...events, ...deep], pins, now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, events, deep, pins, version, now],
  );
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

export function useShipLogs(projects: Project[]): ShipLog[] {
  const events = useAllEvents();
  return useMemo(() => {
    const idx = new Map<string, CommitLite>();
    for (const p of projects) for (const c of p.recentCommits) idx.set(c.sha, c);
    const hidden = new Set(useDeck.getState().repos.map((r) => r.name));
    const visible = new Set(projects.map((p) => p.name));
    return toShipLogs(
      events.filter((e) => {
        const n = e.repo.name.split('/')[1] ?? '';
        return !hidden.has(n) || visible.has(n);
      }),
      idx,
    );
  }, [events, projects]);
}

export function useHeat(): HeatDay[] {
  const events = useAllEvents();
  const repos = useDeck((s) => s.repos);
  const now = useNow(3_600_000);
  return useMemo(() => heatStrip(events, repos, now), [events, repos, now]);
}

export function spotlightOf(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)).slice(0, SPOTLIGHT_COUNT);
}

export function filterProjects(projects: Project[], filter: string): Project[] {
  if (filter === 'all') return projects;
  if (filter === 'live') return projects.filter((p) => p.kind === 'live');
  if (filter === 'recent') return projects.filter((p) => p.freshness.ageMs < WEEK);
  if (filter === 'pinned') return projects.filter((p) => p.pinned);
  if (filter.startsWith('cat:')) return projects.filter((p) => p.category === filter.slice(4));
  if (filter.startsWith('lang:')) return projects.filter((p) => p.language === filter.slice(5));
  if (filter.startsWith('topic:')) return projects.filter((p) => p.topics.includes(filter.slice(6)));
  return projects;
}

export function sortProjects(projects: Project[], sort: SortMode): Project[] {
  const a = [...projects];
  switch (sort) {
    case 'push':
      return a.sort((x, y) => Date.parse(y.lastActivityAt) - Date.parse(x.lastActivityAt));
    case 'created':
      return a.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
    case 'velocity':
      return a.sort((x, y) => y.velocityScore - x.velocityScore || y.sizeKb - x.sizeKb);
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
  if (!q.trim()) {
    return [...projects]
      .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
      .map((project) => ({ project, score: 0, nameIdx: [], commitSnippet: null }));
  }
  const hits: PaletteHit[] = [];
  for (const p of projects) {
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
    if (other && other.field >= 4 && (!nameRes || other.score > nameRes.score)) snippet = commitMsgs[other.field - 4] ?? null;
    hits.push({
      project: p,
      score: best,
      nameIdx: nameRes && nameRes.field === 0 ? nameRes.indices : [],
      commitSnippet: snippet,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}
