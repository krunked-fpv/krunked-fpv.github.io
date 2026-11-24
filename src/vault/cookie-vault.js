/**
 * Triple-Redundant Auto-Healing Vault (`krunked-cookie-vault-v1`).
 *
 * Synchronizes user preferences, pins, hidden slugs, and curated card metadata
 * symmetrically across three browser stores:
 * - Store A: localStorage['krunked-cookie-vault-v1']
 * - Store B: IndexedDB 'krunked_vault_v1' (objectStore 'state', key 'root')
 * - Store C: Shadow Cookie 'krunked-cookie-vault-v1' (< 3800 UTF-8 bytes)
 */

export const VAULT_KEY = 'krunked-cookie-vault-v1';
export const VAULT_IDB_NAME = 'krunked_vault_v1';
export const COOKIE_MAX_BYTES = 3800;

const VAULT_IDB_VERSION = 1;
const VAULT_IDB_STATE_STORE = 'state';
const VAULT_IDB_PAT_STORE = 'pat_store';
const VAULT_IDB_ROOT_KEY = 'root';
const COOKIE_VERSION_PREFIX = 'v1';

const CATEGORY_TAGS = Object.freeze([
  'GAMES & RPG',
  'SIMULATORS & FPV',
  'UTILITIES & AI',
  'SRE & TELEMETRY',
  'AUDIO & VINYL',
  'FAMILY & EDU',
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EMOJI_STRIP_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}])/gu;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;

export const DEFAULT_VAULT_STATE = Object.freeze({
  v: 1,
  rev: 1,
  updatedAt: 1795492800000,
  theme: 'obsidian',
  view: 'deck',
  sort: 'latest',
  category: 'ALL',
  launchTarget: 'new_tab',
  audioMuted: true,
  showHidden: false,
  unlockPrivate: false,
  installDismissed: false,
  pinned: Object.freeze([]),
  hidden: Object.freeze([]),
  curated: Object.freeze({}),
});

