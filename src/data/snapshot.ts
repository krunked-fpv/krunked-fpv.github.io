import { STORAGE_NS } from '../config/site';
import { sanitizeHttpUrl, stripHtmlAndEmojis } from '../domain/sanitize';
import type { ChronoDay, CommitsEntry, SnapshotFile, SnapshotProbe } from '../types/github';
import { sanitizeProbe } from './probe';
import { projectCommits, projectEvents, projectLanguages, projectRepos, projectUser } from './projections';

const SNAP_AT_KEY = `${STORAGE_NS}:snapshot-at:v2`;

export function getLastSnapshotAt(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(SNAP_AT_KEY) : null;
  } catch {
    return null;
  }
}

export function setLastSnapshotAt(iso: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SNAP_AT_KEY, iso);
  } catch {
    /* ignore */
  }
}

function normalizeChronoPulse(raw: unknown): ChronoDay[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChronoDay[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const date = typeof rec.date === 'string' ? rec.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const countRaw = Number(rec.count ?? rec.totalCommits ?? 0);
    const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.floor(countRaw) : 0;
    const reposRaw = Array.isArray(rec.repos)
      ? rec.repos
      : Array.isArray(rec.activeRepoSlugs)
        ? rec.activeRepoSlugs
        : [];
    const repos = [...new Set(reposRaw.map((s) => stripHtmlAndEmojis(s)).filter(Boolean))].sort();
    out.push({ date, count, repos });
  }
  return out.length ? out : undefined;
}

function normalizeCommitsMap(raw: unknown): Record<string, CommitsEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, CommitsEntry> = {};
  for (const [slug, val] of Object.entries(raw as Record<string, unknown>)) {
    const cleanSlug = stripHtmlAndEmojis(slug);
    if (!cleanSlug || !val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;
    const entry: CommitsEntry = {
      pushedAt: typeof rec.pushedAt === 'string' ? rec.pushedAt : '',
      commits: projectCommits(rec.commits),
    };
    if (Array.isArray(rec.commits30d) && rec.commits30d.length > 0) {
      entry.commits30d = rec.commits30d
        .slice(-30)
        .map((n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0));
    }
    if (typeof rec.commits30dTotal === 'number' && Number.isFinite(rec.commits30dTotal)) {
      entry.commits30dTotal = Math.max(0, Math.floor(rec.commits30dTotal));
    }
    if (typeof rec.commits90dTotal === 'number' && Number.isFinite(rec.commits90dTotal)) {
      entry.commits90dTotal = Math.max(0, Math.floor(rec.commits90dTotal));
    }
    out[cleanSlug] = entry;
  }
  return out;
}

function normalizeLanguagesMap(raw: unknown): Record<string, Record<string, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const [slug, map] of Object.entries(raw as Record<string, unknown>)) {
    const cleanSlug = stripHtmlAndEmojis(slug);
    if (!cleanSlug) continue;
    const langs = projectLanguages(map);
    if (Object.keys(langs).length > 0) out[cleanSlug] = langs;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeProbesMap(raw: unknown): Record<string, SnapshotProbe> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, SnapshotProbe> = {};
  for (const [slug, probe] of Object.entries(raw as Record<string, unknown>)) {
    const cleanSlug = stripHtmlAndEmojis(slug);
    if (!cleanSlug || !probe || typeof probe !== 'object') continue;
    const p = probe as Partial<SnapshotProbe>;
    out[cleanSlug] = sanitizeProbe({
      ...p,
      candidateUrl: sanitizeHttpUrl(p.candidateUrl),
      resolvedUrl: sanitizeHttpUrl(p.resolvedUrl),
    });
  }
  return Object.keys(out).length ? out : undefined;
}

/** Sanitize and normalize a SnapshotFile / SnapshotV2 JSON object. */
export function normalizeSnapshot(raw: unknown): SnapshotFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  if (!Array.isArray(j.repos)) return null;

  const generatedAt = typeof j.generatedAt === 'string' && j.generatedAt ? j.generatedAt : new Date().toISOString();
  const snap: SnapshotFile = {
    schemaVersion: j.schemaVersion === 'SnapshotV2' || j.schemaVersion === 2 ? j.schemaVersion : undefined,
    generatedAt,
    owner: typeof j.owner === 'string' ? stripHtmlAndEmojis(j.owner) : undefined,
    sourceMode:
      j.sourceMode === 'live-github-bake' || j.sourceMode === 'preserved-cache' || j.sourceMode === 'offline-fallback'
        ? j.sourceMode
        : undefined,
    user: j.user ? projectUser(j.user) : null,
    repos: projectRepos(j.repos),
    events: projectEvents(j.events),
    commits: normalizeCommitsMap(j.commits),
    languages: normalizeLanguagesMap(j.languages),
    probes: normalizeProbesMap(j.probes),
    chronoPulse90d: normalizeChronoPulse(j.chronoPulse90d),
    totals: j.totals && typeof j.totals === 'object' ? (j.totals as SnapshotFile['totals']) : undefined,
  };
  return snap;
}

/** Build-time snapshot (same-origin, costs zero API quota). Missing or malformed file returns null. */
export async function loadSnapshot(): Promise<SnapshotFile | null> {
  try {
    const res = await fetch('./snapshot.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return normalizeSnapshot(JSON.parse(text));
  } catch {
    return null;
  }
}
