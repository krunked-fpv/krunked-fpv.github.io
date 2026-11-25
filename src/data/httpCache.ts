import { cyrb53 } from '../art/hash';
import { STORAGE_NS } from '../config/site';
import {
  clearTelemetryIdb,
  deleteIdbHttpEntry,
  readIdbHttpAll,
  withTimeout,
  writeIdbHttpEntry,
} from './idbCache';

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

/** Synchronous load from localStorage so the store hydrates before first paint (<5ms). */
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

/**
 * Non-blocking IndexedDB mirror hydration (bounded timeout on boot).
 * Merges entries missing from or newer than localStorage (e.g. heavy READMEs/commits).
 */
export async function hydrateFromIdb(timeoutMs = 25): Promise<number> {
  loadAll();
  const entries = await withTimeout(readIdbHttpAll().catch(() => []), timeoutMs, []);
  let merged = 0;
  for (const [, entry] of entries) {
    if (!entry || typeof entry.url !== 'string') continue;
    const prev = mem.get(entry.url);
    if (!prev || entry.fetchedAt > prev.fetchedAt) {
      mem.set(entry.url, entry);
      merged += 1;
    }
  }
  return merged;
}

export function getEntry<T = unknown>(url: string): CacheEntry<T> | undefined {
  loadAll();
  return mem.get(url) as CacheEntry<T> | undefined;
}

export function putEntry<T>(entry: CacheEntry<T>) {
  loadAll();
  const normalized = entry as CacheEntry;
  mem.set(normalized.url, normalized);
  persistLocal(normalized);
  void writeIdbHttpEntry(normalized);
}

function persistLocal(entry: CacheEntry, retried = false) {
  const s = ls();
  if (!s) return;
  try {
    const serialized = JSON.stringify(entry);
    // Keep very large README HTML blobs out of shared 5MB localStorage (IDB mirrors them).
    if (entry.url.includes('/readme') && serialized.length > 64_000) return;
    s.setItem(keyOf(entry.url), serialized);
  } catch {
    if (retried) return;
    evictLocal(entry.url);
    persistLocal(entry, true);
  }
}

/** Evict oldest non-core entries from localStorage (README first) to preserve quota for sibling apps. */
function evictLocal(keep: string) {
  const s = ls();
  if (!s) return;
  const all = [...mem.values()].filter((e) => e.url !== keep);
  const weight = (e: CacheEntry) =>
    e.url.includes('/readme') ? 0 : e.url.includes('/commits') || e.url.includes('/languages') ? 1 : 2;
  all.sort((a, b) => weight(a) - weight(b) || a.fetchedAt - b.fetchedAt);
  for (const e of all.slice(0, Math.max(2, Math.ceil(all.length / 4)))) {
    if (e.url.includes('/readme')) mem.delete(e.url);
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
  persistLocal(e);
  void writeIdbHttpEntry(e);
}

/** LRU for README entries: keep newest N. */
export function trimReadmes(max = 12) {
  const rd = [...mem.values()].filter((e) => e.url.includes('/readme')).sort((a, b) => b.fetchedAt - a.fetchedAt);
  const s = ls();
  for (const e of rd.slice(max)) {
    mem.delete(e.url);
    void deleteIdbHttpEntry(e.url);
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
  void clearTelemetryIdb();
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
