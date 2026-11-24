/**
 * Device-Local PAT Security Firewall (`krunked-local-pat-v1`).
 *
 * Isolates optional GitHub Personal Access Tokens exclusively in device-local
 * storage (`localStorage['krunked-local-pat-v1']`, optionally mirrored to the
 * isolated `'pat_store'` object store in IndexedDB `'krunked_vault_v1'`).
 *
 * Hard security invariants:
 * - Never writes PATs to `document.cookie` or JSON config exports.
 * - Never logs raw tokens.
 * - Attaches `Authorization: Bearer ...` strictly when `url.protocol === 'https:'`
 *   and `url.origin === 'https://api.github.com'`.
 */

export const PAT_STORAGE_KEY = 'krunked-local-pat-v1';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const VAULT_IDB_NAME = 'krunked_vault_v1';
const VAULT_IDB_VERSION = 1;
const VAULT_IDB_STATE_STORE = 'state';
const VAULT_IDB_PAT_STORE = 'pat_store';
const VAULT_IDB_PAT_KEY = 'pat';

let memoryPatFallback = null;

function getLocalStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function getIndexedDb() {
  try {
    return typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : null;
  } catch {
    return null;
  }
}

function normalizeToken(rawToken) {
  if (typeof rawToken !== 'string') return null;
  const trimmed = rawToken.trim();
  if (!/^[^\s\u0000-\u001F\u007F]{4,512}$/.test(trimmed)) return null;
  return trimmed;
}

function maskToken(token) {
  if (!token) return '';
  if (token.length >= 10) {
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }
  return `${token.slice(0, 2)}...${token.slice(-1)}`;
}

function safeCloseDb(db) {
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch {
      // Ignore mock close errors
    }
  }
}

async function mirrorPatToIndexedDb(tokenOrNull) {
  const idb = getIndexedDb();
  if (!idb || typeof idb.open !== 'function') return;

  let db = null;
  try {
    db = await new Promise((resolve, reject) => {
      const req = idb.open(VAULT_IDB_NAME, VAULT_IDB_VERSION);
      req.onupgradeneeded = (event) => {
        const upgradeDb = event?.target?.result || req.result;
        if (!upgradeDb) return;
        if (!upgradeDb.objectStoreNames?.contains(VAULT_IDB_STATE_STORE)) {
          upgradeDb.createObjectStore(VAULT_IDB_STATE_STORE);
        }
        if (!upgradeDb.objectStoreNames?.contains(VAULT_IDB_PAT_STORE)) {
          upgradeDb.createObjectStore(VAULT_IDB_PAT_STORE);
        }
      };
      req.onsuccess = (event) => {
        const opened = event?.target?.result || req.result;
        if (opened && typeof opened === 'object') {
          opened.onversionchange = () => safeCloseDb(opened);
        }
        resolve(opened);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });

    if (!db || !db.objectStoreNames?.contains(VAULT_IDB_PAT_STORE)) {
      safeCloseDb(db);
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_PAT_STORE, 'readwrite');
      const store = tx.objectStore(VAULT_IDB_PAT_STORE);
      const req = tokenOrNull
        ? store.put(tokenOrNull, VAULT_IDB_PAT_KEY)
        : store.delete(VAULT_IDB_PAT_KEY);
      const isNativeTx =
        typeof IDBTransaction !== 'undefined' && tx instanceof IDBTransaction;
      let done = false;

      if ('oncomplete' in tx) {
        tx.oncomplete = () => {
          done = true;
          resolve();
        };
      }
      if ('onerror' in tx) {
        tx.onerror = () => reject(tx.error || new Error('PAT IDB transaction failed'));
      }
      req.onsuccess = () => {
        if (!isNativeTx && !done) resolve();
      };
      req.onerror = () => reject(req.error || new Error('PAT IDB op failed'));
    });
  } catch {
    // Non-fatal: localStorage remains synchronous primary PAT store
  } finally {
    safeCloseDb(db);
  }
}

/**
 * Verifies that `rawUrl` strictly targets `https://api.github.com` without embedded credentials.
 *
 * @param {string | URL} rawUrl
 * @returns {URL}
 */
export function assertGitHubApiOrigin(rawUrl) {
  const candidate = rawUrl instanceof URL ? rawUrl.href : rawUrl;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('Invalid GitHub API URL: expected non-empty URL string');
  }

  let parsed;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    throw new Error('Invalid GitHub API URL: unparseable URL');
  }

  if (parsed.protocol !== 'https:' || parsed.origin !== GITHUB_API_ORIGIN) {
    throw new Error(
      `Blocked credential leak: origin "${parsed.origin}" is not "${GITHUB_API_ORIGIN}"`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error('Blocked credential leak: embedded URL userinfo is forbidden');
  }

  return parsed;
}

/**
 * Returns Bearer auth headers ONLY when `rawUrl` resolves strictly to `https://api.github.com`
 * and a valid PAT is available; returns `{}` for all other origins or missing tokens.
 *
 * @param {string | URL} rawUrl
 * @param {string | null} [patOverride]
 * @returns {{ Authorization: string } | {}}
 */
export function getAuthHeadersForUrl(rawUrl, patOverride = null) {
  try {
    assertGitHubApiOrigin(rawUrl);
  } catch {
    return {};
  }

  const token =
    patOverride !== null && patOverride !== undefined
      ? normalizeToken(patOverride)
      : loadRawPatForInternalSync();

  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Saves a GitHub PAT strictly to device-local storage.
 *
 * @param {string} rawToken
 * @returns {Promise<{ saved: boolean, maskedHint: string }>}
 */
export async function savePat(rawToken) {
  const token = normalizeToken(rawToken);
  if (!token) {
    return { saved: false, maskedHint: '' };
  }

  const storage = getLocalStorage();
  if (storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(PAT_STORAGE_KEY, token);
      memoryPatFallback = null;
    } catch {
      return { saved: false, maskedHint: '' };
    }
  } else {
    memoryPatFallback = token;
  }

  await mirrorPatToIndexedDb(token);
  return { saved: true, maskedHint: maskToken(token) };
}

/**
 * Returns non-sensitive PAT configuration status and masked hint for UI rendering.
 *
 * @returns {{ configured: boolean, maskedHint: string }}
 */
export function getPatStatus() {
  const token = loadRawPatForInternalSync();
  if (!token) {
    return { configured: false, maskedHint: '' };
  }
  return { configured: true, maskedHint: maskToken(token) };
}

/**
 * Loads the raw PAT strictly for internal authenticated `api.github.com` requests.
 *
 * @returns {string | null}
 */
export function loadRawPatForInternalSync() {
  const storage = getLocalStorage();
  if (storage && typeof storage.getItem === 'function') {
    try {
      const raw = storage.getItem(PAT_STORAGE_KEY);
      if (!raw) return null;
      if (raw.trim().startsWith('{')) {
        const parsed = JSON.parse(raw);
        return normalizeToken(parsed?.token);
      }
      return normalizeToken(raw);
    } catch {
      return null;
    }
  }
  return normalizeToken(memoryPatFallback);
}

/**
 * Erases the stored PAT from all device-local stores.
 *
 * @returns {Promise<void>}
 */
export async function wipePat() {
  memoryPatFallback = null;

  const storage = getLocalStorage();
  if (storage && typeof storage.removeItem === 'function') {
    try {
      storage.removeItem(PAT_STORAGE_KEY);
    } catch {
      // Ignore storage errors during wipe
    }
  }

  await mirrorPatToIndexedDb(null);
}
