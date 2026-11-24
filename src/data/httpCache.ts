import { cyrb53 } from '../art/hash';
import { STORAGE_NS } from '../config/site';

export interface CacheEntry<T = unknown> {
  url: string;
  etag: string | null;
  body: T;
  fetchedAt: number;
  meta?: Record<string, unknown>;
}

const PREFIX = `${STORAGE_NS}:http:v1:`;
const mem = new Map<string, CacheEntry>();
let loaded = false;

const keyOf = (url: string) => PREFIX + cyrb53(url).toString(36);

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Synchronous load so the store can hydrate before first paint. */
export function loadAll() {
  if (loaded) return;
  loaded = true;
  const s = ls();
  if (!s) return;
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const raw = s.getItem(k);
      if (!raw) continue;
      try {
        const e = JSON.parse(raw) as CacheEntry;
        if (e && typeof e.url === 'string') mem.set(e.url, e);
      } catch {
        s.removeItem(k);
      }
    }
  } catch {
    /* storage unavailable */
  }
}

export function getEntry<T = unknown>(url: string): CacheEntry<T> | undefined {
  loadAll();
  return mem.get(url) as CacheEntry<T> | undefined;
}

export function putEntry<T>(entry: CacheEntry<T>) {
  loadAll();
  mem.set(entry.url, entry as CacheEntry);
  persist(entry as CacheEntry);
}

function persist(entry: CacheEntry, retried = false) {
  const s = ls();
  if (!s) return;
  try {
    s.setItem(keyOf(entry.url), JSON.stringify(entry));
  } catch {
    if (retried) return;
    evict(entry.url);
    persist(entry, true);
  }
}

/** Evict oldest non-core entries (README first) to free quota. */
function evict(keep: string) {
  const s = ls();
  if (!s) return;
  const all = [...mem.values()].filter((e) => e.url !== keep);
  const weight = (e: CacheEntry) => (e.url.includes('/readme') ? 0 : e.url.includes('/commits') ? 1 : 2);
  all.sort((a, b) => weight(a) - weight(b) || a.fetchedAt - b.fetchedAt);
  for (const e of all.slice(0, Math.max(2, Math.ceil(all.length / 4)))) {
    mem.delete(e.url);
    try {
      s.removeItem(keyOf(e.url));
    } catch {
      /* ignore */
    }
  }
}

export function touch(url: string) {
  const e = mem.get(url);
  if (!e) return;
  e.fetchedAt = Date.now();
  persist(e);
}

/** LRU for README entries: keep newest N. */
export function trimReadmes(max = 12) {
  const rd = [...mem.values()].filter((e) => e.url.includes('/readme')).sort((a, b) => b.fetchedAt - a.fetchedAt);
  const s = ls();
  for (const e of rd.slice(max)) {
    mem.delete(e.url);
    try {
      s?.removeItem(keyOf(e.url));
    } catch {
      /* ignore */
    }
  }
}

export function clearAll() {
  const s = ls();
  mem.clear();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function _resetForTests() {
  mem.clear();
  loaded = false;
}
