import DOMPurify from 'dompurify';
import { DEEP_HISTORY_MS, GITHUB_USER, SPOTLIGHT_COUNT } from '../config/site';
import { sanitizeHttpUrl } from '../domain/sanitize';
import type { CommitLite, CommitsEntry, GhEvent, GhRepo } from '../types/github';
import { ghFetch, HttpError, syncDisabled } from './ghClient';
import { getEntry, putEntry, trimReadmes } from './httpCache';
import { projectCommits, projectEvents, projectLanguages } from './projections';
import { budgetExhausted, getRate } from './rateLimit';

export const commitsPath = (repo: string) => `/repos/${GITHUB_USER}/${repo}/commits?per_page=30`;
export const languagesPath = (repo: string) => `/repos/${GITHUB_USER}/${repo}/languages`;
export const readmePath = (repo: string) => `/repos/${GITHUB_USER}/${repo}/readme`;

/** Run async jobs with bounded concurrency. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++] as T);
    }),
  );
}

export function cachedCommits(repo: string): CommitsEntry | undefined {
  const e = getEntry<CommitLite[]>(`https://api.github.com${commitsPath(repo)}`);
  if (!e) return undefined;
  const entry: CommitsEntry = {
    pushedAt: String(e.meta?.pushedAt ?? ''),
    commits: Array.isArray(e.body) ? e.body : [],
  };
  if (Array.isArray(e.meta?.commits30d)) {
    entry.commits30d = e.meta.commits30d as number[];
  }
  if (typeof e.meta?.commits30dTotal === 'number') {
    entry.commits30dTotal = e.meta.commits30dTotal;
  }
  if (typeof e.meta?.commits90dTotal === 'number') {
    entry.commits90dTotal = e.meta.commits90dTotal;
  }
  return entry;
}

export function cachedLanguages(repo: string): Record<string, number> | undefined {
  const e = getEntry<Record<string, number>>(`https://api.github.com${languagesPath(repo)}`);
  return e?.body;
}

/** Fetch commits for a repo unless disabled, budget-exhausted, or already fresh for pushed_at. */
export async function enrichCommits(repo: GhRepo): Promise<boolean> {
  if (syncDisabled()) return false;
  const url = `https://api.github.com${commitsPath(repo.name)}`;
  const hit = getEntry<CommitLite[]>(url);
  if (hit && hit.meta?.pushedAt === repo.pushed_at) return false;
  if (budgetExhausted()) return false;
  try {
    const r = await ghFetch<CommitLite[]>(commitsPath(repo.name), {
      project: projectCommits,
      meta: { ...(hit?.meta ?? {}), pushedAt: repo.pushed_at },
    });
    if (r.source === 'etag') {
      const e = getEntry(url);
      if (e) {
        e.meta = { ...(e.meta ?? {}), pushedAt: repo.pushed_at };
        putEntry(e);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export const enrichProject = enrichCommits;

/** Fallback /languages fetch on Peek open when missing from SnapshotV2 and quota is healthy. */
export async function enrichLanguages(repo: GhRepo): Promise<Record<string, number> | null> {
  const url = `https://api.github.com${languagesPath(repo.name)}`;
  const hit = getEntry<Record<string, number>>(url);
  if (hit && (hit.meta?.pushedAt === repo.pushed_at || syncDisabled())) return hit.body;
  if (syncDisabled() || budgetExhausted()) return hit?.body ?? null;
  try {
    const r = await ghFetch<Record<string, number>>(languagesPath(repo.name), {
      project: projectLanguages,
      meta: { pushedAt: repo.pushed_at },
    });
    if (r.source === 'etag') {
      const e = getEntry(url);
      if (e) {
        e.meta = { pushedAt: repo.pushed_at };
        putEntry(e);
      }
    }
    return r.data;
  } catch {
    return hit?.body ?? null;
  }
}

export async function enrichSpotlight(repos: GhRepo[], max = SPOTLIGHT_COUNT): Promise<boolean> {
  if (syncDisabled()) return false;
  let changed = false;
  await pool(repos.slice(0, max), 2, async (r) => {
    if (await enrichCommits(r)) changed = true;
  });
  return changed;
}

const deepKey = 'forge-deck:deep-history';

/** Events pages 2-3, at most every 6h, never on unauthenticated cold boot, and only with healthy quota. */
export async function enrichDeepHistory(): Promise<GhEvent[] | null> {
  if (syncDisabled()) return null;
  const last = Number(localStorage.getItem(deepKey) ?? 0);
  if (Date.now() - last < DEEP_HISTORY_MS) return null;
  const rate = getRate();
  if (rate && rate.remaining <= 20 && rate.reset * 1000 > Date.now()) return null;
  try {
    const out: GhEvent[] = [];
    for (const page of [2, 3]) {
      const r = await ghFetch<GhEvent[]>(`/users/${GITHUB_USER}/events/public?per_page=100&page=${page}`, {
        project: projectEvents,
      });
      out.push(...r.data);
    }
    localStorage.setItem(deepKey, String(Date.now()));
    return out;
  } catch {
    return null;
  }
}

export function cachedDeepHistory(): GhEvent[] {
  const out: GhEvent[] = [];
  for (const page of [2, 3]) {
    const e = getEntry<GhEvent[]>(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=100&page=${page}`);
    if (e) out.push(...e.body);
  }
  return out;
}

const README_CAP = 200_000;

export function sanitizeReadme(html: string, repo: string, branch: string): string {
  const raw = `https://raw.githubusercontent.com/${GITHUB_USER}/${repo}/${branch}/`;
  const blob = `https://github.com/${GITHUB_USER}/${repo}/blob/${branch}/`;
  const clean = DOMPurify.sanitize(html.slice(0, README_CAP), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'form', 'input', 'iframe', 'source', 'object', 'embed'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  if (typeof document === 'undefined') return clean;

  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  const isAbs = (u: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

  tpl.content.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src')?.trim();
    if (!s) {
      img.removeAttribute('src');
    } else {
      const candidate = isAbs(s) ? s : raw + s.replace(/^\.?\//, '');
      const safe = sanitizeHttpUrl(candidate);
      if (safe) img.setAttribute('src', safe);
      else img.removeAttribute('src');
    }
    img.setAttribute('loading', 'lazy');
    img.removeAttribute('srcset');
  });

  tpl.content.querySelectorAll('a').forEach((a) => {
    const h = a.getAttribute('href')?.trim();
    if (!h) return;
    if (h.startsWith('#')) return;
    const candidate = isAbs(h) ? h : blob + h.replace(/^\.?\//, '');
    const safe = sanitizeHttpUrl(candidate);
    if (!safe) {
      a.removeAttribute('href');
      return;
    }
    a.setAttribute('href', safe);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  return tpl.innerHTML;
}

/**
 * Fetch sanitized README HTML on Peek open.
 * - Strictly gated on !syncDisabled() (returns cached copy or null with 0 network calls).
 * - Caches 404 responses cleanly so README-less repos never trigger repeated 404 console errors.
 */
export async function fetchReadme(repo: GhRepo): Promise<string | null> {
  const url = `https://api.github.com${readmePath(repo.name)}`;
  const cached = getEntry<string>(url);
  if (cached?.meta?.notFound === true && cached.meta?.pushedAt === repo.pushed_at) {
    return null;
  }
  if (syncDisabled()) {
    return cached && !cached.meta?.notFound ? cached.body : null;
  }
  if (budgetExhausted(0) && !cached) return null;

  try {
    const r = await ghFetch<string>(readmePath(repo.name), {
      accept: 'application/vnd.github.html+json',
      html: true,
      meta: { pushedAt: repo.pushed_at, notFound: false },
      project: (h: string) => sanitizeReadme(h, repo.name, repo.default_branch),
    });
    trimReadmes(12);
    return r.data;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      putEntry<string>({
        url,
        etag: null,
        body: '',
        fetchedAt: Date.now(),
        meta: { pushedAt: repo.pushed_at, notFound: true },
      });
      return null;
    }
    return cached && !cached.meta?.notFound ? cached.body : null;
  }
}
