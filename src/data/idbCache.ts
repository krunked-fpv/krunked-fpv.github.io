import { TELEMETRY_IDB_NAME } from '../config/site';
import type { SnapshotFile, SnapshotProbe } from '../types/github';
import type { CacheEntry } from './httpCache';

const IDB_VERSION = 1;
const STORE_HTTP = 'http';
const STORE_SNAPSHOT = 'snapshot';
const STORE_PROBES = 'probes';
const SNAPSHOT_KEY = 'latest';

function getIdb(): IDBFactory | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.indexedDB ? globalThis.indexedDB : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const idb = getIdb();
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = idb.open(TELEMETRY_IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_HTTP)) db.createObjectStore(STORE_HTTP);
        if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) db.createObjectStore(STORE_SNAPSHOT);
        if (!db.objectStoreNames.contains(STORE_PROBES)) db.createObjectStore(STORE_PROBES);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            /* ignore */
          }
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function safeClose(db: IDBDatabase) {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : (req.result as T));
      req.onerror = () => resolve(null);
      tx.oncomplete = () => safeClose(db);
      tx.onerror = () => {
        safeClose(db);
        resolve(null);
      };
      tx.onabort = () => {
        safeClose(db);
        resolve(null);
      };
    } catch {
      safeClose(db);
      resolve(null);
    }
  });
}

async function idbGetAllEntries<T>(storeName: string): Promise<[string, T][]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const out: [string, T][] = [];
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.push([String(cursor.key), cursor.value as T]);
          cursor.continue();
        }
      };
      req.onerror = () => resolve(out);
      tx.oncomplete = () => {
        safeClose(db);
        resolve(out);
      };
      tx.onerror = () => {
        safeClose(db);
        resolve(out);
      };
      tx.onabort = () => {
        safeClose(db);
        resolve(out);
      };
    } catch {
      safeClose(db);
      resolve(out);
    }
  });
}

async function idbPut(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        safeClose(db);
        resolve();
      };
      tx.onerror = () => {
        safeClose(db);
        resolve();
      };
      tx.onabort = () => {
        safeClose(db);
        resolve();
      };
    } catch {
      safeClose(db);
      resolve();
    }
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => {
        safeClose(db);
        resolve();
      };
      tx.onerror = () => {
        safeClose(db);
        resolve();
      };
      tx.onabort = () => {
        safeClose(db);
        resolve();
      };
    } catch {
      safeClose(db);
      resolve();
    }
  });
}

/** Race an async read against a tight boot deadline so IDB never blocks first paint. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function readIdbSnapshot(): Promise<SnapshotFile | null> {
  return idbGet<SnapshotFile>(STORE_SNAPSHOT, SNAPSHOT_KEY);
}

export function writeIdbSnapshot(snapshot: SnapshotFile): Promise<void> {
  return idbPut(STORE_SNAPSHOT, SNAPSHOT_KEY, snapshot);
}

export function readIdbHttpAll(): Promise<[string, CacheEntry][]> {
  return idbGetAllEntries<CacheEntry>(STORE_HTTP);
}

export function writeIdbHttpEntry(entry: CacheEntry): Promise<void> {
  return idbPut(STORE_HTTP, entry.url, entry);
}

export function deleteIdbHttpEntry(url: string): Promise<void> {
  return idbDelete(STORE_HTTP, url);
}

export function readIdbProbes(): Promise<[string, SnapshotProbe][]> {
  return idbGetAllEntries<SnapshotProbe>(STORE_PROBES);
}

export function writeIdbProbe(key: string, probe: SnapshotProbe): Promise<void> {
  return idbPut(STORE_PROBES, key, probe);
}

export async function clearTelemetryIdb(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_HTTP, STORE_SNAPSHOT, STORE_PROBES], 'readwrite');
      tx.objectStore(STORE_HTTP).clear();
      tx.objectStore(STORE_SNAPSHOT).clear();
      tx.objectStore(STORE_PROBES).clear();
      tx.oncomplete = () => {
        safeClose(db);
        resolve();
      };
      tx.onerror = () => {
        safeClose(db);
        resolve();
      };
      tx.onabort = () => {
        safeClose(db);
        resolve();
      };
    } catch {
      safeClose(db);
      resolve();
    }
  });
}
