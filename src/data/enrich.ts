import DOMPurify from 'dompurify';
import { DEEP_HISTORY_MS, GITHUB_USER, SPOTLIGHT_COUNT } from '../config/site';
import { ghFetch } from './ghClient';
import { getEntry, putEntry, trimReadmes } from './httpCache';
import { projectCommits, projectEvents } from './projections';
import { budgetExhausted, getRate } from './rateLimit';
import type { CommitLite, CommitsEntry, GhEvent, GhRepo } from '../types/github';

export const commitsPath = (repo: string) => `/repos/${GITHUB_USER}/${repo}/commits?per_page=30`;
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
  return { pushedAt: String(e.meta?.pushedAt ?? ''), commits: e.body };
}

/** Fetch commits for a repo unless the cache is already fresh for its pushed_at. */
export async function enrichCommits(repo: GhRepo): Promise<boolean> {
  const url = `https://api.github.com${commitsPath(repo.name)}`;
  const hit = getEntry<CommitLite[]>(url);
  if (hit && hit.meta?.pushedAt === repo.pushed_at) return false;
  if (budgetExhausted()) return false;
  try {
    const r = await ghFetch<CommitLite[]>(commitsPath(repo.name), {
      project: projectCommits,
      meta: { pushedAt: repo.pushed_at },
    });
    // 304 keeps old meta; refresh it so we skip next time
    if (r.source === 'etag') {
      const e = getEntry(url);
      if (e) {
        e.meta = { pushedAt: repo.pushed_at };
        putEntry(e);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export const enrichProject = enrichCommits;

export async function enrichSpotlight(repos: GhRepo[], max = SPOTLIGHT_COUNT): Promise<boolean> {
  let changed = false;
  await pool(repos.slice(0, max), 2, async (r) => {
    if (await enrichCommits(r)) changed = true;
  });
  return changed;
}

const deepKey = 'forge-deck:deep-history';

/** Events pages 2–3, at most every 6h and only with healthy quota. */
export async function enrichDeepHistory(): Promise<GhEvent[] | null> {
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
    FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'source'],
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  const isAbs = (u: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
  tpl.content.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src');
    if (s && !isAbs(s)) img.setAttribute('src', raw + s.replace(/^\.?\//, ''));
    img.setAttribute('loading', 'lazy');
    img.removeAttribute('srcset');
  });
  tpl.content.querySelectorAll('a').forEach((a) => {
    const h = a.getAttribute('href');
    if (h && !isAbs(h)) a.setAttribute('href', blob + h.replace(/^\.?\//, ''));
    if (h && !h.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return tpl.innerHTML;
}

export async function fetchReadme(repo: GhRepo): Promise<string | null> {
  if (budgetExhausted(0) && !getEntry(`https://api.github.com${readmePath(repo.name)}`)) return null;
  const r = await ghFetch<string>(readmePath(repo.name), {
    accept: 'application/vnd.github.html+json',
    html: true,
    project: (h: string) => sanitizeReadme(h, repo.name, repo.default_branch),
  });
  trimReadmes(12);
  return r.data;
}
