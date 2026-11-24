export const TELEMETRY_IDB_NAME = 'krunked_deck_telemetry_v1';

const TELEMETRY_IDB_VERSION = 1;
const STORE_SNAPSHOT = 'snapshot';
const STORE_ENDPOINTS = 'endpoints';
const STORE_MANIFESTS = 'manifests';
const SNAPSHOT_KEY = 'latest';

function getIndexedDbApi() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.indexedDB || null;
}

function openTelemetryDb() {
  const idb = getIndexedDbApi();
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = idb.open(TELEMETRY_IDB_NAME, TELEMETRY_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
          db.createObjectStore(STORE_SNAPSHOT);
        }
        if (!db.objectStoreNames.contains(STORE_ENDPOINTS)) {
          db.createObjectStore(STORE_ENDPOINTS);
        }
        if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
          db.createObjectStore(STORE_MANIFESTS);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // ignore close error during version change
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

async function idbGet(storeName, key) {
  const db = await openTelemetryDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  });
}

async function idbPut(storeName, key, value) {
  const db = await openTelemetryDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  });
}

/**
 * Read the last cached FoundrySnapshotV1 from IndexedDB.
 * @returns {Promise<object | null>}
 */
export async function readCachedSnapshot() {
  return idbGet(STORE_SNAPSHOT, SNAPSHOT_KEY);
}

/**
 * Persist a FoundrySnapshotV1 to IndexedDB.
 * @param {object} snapshot
 * @returns {Promise<void>}
 */
export async function writeCachedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  await idbPut(STORE_SNAPSHOT, SNAPSHOT_KEY, snapshot);
}

/**
 * Read cached ETag + response payload for a GitHub API endpoint URL.
 * @param {string} url
 * @returns {Promise<{ etag: string | null, data: any, rateLimit: object, checkedAt: number } | null>}
 */
export async function readEndpointCache(url) {
  if (typeof url !== 'string' || !url) return null;
  return idbGet(STORE_ENDPOINTS, url);
}

/**
 * Persist an ETag + response payload record for a GitHub API endpoint URL.
 * @param {string} url
 * @param {{ etag: string | null, data: any, rateLimit?: object, checkedAt?: number }} record
 * @returns {Promise<void>}
 */
export async function writeEndpointCache(url, record) {
  if (typeof url !== 'string' || !url || !record || typeof record !== 'object') return;
  await idbPut(STORE_ENDPOINTS, url, {
    etag: record.etag ?? null,
    data: record.data ?? null,
    rateLimit: record.rateLimit ?? {},
    checkedAt: typeof record.checkedAt === 'number' ? record.checkedAt : Date.now(),
  });
}

/**
 * Read cached live manifest probe data for a repository slug.
 * @param {string} slug
 * @returns {Promise<object | null>}
 */
export async function readManifestCache(slug) {
  if (typeof slug !== 'string' || !slug) return null;
  return idbGet(STORE_MANIFESTS, slug.toLowerCase());
}

/**
 * Persist live manifest probe data for a repository slug.
 * @param {string} slug
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function writeManifestCache(slug, data) {
  if (typeof slug !== 'string' || !slug || !data || typeof data !== 'object') return;
  await idbPut(STORE_MANIFESTS, slug.toLowerCase(), data);
}

/**
 * Clear all object stores in the telemetry IndexedDB database.
 * @returns {Promise<void>}
 */
export async function clearTelemetryCache() {
  const db = await openTelemetryDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_SNAPSHOT, STORE_ENDPOINTS, STORE_MANIFESTS], 'readwrite');
      tx.objectStore(STORE_SNAPSHOT).clear();
      tx.objectStore(STORE_ENDPOINTS).clear();
      tx.objectStore(STORE_MANIFESTS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  });
}
