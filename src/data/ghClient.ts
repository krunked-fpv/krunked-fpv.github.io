import { API_ORIGIN } from '../config/site';
import { getEntry, putEntry, touch } from './httpCache';
import { getRate, readRateHeaders, setRate, type RateState } from './rateLimit';
import { getPat } from '../vault/patStore';

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

export interface GhResult<T> {
  data: T;
  source: 'network' | 'etag';
  etag: string | null;
}

export interface GhOpts<T> {
  /** parse body (json default). Receives the raw JSON (or string for html). */
  project?: (raw: any) => T;
  accept?: string;
  /** stored alongside the cache entry and used by callers for skip decisions */
  meta?: Record<string, unknown>;
  html?: boolean;
  signal?: AbortSignal;
}

/** Conditional GET with ETag cache. 304 costs zero rate-limit quota. */
export async function ghFetch<T>(path: string, opts: GhOpts<T> = {}): Promise<GhResult<T>> {
  const url = path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
  if (!url.startsWith(`${API_ORIGIN}/`)) throw new Error('ghFetch: refusing non-GitHub URL');
  const cached = getEntry<T>(url);
  const headers: Record<string, string> = {
    Accept: opts.accept ?? 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  const pat = getPat();
  if (pat) headers.Authorization = `Bearer ${pat}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: 'no-store', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OfflineError();
  }
  const rate = readRateHeaders(res.headers);
  if (rate) setRate(rate);

  if (res.status === 304 && cached) {
    touch(url);
    return { data: cached.body, source: 'etag', etag: cached.etag };
  }
  if (res.status === 401 && pat) throw new AuthError();
  if (res.status === 403 || res.status === 429) {
    const retry = res.headers.get('retry-after');
    const r = getRate();
    if ((r && r.remaining === 0) || retry || res.status === 429) {
      const resetAt = retry ? Date.now() + Number(retry) * 1000 : (r?.reset ?? Math.floor(Date.now() / 1000) + 60) * 1000;
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

/** /rate_limit is free (doesn't count against quota). */
export async function fetchRateLimit(token?: string): Promise<RateState | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/rate_limit`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store',
    });
    if (res.status === 401) throw new AuthError();
    if (!res.ok) return null;
    const j = (await res.json()) as { resources?: { core?: { limit: number; remaining: number; reset: number; used: number } } };
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
