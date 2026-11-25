import { API_ORIGIN } from '../config/site';
import { assertGitHubApiOrigin, getAuthHeadersForUrl, getPat } from '../vault/patStore';
import { getEntry, putEntry, touch } from './httpCache';
import { getRate, parseRetryAfterMs, readRateHeaders, setRate, type RateState } from './rateLimit';

export class RateLimitedError extends Error {
  constructor(public resetAt: number) {
    super('GitHub API rate limit exhausted');
    this.name = 'RateLimitedError';
  }
}
export class OfflineError extends Error {
  constructor() {
    super('Network unreachable');
    this.name = 'OfflineError';
  }
}
export class AuthError extends Error {
  constructor() {
    super('GitHub token rejected');
    this.name = 'AuthError';
  }
}
export class HttpError extends Error {
  constructor(public status: number) {
    super(`GitHub API responded ${status}`);
    this.name = 'HttpError';
  }
}
export class SyncDisabledError extends Error {
  constructor() {
    super('Network sync disabled (?sync=off)');
    this.name = 'SyncDisabledError';
  }
}

export interface GhResult<T> {
  data: T;
  source: 'network' | 'etag';
  etag: string | null;
}

export interface GhOpts<T> {
  /** parse body (json default). Receives the raw JSON (or string for html). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project?: (raw: any) => T;
  accept?: string;
  /** stored alongside the cache entry and used by callers for skip decisions */
  meta?: Record<string, unknown>;
  html?: boolean;
  signal?: AbortSignal;
}

/** Shared ?sync=off network silence predicate (SPEC.md §1 #7). */
export function syncDisabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('sync') === 'off';
  } catch {
    return false;
  }
}

const MIN_RATE_BACKOFF_MS = 60_000;

async function isSecondaryRateLimitBody(res: Response): Promise<boolean> {
  try {
    const text = await res.clone().text();
    return /rate\s*limit|secondary\s+rate|abuse\s+detection/i.test(text);
  } catch {
    return false;
  }
}

function buildGitHubUrl(path: string): string {
  const raw = /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  return assertGitHubApiOrigin(raw).toString();
}

/** Conditional GET with ETag cache and strict PAT origin firewall. 304 costs zero rate-limit quota. */
export async function ghFetch<T>(path: string, opts: GhOpts<T> = {}): Promise<GhResult<T>> {
  const url = buildGitHubUrl(path);
  const cached = getEntry<T>(url);

  if (syncDisabled()) {
    if (cached) return { data: cached.body, source: 'etag', etag: cached.etag };
    throw new SyncDisabledError();
  }

  const runRequest = async (sendConditional: boolean): Promise<Response> => {
    const authHeaders = getAuthHeadersForUrl(url);
    const headers: Record<string, string> = {
      Accept: opts.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...authHeaders,
    };
    if (sendConditional && cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }
    try {
      return await fetch(url, { headers, cache: 'no-store', signal: opts.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new OfflineError();
    }
  };

  let res = await runRequest(true);

  // 304 cache-miss recovery: single unconditional retry instead of HttpError(304).
  if (res.status === 304 && !cached) {
    res = await runRequest(false);
  }

  const rate = readRateHeaders(res.headers);
  if (rate) setRate(rate);

  if (res.status === 304 && cached) {
    touch(url);
    return { data: cached.body, source: 'etag', etag: cached.etag };
  }

  const pat = getPat();
  if (res.status === 401 && pat) throw new AuthError();

  if (res.status === 403 || res.status === 429) {
    const retryMs = parseRetryAfterMs(res.headers.get('retry-after'));
    const r = getRate();
    const isPrimary = Boolean(r && r.remaining === 0);
    const isSecondary =
      res.status === 429 || retryMs !== null || isPrimary || (res.status === 403 && (await isSecondaryRateLimitBody(res)));
    if (isSecondary) {
      const now = Date.now();
      let resetAt: number;
      if (retryMs !== null) {
        resetAt = now + Math.max(MIN_RATE_BACKOFF_MS, retryMs);
      } else if (r && r.reset * 1000 > now) {
        resetAt = r.reset * 1000;
      } else {
        resetAt = now + MIN_RATE_BACKOFF_MS;
      }
      throw new RateLimitedError(resetAt);
    }
  }

  if (!res.ok) throw new HttpError(res.status);

  const raw = opts.html ? await res.text() : await res.json();
  const data = opts.project ? opts.project(raw) : (raw as T);
  const etag = res.headers.get('etag');
  putEntry({ url, etag, body: data, fetchedAt: Date.now(), meta: opts.meta });
  return { data, source: 'network', etag };
}

/** /rate_limit is free (doesn't count against quota), routed through the strict PAT origin firewall. */
export async function fetchRateLimit(token?: string): Promise<RateState | null> {
  if (syncDisabled()) return null;
  const url = assertGitHubApiOrigin(`${API_ORIGIN}/rate_limit`).toString();
  try {
    const authHeaders = getAuthHeadersForUrl(url, token ?? undefined);
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...authHeaders,
      },
      cache: 'no-store',
    });
    if (res.status === 401) throw new AuthError();
    if (!res.ok) return null;
    const j = (await res.json()) as {
      resources?: { core?: { limit: number; remaining: number; reset: number; used: number } };
    };
    const c = j.resources?.core;
    if (!c) return null;
    const next: RateState = { ...c, pollInterval: getRate()?.pollInterval ?? null, updatedAt: Date.now() };
    if (!token) setRate(next);
    return next;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return null;
  }
}