const PREFERENCE_KEYS = new Set([
  'theme',
  'view',
  'sort',
  'category',
  'launchTarget',
  'audioMuted',
  'showHidden',
  'unlockPrivate',
  'installDismissed',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeText(input, maxLen) {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .replace(EMOJI_STRIP_REGEX, '')
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return maxLen > 0 && cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function sanitizeSlug(rawSlug) {
  if (typeof rawSlug !== 'string') return '';
  const cleaned = sanitizeText(rawSlug, 128);
  if (!cleaned || FORBIDDEN_KEYS.has(cleaned)) return '';
  return cleaned;
}

function sanitizeSlugArray(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const out = [];
  for (const item of rawList) {
    const slug = sanitizeSlug(item);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

function sanitizeCurationEntry(rawEntry) {
  if (!isPlainObject(rawEntry)) return null;
  const entry = {};

  const title = sanitizeText(rawEntry.title, 72);
  if (title) entry.title = title;

  const description = sanitizeText(rawEntry.description, 200);
  if (description) entry.description = description;

  const liveUrl = sanitizeHttpUrl(rawEntry.liveUrl);
  if (liveUrl) entry.liveUrl = liveUrl;

  if (typeof rawEntry.category === 'string') {
    const cat = rawEntry.category.trim();
    if (CATEGORY_TAGS.includes(cat)) entry.category = cat;
  }

  if (typeof rawEntry.accentHex === 'string') {
    const hex = rawEntry.accentHex.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) entry.accentHex = hex.toUpperCase();
  }

  return Object.keys(entry).length > 0 ? entry : null;
}

function sanitizeCuratedMap(rawCurated) {
  const out = {};
  if (!isPlainObject(rawCurated)) return out;
  for (const key of Object.keys(rawCurated)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const slug = sanitizeSlug(key);
    if (!slug) continue;
    const cleaned = sanitizeCurationEntry(rawCurated[key]);
    if (cleaned) out[slug] = cleaned;
  }
  return out;
}

function sanitizeShortToken(rawValue, fallback, maxLen = 32) {
  const cleaned = sanitizeText(rawValue, maxLen);
  return cleaned || fallback;
}

function normalizeCategory(rawCategory) {
  if (typeof rawCategory !== 'string') return DEFAULT_VAULT_STATE.category;
  const trimmed = rawCategory.trim();
  if (trimmed === 'ALL' || CATEGORY_TAGS.includes(trimmed)) return trimmed;
  return DEFAULT_VAULT_STATE.category;
}

export function normalizeVaultState(rawState) {
  const src = isPlainObject(rawState) ? rawState : {};
  const rev =
    Number.isInteger(src.rev) && src.rev >= 1
      ? src.rev
      : DEFAULT_VAULT_STATE.rev;
  const updatedAt =
    typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt) && src.updatedAt > 0
      ? Math.trunc(src.updatedAt)
      : DEFAULT_VAULT_STATE.updatedAt;

  return {
    v: 1,
    rev,
    updatedAt,
    theme: src.theme === 'daylight' ? 'daylight' : 'obsidian',
    view: sanitizeShortToken(src.view, DEFAULT_VAULT_STATE.view, 32),
    sort: sanitizeShortToken(src.sort, DEFAULT_VAULT_STATE.sort, 32),
    category: normalizeCategory(src.category),
    launchTarget: sanitizeShortToken(src.launchTarget, DEFAULT_VAULT_STATE.launchTarget, 32),
    audioMuted: typeof src.audioMuted === 'boolean' ? src.audioMuted : DEFAULT_VAULT_STATE.audioMuted,
    showHidden: typeof src.showHidden === 'boolean' ? src.showHidden : DEFAULT_VAULT_STATE.showHidden,
    unlockPrivate:
      typeof src.unlockPrivate === 'boolean' ? src.unlockPrivate : DEFAULT_VAULT_STATE.unlockPrivate,
    installDismissed:
      typeof src.installDismissed === 'boolean'
        ? src.installDismissed
        : DEFAULT_VAULT_STATE.installDismissed,
    pinned: sanitizeSlugArray(src.pinned),
    hidden: sanitizeSlugArray(src.hidden),
    curated: sanitizeCuratedMap(src.curated),
  };
}

function parseStoredVaultState(rawValue) {
  if (!isPlainObject(rawValue)) return null;
  if (rawValue.v !== 1) return null;
  if (!Number.isInteger(rawValue.rev) || rawValue.rev < 1) return null;
  if (typeof rawValue.updatedAt !== 'number' || !Number.isFinite(rawValue.updatedAt)) return null;
  return normalizeVaultState(rawValue);
}

function cloneState(state) {
  const normalized = normalizeVaultState(state);
  const curatedCopy = {};
  for (const slug of Object.keys(normalized.curated)) {
    curatedCopy[slug] = { ...normalized.curated[slug] };
  }
  return {
    ...normalized,
    pinned: normalized.pinned.slice(),
    hidden: normalized.hidden.slice(),
    curated: curatedCopy,
  };
}

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

function fnv1a32Hex(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function utf8ToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64u) {
  if (typeof b64u !== 'string' || !/^[A-Za-z0-9_-]+$/.test(b64u)) return null;
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function buildCompactCookieObject(state) {
  const compact = {
    v: 1,
    r: state.rev,
    u: state.updatedAt,
  };

  if (state.theme !== DEFAULT_VAULT_STATE.theme) compact.t = state.theme;
  if (state.view !== DEFAULT_VAULT_STATE.view) compact.w = state.view;
  if (state.sort !== DEFAULT_VAULT_STATE.sort) compact.s = state.sort;
  if (state.category !== DEFAULT_VAULT_STATE.category) compact.c = state.category;
  if (state.launchTarget !== DEFAULT_VAULT_STATE.launchTarget) compact.l = state.launchTarget;
  if (state.audioMuted !== DEFAULT_VAULT_STATE.audioMuted) compact.m = state.audioMuted ? 1 : 0;
  if (state.showHidden !== DEFAULT_VAULT_STATE.showHidden) compact.h = state.showHidden ? 1 : 0;
  if (state.unlockPrivate !== DEFAULT_VAULT_STATE.unlockPrivate) {
    compact.p = state.unlockPrivate ? 1 : 0;
  }
  if (state.installDismissed !== DEFAULT_VAULT_STATE.installDismissed) {
    compact.d = state.installDismissed ? 1 : 0;
  }
  if (state.pinned.length > 0) compact.P = state.pinned.slice();
  if (state.hidden.length > 0) compact.H = state.hidden.slice();

  const slugs = Object.keys(state.curated);
  if (slugs.length > 0) {
    const compactCurated = {};
    for (const slug of slugs) {
      const src = state.curated[slug];
      const item = {};
      if (src.title) item.t = src.title;
      if (src.description) item.d = src.description;
      if (src.liveUrl) item.l = src.liveUrl;
      if (src.category) {
        const idx = CATEGORY_TAGS.indexOf(src.category);
        if (idx >= 0) item.c = idx;
      }
      if (src.accentHex) item.a = src.accentHex;
      if (Object.keys(item).length > 0) compactCurated[slug] = item;
    }
    if (Object.keys(compactCurated).length > 0) compact.C = compactCurated;
  }

  return compact;
}

function serializeCompactWire(compact) {
  const b64u = utf8ToBase64Url(JSON.stringify(compact));
  const body = `${COOKIE_VERSION_PREFIX}.${b64u}`;
  return `${body}.${fnv1a32Hex(body)}`;
}

function fitsCookieBudget(wire) {
  return utf8ByteLength(wire) < COOKIE_MAX_BYTES && utf8ByteLength(encodeURIComponent(wire)) < COOKIE_MAX_BYTES;
}

/**
 * Serializes vault state into a compact, URI-safe string strictly under COOKIE_MAX_BYTES (3800).
 * Progressively sheds oldest curated descriptions and secondary fields under heavy curation
 * while preserving pinned, hidden, theme, view, and title overrides.
 *
 * @param {object} state
 * @returns {string}
 */
export function encodeShadowCookiePayload(state) {
  const normalized = normalizeVaultState(state);
  const compact = buildCompactCookieObject(normalized);

  let wire = serializeCompactWire(compact);
  if (fitsCookieBudget(wire)) return wire;

  if (compact.C) {
    const slugs = Object.keys(compact.C);

    // Stage 1: progressively prune oldest curated descriptions first
    for (const slug of slugs) {
      if (compact.C[slug].d !== undefined) {
        delete compact.C[slug].d;
        if (Object.keys(compact.C[slug]).length === 0) delete compact.C[slug];
        if (Object.keys(compact.C).length === 0) delete compact.C;
        wire = serializeCompactWire(compact);
        if (fitsCookieBudget(wire)) return wire;
      }
    }

    // Stage 2: prune secondary curated metadata (liveUrl, category, accentHex) oldest-first, preserving title
    if (compact.C) {
      for (const slug of Object.keys(compact.C)) {
        const entry = compact.C[slug];
        for (const field of ['l', 'c', 'a']) {
          if (entry[field] !== undefined) {
            delete entry[field];
          }
        }
        if (Object.keys(entry).length === 0) delete compact.C[slug];
        if (Object.keys(compact.C).length === 0) delete compact.C;
        wire = serializeCompactWire(compact);
        if (fitsCookieBudget(wire)) return wire;
      }
    }

    // Stage 3: truncate long title overrides, then drop oldest curated entries only if still over budget
    if (compact.C) {
      for (const slug of Object.keys(compact.C)) {
        const entry = compact.C[slug];
        if (entry.t && entry.t.length > 32) {
          entry.t = entry.t.slice(0, 32).trim();
          wire = serializeCompactWire(compact);
          if (fitsCookieBudget(wire)) return wire;
        }
      }
      for (const slug of Object.keys(compact.C)) {
        delete compact.C[slug];
        if (Object.keys(compact.C).length === 0) delete compact.C;
        wire = serializeCompactWire(compact);
        if (fitsCookieBudget(wire)) return wire;
      }
    }
  }

  // Stage 4: emergency pruning for pathological list sizes (never violates < 3800B ceiling)
  for (const optionalKey of ['s', 'c', 'l', 'm', 'h', 'p', 'd']) {
    if (optionalKey in compact) {
      delete compact[optionalKey];
      wire = serializeCompactWire(compact);
      if (fitsCookieBudget(wire)) return wire;
    }
  }

  for (const listKey of ['H', 'P']) {
    while (Array.isArray(compact[listKey]) && compact[listKey].length > 0) {
      compact[listKey].pop();
      if (compact[listKey].length === 0) delete compact[listKey];
      wire = serializeCompactWire(compact);
      if (fitsCookieBudget(wire)) return wire;
    }
  }

  return serializeCompactWire({ v: 1, r: normalized.rev, u: normalized.updatedAt });
}

/**
 * Decodes and verifies a shadow cookie payload back into a normalized vault state.
 * Returns null if the payload is malformed or fails integrity verification.
 *
 * @param {string} encoded
 * @returns {object | null}
 */
export function decodeShadowCookiePayload(encoded) {
  if (typeof encoded !== 'string' || !encoded.trim()) return null;

  let candidate = encoded.trim();
  if (candidate.includes('%')) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return null;
    }
  }

  const parts = candidate.split('.');
  if (parts.length !== 3) return null;
  const [version, b64u, checksum] = parts;
  if (version !== COOKIE_VERSION_PREFIX) return null;
  if (!/^[0-9a-f]{8}$/.test(checksum)) return null;

  const expectedChecksum = fnv1a32Hex(`${version}.${b64u}`);
  if (checksum !== expectedChecksum) return null;

  try {
    const jsonText = base64UrlToUtf8(b64u);
    if (!jsonText) return null;
    const compact = JSON.parse(jsonText);
    if (!isPlainObject(compact) || compact.v !== 1) return null;
    if (!Number.isInteger(compact.r) || compact.r < 1) return null;
    if (typeof compact.u !== 'number' || !Number.isFinite(compact.u)) return null;

    const expanded = {
      v: 1,
      rev: compact.r,
      updatedAt: compact.u,
      theme: compact.t ?? DEFAULT_VAULT_STATE.theme,
      view: compact.w ?? DEFAULT_VAULT_STATE.view,
      sort: compact.s ?? DEFAULT_VAULT_STATE.sort,
      category: compact.c ?? DEFAULT_VAULT_STATE.category,
      launchTarget: compact.l ?? DEFAULT_VAULT_STATE.launchTarget,
      audioMuted:
        compact.m === undefined ? DEFAULT_VAULT_STATE.audioMuted : Boolean(compact.m),
      showHidden:
        compact.h === undefined ? DEFAULT_VAULT_STATE.showHidden : Boolean(compact.h),
      unlockPrivate:
        compact.p === undefined ? DEFAULT_VAULT_STATE.unlockPrivate : Boolean(compact.p),
      installDismissed:
        compact.d === undefined ? DEFAULT_VAULT_STATE.installDismissed : Boolean(compact.d),
      pinned: Array.isArray(compact.P) ? compact.P : [],
      hidden: Array.isArray(compact.H) ? compact.H : [],
      curated: {},
    };

    if (isPlainObject(compact.C)) {
      for (const slug of Object.keys(compact.C)) {
        if (FORBIDDEN_KEYS.has(slug)) continue;
        const entry = compact.C[slug];
        if (!isPlainObject(entry)) continue;
        const mapped = {};
        if (typeof entry.t === 'string') mapped.title = entry.t;
        if (typeof entry.d === 'string') mapped.description = entry.d;
        if (typeof entry.l === 'string') mapped.liveUrl = entry.l;
        if (typeof entry.c === 'number' && CATEGORY_TAGS[entry.c]) {
          mapped.category = CATEGORY_TAGS[entry.c];
        } else if (typeof entry.c === 'string') {
          mapped.category = entry.c;
        }
        if (typeof entry.a === 'string') mapped.accentHex = entry.a;
        expanded.curated[slug] = mapped;
      }
    }

    return normalizeVaultState(expanded);
  } catch {
    return null;
  }
}

function resolveEnv(envOverrides) {
  const hasOverride = (key) => Object.prototype.hasOwnProperty.call(envOverrides, key);

  const getLocalStorage = () => {
    if (hasOverride('localStorage')) return envOverrides.localStorage || null;
    try {
      return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      return null;
    }
  };

  const getIndexedDb = () => {
    if (hasOverride('indexedDB')) return envOverrides.indexedDB || null;
    try {
      return typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : null;
    } catch {
      return null;
    }
  };

  const getDocument = () => {
    if (hasOverride('document')) return envOverrides.document || null;
    try {
      return typeof globalThis.document !== 'undefined' ? globalThis.document : null;
    } catch {
      return null;
    }
  };

  const now = typeof envOverrides.now === 'function' ? envOverrides.now : () => Date.now();

  return {
    getLocalStorage,
    getIndexedDb,
    getDocument,
    idbAdapter: hasOverride('idbStore') ? envOverrides.idbStore : null,
    now,
  };
}

function readStoreA(storage) {
  if (!storage || typeof storage.getItem !== 'function') return { available: false, state: null };
  try {
    const raw = storage.getItem(VAULT_KEY);
    if (!raw) return { available: true, state: null };
    return { available: true, state: parseStoredVaultState(JSON.parse(raw)) };
  } catch {
    return { available: false, state: null };
  }
}

function writeStoreA(storage, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(VAULT_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function safeCloseDb(db) {
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch {
      // Ignore close failures on mocks
    }
  }
}

function openVaultDb(idbFactory) {
  return new Promise((resolve, reject) => {
    try {
      const req = idbFactory.open(VAULT_IDB_NAME, VAULT_IDB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event?.target?.result || req.result;
        if (!db) return;
        if (!db.objectStoreNames?.contains(VAULT_IDB_STATE_STORE)) {
          db.createObjectStore(VAULT_IDB_STATE_STORE);
        }
        if (!db.objectStoreNames?.contains(VAULT_IDB_PAT_STORE)) {
          db.createObjectStore(VAULT_IDB_PAT_STORE);
        }
      };
      req.onsuccess = (event) => {
        const db = event?.target?.result || req.result;
        if (db && typeof db === 'object') {
          db.onversionchange = () => safeCloseDb(db);
        }
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    } catch (err) {
      reject(err);
    }
  });
}

async function readStoreB(idbFactory, idbAdapter) {
  if (idbAdapter && typeof idbAdapter.get === 'function') {
    try {
      const value = await idbAdapter.get(VAULT_IDB_ROOT_KEY);
      return { available: true, state: parseStoredVaultState(value) };
    } catch {
      return { available: false, state: null };
    }
  }

  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return { available: false, state: null };
  }

  let db = null;
  try {
    db = await openVaultDb(idbFactory);
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_STATE_STORE, 'readonly');
      const store = tx.objectStore(VAULT_IDB_STATE_STORE);
      const req = store.get(VAULT_IDB_ROOT_KEY);
      let settled = false;
      req.onsuccess = (event) => {
        settled = true;
        resolve(event?.target?.result ?? req.result ?? null);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
      if ('oncomplete' in tx) {
        tx.oncomplete = () => {
          safeCloseDb(db);
          if (!settled) resolve(req.result ?? null);
        };
      }
      if ('onerror' in tx) {
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      }
    });
    safeCloseDb(db);
    return { available: true, state: parseStoredVaultState(value) };
  } catch {
    safeCloseDb(db);
    return { available: false, state: null };
  }
}

async function writeStoreB(idbFactory, idbAdapter, state) {
  if (idbAdapter && typeof idbAdapter.set === 'function') {
    try {
      await idbAdapter.set(VAULT_IDB_ROOT_KEY, cloneState(state));
      return true;
    } catch {
      return false;
    }
  }

  if (!idbFactory || typeof idbFactory.open !== 'function') return false;

  let db = null;
  try {
    db = await openVaultDb(idbFactory);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_IDB_STATE_STORE, 'readwrite');
      const store = tx.objectStore(VAULT_IDB_STATE_STORE);
      const req = store.put(cloneState(state), VAULT_IDB_ROOT_KEY);
      const isNativeTx =
        typeof IDBTransaction !== 'undefined' && tx instanceof IDBTransaction;
      let completed = false;

      if ('oncomplete' in tx) {
        tx.oncomplete = () => {
          completed = true;
          safeCloseDb(db);
          resolve();
        };
      }
      if ('onerror' in tx) {
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write tx failed'));
      }
      if ('onabort' in tx) {
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write tx aborted'));
      }
      req.onsuccess = () => {
        if (!isNativeTx && !completed) {
          queueMicrotask(() => {
            if (!completed) {
              safeCloseDb(db);
              resolve();
            }
          });
        }
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB put failed'));
    });
    safeCloseDb(db);
    return true;
  } catch {
    safeCloseDb(db);
    return false;
  }
}

function readCookieRaw(doc) {
  if (!doc || typeof doc.cookie !== 'string' || !doc.cookie) return null;
  const prefix = `${VAULT_KEY}=`;
  const parts = doc.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const rawVal = trimmed.slice(prefix.length).trim();
      return rawVal.length > 0 ? rawVal : null;
    }
  }
  return null;
}

function readStoreC(doc) {
  if (!doc || typeof doc.cookie !== 'string') return { available: false, raw: null, state: null };
  const raw = readCookieRaw(doc);
  if (!raw) return { available: true, raw: null, state: null };
  return { available: true, raw, state: decodeShadowCookiePayload(raw) };
}

function writeStoreC(doc, encoded) {
  if (!doc || typeof doc.cookie !== 'string') return false;
  try {
    doc.cookie = `${VAULT_KEY}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const persisted = readCookieRaw(doc);
    return persisted === encoded;
  } catch {
    return false;
  }
}

function compareCandidates(a, b) {
  if (a.state.rev !== b.state.rev) return b.state.rev - a.state.rev;
  if (a.state.updatedAt !== b.state.updatedAt) return b.state.updatedAt - a.state.updatedAt;
  return a.priority - b.priority;
}

function statesEqual(a, b) {
  return Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Creates a triple-store vault controller with optional dependency overrides for Node testing.
 *
 * @param {object} [envOverrides]
 * @returns {object}
 */
export function createCookieVault(envOverrides = {}) {
  const env = resolveEnv(envOverrides);
  const listeners = new Set();

  let initialized = false;
  let currentState = cloneState(DEFAULT_VAULT_STATE);
  let diagnostics = {
    rev: currentState.rev,
    updatedAt: currentState.updatedAt,
    cookieBytes: utf8ByteLength(encodeShadowCookiePayload(currentState)),
    storeAOk: false,
    storeBOk: false,
    storeCOk: false,
    lastHealedFrom: 'none',
    lastRepairedStores: [],
  };

  let opChain = Promise.resolve();
  function enqueue(task) {
    const run = opChain.then(task, task);
    opChain = run.catch(() => {});
    return run;
  }

  function notify() {
    const snapshot = cloneState(currentState);
    for (const listener of listeners) {
      try {
        listener(cloneState(snapshot));
      } catch {
        // Isolate subscriber exceptions
      }
    }
  }

  async function reconcileInternal() {
    const storage = env.getLocalStorage();
    const idbFactory = env.getIndexedDb();
    const doc = env.getDocument();

    const storeA = readStoreA(storage);
    const storeB = await readStoreB(idbFactory, env.idbAdapter);
    const storeC = readStoreC(doc);

    const candidates = [];
    if (storeA.state) candidates.push({ name: 'localStorage', priority: 0, state: storeA.state });
    if (storeB.state) candidates.push({ name: 'indexedDB', priority: 1, state: storeB.state });
    if (storeC.state) candidates.push({ name: 'cookie', priority: 2, state: storeC.state });

    let winnerName = 'default';
    let winnerState = cloneState(DEFAULT_VAULT_STATE);

    if (candidates.length > 0) {
      candidates.sort(compareCandidates);
      winnerName = candidates[0].name;
      winnerState = cloneState(candidates[0].state);
    }

    const expectedCookie = encodeShadowCookiePayload(winnerState);
    const needsRepairA = !storeA.state || !statesEqual(storeA.state, winnerState);
    const needsRepairB = !storeB.state || !statesEqual(storeB.state, winnerState);
    const needsRepairC = !storeC.state || storeC.raw !== expectedCookie;

    const repairedStores = [];
    let storeAOk = Boolean(storeA.state) && !needsRepairA;
    let storeBOk = Boolean(storeB.state) && !needsRepairB;
    let storeCOk = Boolean(storeC.state) && !needsRepairC;

    if (needsRepairA && writeStoreA(storage, winnerState)) {
      storeAOk = true;
      repairedStores.push('localStorage');
    }
    if (needsRepairB && (await writeStoreB(idbFactory, env.idbAdapter, winnerState))) {
      storeBOk = true;
      repairedStores.push('indexedDB');
    }
    if (needsRepairC && writeStoreC(doc, expectedCookie)) {
      storeCOk = true;
      repairedStores.push('cookie');
    }

    const healedFrom = repairedStores.length > 0 ? winnerName : 'none';
    const stateChanged = !initialized || !statesEqual(currentState, winnerState);

    currentState = winnerState;
    initialized = true;
    diagnostics = {
      rev: winnerState.rev,
      updatedAt: winnerState.updatedAt,
      cookieBytes: utf8ByteLength(expectedCookie),
      storeAOk,
      storeBOk,
      storeCOk,
      lastHealedFrom: healedFrom,
      lastRepairedStores: repairedStores.slice(),
    };

    if (stateChanged) notify();

    return {
      state: cloneState(winnerState),
      healedFrom,
      repairedStores: repairedStores.slice(),
    };
  }

  async function persistAllStores(nextState) {
    const storage = env.getLocalStorage();
    const idbFactory = env.getIndexedDb();
    const doc = env.getDocument();

    const encoded = encodeShadowCookiePayload(nextState);
    const storeAOk = writeStoreA(storage, nextState);
    const storeBOk = await writeStoreB(idbFactory, env.idbAdapter, nextState);
    const storeCOk = writeStoreC(doc, encoded);

    currentState = nextState;
    initialized = true;
    diagnostics = {
      rev: nextState.rev,
      updatedAt: nextState.updatedAt,
      cookieBytes: utf8ByteLength(encoded),
      storeAOk,
      storeBOk,
      storeCOk,
      lastHealedFrom: 'none',
      lastRepairedStores: [],
    };

    notify();
    return cloneState(nextState);
  }

  async function updateInternal(mutatorFn) {
    if (!initialized) {
      await reconcileInternal();
    }
    if (typeof mutatorFn !== 'function') {
      throw new TypeError('mutatorFn must be a function');
    }

    const draft = cloneState(currentState);
    const result = await mutatorFn(draft);
    const candidate = isPlainObject(result) ? result : draft;

    const nextState = normalizeVaultState({
      ...candidate,
      v: 1,
      rev: currentState.rev + 1,
      updatedAt: env.now(),
    });

    return persistAllStores(nextState);
  }

  return {
    async init() {
      const res = await enqueue(reconcileInternal);
      return res.state;
    },

    reconcile() {
      return enqueue(reconcileInternal);
    },

    getState() {
      return cloneState(currentState);
    },

    update(mutatorFn) {
      return enqueue(() => updateInternal(mutatorFn));
    },

    setPreference(key, value) {
      if (!PREFERENCE_KEYS.has(key)) {
        return Promise.reject(new Error(`Unsupported vault preference key: ${String(key)}`));
      }
      return enqueue(() =>
        updateInternal((draft) => {
          draft[key] = value;
        })
      );
    },

    togglePin(slug) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return Promise.resolve(cloneState(currentState));
      return enqueue(() =>
        updateInternal((draft) => {
          const idx = draft.pinned.indexOf(cleanSlug);
          if (idx >= 0) {
            draft.pinned.splice(idx, 1);
          } else {
            draft.pinned.push(cleanSlug);
          }
        })
      );
    },

    toggleHide(slug) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return Promise.resolve(cloneState(currentState));
      return enqueue(() =>
        updateInternal((draft) => {
          const idx = draft.hidden.indexOf(cleanSlug);
          if (idx >= 0) {
            draft.hidden.splice(idx, 1);
          } else {
            draft.hidden.push(cleanSlug);
          }
        })
      );
    },

    setCuration(slug, patch) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug || !isPlainObject(patch)) {
        return Promise.resolve(cloneState(currentState));
      }
      return enqueue(() =>
        updateInternal((draft) => {
          const existing = draft.curated[cleanSlug] ? { ...draft.curated[cleanSlug] } : {};
          const merged = { ...existing };
          for (const key of ['title', 'description', 'liveUrl', 'category', 'accentHex']) {
            if (Object.prototype.hasOwnProperty.call(patch, key)) {
              merged[key] = patch[key];
            }
          }
          const sanitized = sanitizeCurationEntry(merged);
          if (sanitized) {
            draft.curated[cleanSlug] = sanitized;
          } else {
            delete draft.curated[cleanSlug];
          }
        })
      );
    },

    resetCuration(slug) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return Promise.resolve(cloneState(currentState));
      return enqueue(() =>
        updateInternal((draft) => {
          delete draft.curated[cleanSlug];
        })
      );
    },

    importState(statePatch) {
      if (!isPlainObject(statePatch)) {
        return Promise.reject(new TypeError('statePatch must be an object'));
      }
      const rawPatch =
        isPlainObject(statePatch.state) &&
        (statePatch.schema === 'KrunkedDeckConfigV1' ||
          (!Object.prototype.hasOwnProperty.call(statePatch, 'v') &&
            !Object.prototype.hasOwnProperty.call(statePatch, 'theme') &&
            !Object.prototype.hasOwnProperty.call(statePatch, 'pinned')))
          ? statePatch.state
          : statePatch;
      return enqueue(() =>
        updateInternal((draft) => {
          const merged = { ...draft };
          for (const key of Object.keys(DEFAULT_VAULT_STATE)) {
            if (key === 'v' || key === 'rev' || key === 'updatedAt') continue;
            if (Object.prototype.hasOwnProperty.call(rawPatch, key)) {
              merged[key] = rawPatch[key];
            }
          }
          return normalizeVaultState({
            ...merged,
            v: 1,
            rev: draft.rev + 1,
            updatedAt: env.now(),
          });
        })
      );
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('listener must be a function');
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getDiagnostics() {
      return {
        ...diagnostics,
        lastRepairedStores: diagnostics.lastRepairedStores.slice(),
      };
    },
  };
}

export const vault = createCookieVault();
