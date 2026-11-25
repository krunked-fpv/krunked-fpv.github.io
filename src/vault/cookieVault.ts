import { VAULT_COOKIE_MAX_BYTES, VAULT_IDB_NAME, VAULT_KEY } from '../config/site';
import type { ArtStyle, Category, SortMode, ThemeMode, ViewMode } from '../types/project';
import type {
  CookieShedLevel,
  CurationOverride,
  UserCurationOverride,
  VaultData,
  VaultPrefs,
  VaultStorageStatus,
  VaultStoreName,
} from '../types/vault';

export { VAULT_COOKIE_MAX_BYTES, VAULT_IDB_NAME, VAULT_KEY };
export type {
  CookieShedLevel,
  CurationOverride,
  UserCurationOverride,
  VaultData,
  VaultPrefs,
  VaultStorageStatus,
  VaultStoreName,
};

const VAULT_IDB_VERSION = 1;
const VAULT_IDB_STATE_STORE = 'state';
const VAULT_IDB_ROOT_KEY = 'root';
const COOKIE_VERSION_PREFIX = 'v2';

const VIEWS: readonly ViewMode[] = ['bento', 'grid', 'matrix'];
const SORTS: readonly SortMode[] = ['push', 'created', 'velocity', 'alpha'];
const THEMES: readonly ThemeMode[] = ['obsidian', 'daylight'];
const CATEGORIES: readonly Category[] = [
  'Game',
  'App',
  'Hardware/Sky',
  'Audio/Vinyl',
  'Automation',
  'Engine',
  'Utility',
];
const ART_STYLES: readonly ArtStyle[] = ['topo', 'orbital', 'synthwave', 'prism', 'groove'];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EMOJI_STRIP_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}]|\u2605)/gu;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;
const HAS_CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const SCRIPT_OR_STYLE_REGEX = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_REGEX = /<[^>]*>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export interface ShadowCookieEncoded {
  wire: string;
  bytes: number;
  shedLevel: CookieShedLevel;
}

export interface VaultIdbAdapter {
  get(key: string): Promise<unknown> | unknown;
  set(key: string, value: unknown): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
}

export interface VaultDocumentLike {
  cookie: string;
  location?: { protocol?: string };
}

export interface VaultEnvOverrides {
  localStorage?: Storage | null;
  indexedDB?: IDBFactory | null;
  idbStore?: VaultIdbAdapter | null;
  document?: VaultDocumentLike | null;
  isSecure?: boolean;
  now?: () => number;
}

export interface ReconcileResult {
  state: VaultData;
  status: VaultStorageStatus;
}

export interface CookieVaultController {
  loadSync(): VaultData;
  reconcile(): Promise<ReconcileResult>;
  save(data: VaultData): Promise<VaultData>;
  getState(): VaultData;
  getStatus(): VaultStorageStatus;
  subscribe(listener: (state: VaultData) => void): () => void;
  subscribeStatus(listener: (status: VaultStorageStatus) => void): () => void;
  _resetForTests(): void;
}

interface CompactCurationV2 {
  n?: string; // displayName
  g?: string; // tagline
  c?: number; // category index
  l?: string; // launchUrl
  x?: number; // accent 0..360
  y?: number; // artStyle index
  h?: 1 | 0; // hidden
  f?: 1 | 0; // featured
}

interface CompactCookieV2 {
  v: 2;
  r: number; // rev
  u: number; // updatedAt
  /** Uses `prefs.theme` key so `index.html` zero-FOUC pre-paint script reads shadow cookie directly. */
  prefs?: { theme: ThemeMode };
  t?: ThemeMode; // legacy/alternate compact theme alias
  w?: ViewMode; // view
  s?: SortMode; // sort
  f?: string; // filter
  a?: 1 | 0; // soundEnabled
  P?: string[]; // pins
  C?: Record<string, CompactCurationV2>; // curation
  S?: Record<string, string>; // seen
}

interface StoreReadResult {
  available: boolean;
  state: VaultData | null;
  raw?: string | null;
  legacyV1?: boolean;
}

export function defaultVault(): VaultData {
  return {
    v: 2,
    rev: 1,
    updatedAt: 0,
    pins: [],
    prefs: {
      view: 'bento',
      sort: 'push',
      filter: 'live',
      theme: 'obsidian',
      soundEnabled: false,
    },
    curation: {},
    seen: {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower]!;
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16);
      if (Number.isFinite(cp) && cp >= 0x20 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
        return String.fromCodePoint(cp);
      }
      return '';
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10);
      if (Number.isFinite(cp) && cp >= 0x20 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
        return String.fromCodePoint(cp);
      }
      return '';
    }
    return full;
  });
}

function sanitizePlainText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  const stripped = input.replace(SCRIPT_OR_STYLE_REGEX, ' ').replace(HTML_TAG_REGEX, ' ');
  const decoded = decodeHtmlEntities(stripped)
    .replace(SCRIPT_OR_STYLE_REGEX, ' ')
    .replace(HTML_TAG_REGEX, ' ');
  const cleaned = decoded
    .replace(EMOJI_STRIP_REGEX, '')
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return maxLen > 0 && cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

function sanitizeHttpUrl(rawUrl: unknown): string | undefined {
  if (typeof rawUrl !== 'string') return undefined;
  if (HAS_CONTROL_CHAR_REGEX.test(rawUrl)) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (!parsed.hostname) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function sanitizeSlug(rawSlug: unknown): string {
  if (typeof rawSlug !== 'string') return '';
  const cleaned = sanitizePlainText(rawSlug, 128);
  if (!cleaned || FORBIDDEN_KEYS.has(cleaned)) return '';
  return cleaned;
}

function sanitizeSlugArray(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawList) {
    const slug = sanitizeSlug(item);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

function sanitizeCurationEntry(rawEntry: unknown): CurationOverride | null {
  if (!isPlainObject(rawEntry)) return null;
  const entry: CurationOverride = {};

  const displayName = sanitizePlainText(rawEntry.displayName, 72);
  if (displayName) entry.displayName = displayName;

  const tagline = sanitizePlainText(rawEntry.tagline, 200);
  if (tagline) entry.tagline = tagline;

  if (typeof rawEntry.category === 'string') {
    const cat = rawEntry.category.trim() as Category;
    if (CATEGORIES.includes(cat)) entry.category = cat;
  }

  const launchUrl = sanitizeHttpUrl(rawEntry.launchUrl);
  if (launchUrl) entry.launchUrl = launchUrl;

  if (typeof rawEntry.accent === 'number' && Number.isFinite(rawEntry.accent)) {
    entry.accent = Math.min(360, Math.max(0, Math.round(rawEntry.accent)));
  }

  if (typeof rawEntry.artStyle === 'string') {
    const style = rawEntry.artStyle.trim() as ArtStyle;
    if (ART_STYLES.includes(style)) entry.artStyle = style;
  }

  if (typeof rawEntry.hidden === 'boolean') entry.hidden = rawEntry.hidden;
  if (typeof rawEntry.featured === 'boolean') entry.featured = rawEntry.featured;

  return Object.keys(entry).length > 0 ? entry : null;
}

function sanitizeCurationMap(rawCuration: unknown): Record<string, CurationOverride> {
  const out: Record<string, CurationOverride> = {};
  if (!isPlainObject(rawCuration)) return out;
  for (const key of Object.keys(rawCuration)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const slug = sanitizeSlug(key);
    if (!slug) continue;
    const cleaned = sanitizeCurationEntry(rawCuration[key]);
    if (cleaned) out[slug] = cleaned;
  }
  return out;
}

function sanitizeSeenMap(rawSeen: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(rawSeen)) return out;
  for (const key of Object.keys(rawSeen)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const slug = sanitizeSlug(key);
    if (!slug) continue;
    const val = rawSeen[key];
    if (typeof val !== 'string') continue;
    const cleaned = val
      .replace(EMOJI_STRIP_REGEX, '')
      .replace(CONTROL_CHAR_REGEX, '')
      .trim()
      .slice(0, 64);
    if (cleaned) out[slug] = cleaned;
  }
  return out;
}

function sanitizePrefs(rawPrefs: unknown): VaultPrefs {
  const defaults = defaultVault().prefs;
  const p = isPlainObject(rawPrefs) ? rawPrefs : {};
  const view = typeof p.view === 'string' && VIEWS.includes(p.view as ViewMode) ? (p.view as ViewMode) : defaults.view;
  const sort = typeof p.sort === 'string' && SORTS.includes(p.sort as SortMode) ? (p.sort as SortMode) : defaults.sort;
  const filter = sanitizePlainText(p.filter, 80) || defaults.filter;
  const theme =
    typeof p.theme === 'string' && THEMES.includes(p.theme as ThemeMode) ? (p.theme as ThemeMode) : defaults.theme;
  const soundEnabled = typeof p.soundEnabled === 'boolean' ? p.soundEnabled : defaults.soundEnabled;
  return { view, sort, filter, theme, soundEnabled };
}

/** Normalizes any partial/untrusted object into a strictly sanitized V2 VaultData. */
export function normalizeVault(raw: unknown): VaultData {
  const d = defaultVault();
  const src = isPlainObject(raw) ? raw : {};

  const rev =
    typeof src.rev === 'number' && Number.isInteger(src.rev) && src.rev >= 1 ? src.rev : d.rev;
  const updatedAt =
    typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt) && src.updatedAt >= 0
      ? Math.trunc(src.updatedAt)
      : d.updatedAt;

  return {
    v: 2,
    rev,
    updatedAt,
    pins: sanitizeSlugArray(src.pins),
    prefs: sanitizePrefs(src.prefs),
    curation: sanitizeCurationMap(src.curation),
    seen: sanitizeSeenMap(src.seen),
  };
}

/**
 * Strictly validates a persisted V2 (or legacy V1) vault payload.
 * Returns a cleanly migrated & sanitized VaultData, or null if invalid/corrupt.
 */
export function validateVault(raw: unknown): VaultData | null {
  if (!isPlainObject(raw)) return null;
  if (raw.v !== 2 && raw.v !== 1) return null;
  if (raw.v === 2 && (typeof raw.rev !== 'number' || !Number.isInteger(raw.rev) || raw.rev < 1)) {
    return null;
  }
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0) {
    return null;
  }
  if (!Array.isArray(raw.pins) || !raw.pins.every((item) => typeof item === 'string')) {
    return null;
  }
  if (raw.prefs !== undefined && raw.prefs !== null && !isPlainObject(raw.prefs)) {
    return null;
  }
  if (raw.curation !== undefined && raw.curation !== null && !isPlainObject(raw.curation)) {
    return null;
  }
  if (raw.seen !== undefined && raw.seen !== null && !isPlainObject(raw.seen)) {
    return null;
  }
  return normalizeVault(raw);
}

/** Backward-compatible alias for validateVault. */
export const validate = validateVault;

function cloneVault(state: VaultData): VaultData {
  const curation: Record<string, CurationOverride> = {};
  for (const slug of Object.keys(state.curation)) {
    curation[slug] = { ...state.curation[slug] };
  }
  return {
    v: 2,
    rev: state.rev,
    updatedAt: state.updatedAt,
    pins: state.pins.slice(),
    prefs: { ...state.prefs },
    curation,
    seen: { ...state.seen },
  };
}

function statesEqual(a: VaultData | null, b: VaultData | null): boolean {
  return Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function utf8ByteLength(str: string): number {
  return textEncoder.encode(str).length;
}

function fnv1a32Hex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function utf8ToBase64Url(str: string): string {
  const bytes = textEncoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64u: string): string | null {
  if (typeof b64u !== 'string' || !/^[A-Za-z0-9_-]+$/.test(b64u)) return null;
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return textDecoder.decode(bytes);
  } catch {
    return null;
  }
}

function buildCompactCookieObject(state: VaultData): CompactCookieV2 {
  const d = defaultVault().prefs;
  const compact: CompactCookieV2 = {
    v: 2,
    r: state.rev,
    u: state.updatedAt,
  };

  if (state.prefs.theme !== d.theme) compact.prefs = { theme: state.prefs.theme };
  if (state.prefs.view !== d.view) compact.w = state.prefs.view;
  if (state.prefs.sort !== d.sort) compact.s = state.prefs.sort;
  if (state.prefs.filter !== d.filter) compact.f = state.prefs.filter;
  if (state.prefs.soundEnabled !== d.soundEnabled) compact.a = state.prefs.soundEnabled ? 1 : 0;
  if (state.pins.length > 0) compact.P = state.pins.slice();

  const curationSlugs = Object.keys(state.curation);
  if (curationSlugs.length > 0) {
    const compactCuration: Record<string, CompactCurationV2> = {};
    for (const slug of curationSlugs) {
      const src = state.curation[slug]!;
      const item: CompactCurationV2 = {};
      if (src.displayName) item.n = src.displayName;
      if (src.tagline) item.g = src.tagline;
      if (src.category) {
        const idx = CATEGORIES.indexOf(src.category);
        if (idx >= 0) item.c = idx;
      }
      if (src.launchUrl) item.l = src.launchUrl;
      if (typeof src.accent === 'number') item.x = src.accent;
      if (src.artStyle) {
        const idx = ART_STYLES.indexOf(src.artStyle);
        if (idx >= 0) item.y = idx;
      }
      if (typeof src.hidden === 'boolean') item.h = src.hidden ? 1 : 0;
      if (typeof src.featured === 'boolean') item.f = src.featured ? 1 : 0;
      if (Object.keys(item).length > 0) compactCuration[slug] = item;
    }
    if (Object.keys(compactCuration).length > 0) compact.C = compactCuration;
  }

  if (Object.keys(state.seen).length > 0) {
    compact.S = { ...state.seen };
  }

  return compact;
}

function serializeCompactWire(compact: CompactCookieV2): { wire: string; bytes: number } {
  const b64u = utf8ToBase64Url(JSON.stringify(compact));
  const body = `${COOKIE_VERSION_PREFIX}.${b64u}`;
  const wire = `${body}.${fnv1a32Hex(body)}`;
  return { wire, bytes: utf8ByteLength(wire) };
}

function fitsCookieBudget(bytes: number): boolean {
  return bytes < VAULT_COOKIE_MAX_BYTES;
}

/**
 * Encodes VaultData into a checksummed `v2.<base64url>.<fnv1a32hex>` shadow cookie
 * guaranteed strictly under VAULT_COOKIE_MAX_BYTES (3800 UTF-8 bytes) via
 * 4-stage progressive shedding: (1) seen, (2) curation secondary/taglines,
 * (3) oldest curation entries, (4) tail-truncated pins.
 */
export function encodeShadowCookie(state: VaultData): ShadowCookieEncoded {
  const normalized = normalizeVault(state);
  const compact = buildCompactCookieObject(normalized);

  let res = serializeCompactWire(compact);
  if (fitsCookieBudget(res.bytes)) {
    return { ...res, shedLevel: 'none' };
  }

  // Stage 1: drop `seen` commit markers first
  if (compact.S) {
    delete compact.S;
    res = serializeCompactWire(compact);
    if (fitsCookieBudget(res.bytes)) {
      return { ...res, shedLevel: 'seen' };
    }
  }

  // Stage 2 & 3: progressively shed `curation`
  if (compact.C) {
    // Stage 2a: drop `tagline` (`g`) oldest-first
    const cMap2a = compact.C;
    for (const slug of Object.keys(cMap2a)) {
      const entry = cMap2a[slug]!;
      if (entry.g !== undefined) {
        delete entry.g;
        if (Object.keys(entry).length === 0) delete cMap2a[slug];
        const emptied = Object.keys(cMap2a).length === 0;
        if (emptied) delete compact.C;
        res = serializeCompactWire(compact);
        if (fitsCookieBudget(res.bytes)) {
          return { ...res, shedLevel: 'curation' };
        }
        if (emptied) break;
      }
    }

    // Stage 2b: drop secondary curation fields (`l`, `c`, `x`, `y`, `f`, `h`) keeping `n` (displayName)
    if (compact.C) {
      const cMap2b = compact.C;
      for (const slug of Object.keys(cMap2b)) {
        const entry = cMap2b[slug]!;
        let modified = false;
        for (const field of ['l', 'c', 'x', 'y', 'f', 'h'] as const) {
          if (entry[field] !== undefined) {
            delete entry[field];
            modified = true;
          }
        }
        if (Object.keys(entry).length === 0) delete cMap2b[slug];
        const emptied = Object.keys(cMap2b).length === 0;
        if (emptied) delete compact.C;
        if (modified || emptied) {
          res = serializeCompactWire(compact);
          if (fitsCookieBudget(res.bytes)) {
            return { ...res, shedLevel: 'curation' };
          }
        }
        if (emptied) break;
      }
    }

    // Stage 3a: truncate long displayName overrides > 32 chars
    if (compact.C) {
      const cMap3a = compact.C;
      for (const slug of Object.keys(cMap3a)) {
        const entry = cMap3a[slug]!;
        if (entry.n && entry.n.length > 32) {
          entry.n = entry.n.slice(0, 32).trim();
          res = serializeCompactWire(compact);
          if (fitsCookieBudget(res.bytes)) {
            return { ...res, shedLevel: 'curation' };
          }
        }
      }
    }

    // Stage 3b: prune oldest curation entries (binary-jump if huge, else oldest-first)
    if (compact.C) {
      const cMap3b = compact.C;
      const slugs = Object.keys(cMap3b);
      if (slugs.length > 48) {
        let lo = 0;
        let hi = slugs.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const sliced: Record<string, CompactCurationV2> = {};
          for (let i = mid; i < slugs.length; i += 1) {
            const k = slugs[i]!;
            sliced[k] = cMap3b[k]!;
          }
          if (Object.keys(sliced).length > 0) {
            compact.C = sliced;
          } else {
            delete compact.C;
          }
          const probe = serializeCompactWire(compact);
          if (fitsCookieBudget(probe.bytes)) {
            hi = mid;
          } else {
            lo = mid + 1;
          }
        }
        const kept: Record<string, CompactCurationV2> = {};
        for (let i = lo; i < slugs.length; i += 1) {
          const k = slugs[i]!;
          kept[k] = cMap3b[k]!;
        }
        if (Object.keys(kept).length > 0) {
          compact.C = kept;
        } else {
          delete compact.C;
        }
        res = serializeCompactWire(compact);
        if (fitsCookieBudget(res.bytes)) {
          return { ...res, shedLevel: 'curation' };
        }
      } else {
        for (const slug of slugs) {
          delete cMap3b[slug];
          if (Object.keys(cMap3b).length === 0) delete compact.C;
          res = serializeCompactWire(compact);
          if (fitsCookieBudget(res.bytes)) {
            return { ...res, shedLevel: 'curation' };
          }
        }
      }
    }
  }

  // Stage 4: emergency tail-truncation of `pins` (preserving prefs + theme + rev)
  if (compact.P && compact.P.length > 0) {
    const allPins = compact.P;
    let lo = 0;
    let hi = allPins.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      compact.P = allPins.slice(0, mid);
      const probe = serializeCompactWire(compact);
      if (fitsCookieBudget(probe.bytes)) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    if (lo > 0) {
      compact.P = allPins.slice(0, lo);
    } else {
      delete compact.P;
    }
    res = serializeCompactWire(compact);
    if (fitsCookieBudget(res.bytes)) {
      return { ...res, shedLevel: 'pins' };
    }
  }

  // Final guaranteed-under-budget minimal envelope (preserves rev, updatedAt, prefs.theme)
  const minimal: CompactCookieV2 = {
    v: 2,
    r: normalized.rev,
    u: normalized.updatedAt,
    ...(normalized.prefs.theme !== 'obsidian' ? { prefs: { theme: normalized.prefs.theme } } : {}),
  };
  res = serializeCompactWire(minimal);
  return { ...res, shedLevel: 'pins' };
}

/**
 * Decodes and verifies a V2 shadow cookie (`v2.<b64u>.<fnv1a32hex>`)
 * or migrates a legacy V1 URI-encoded JSON cookie.
 * Returns null on malformed payloads or checksum mismatch.
 */
export function decodeShadowCookie(raw: string): VaultData | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let candidate = raw.trim();
  if (candidate.includes('%')) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return null;
    }
  }

  // Legacy V1 URI-JSON cookie migration path
  if (candidate.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!isPlainObject(parsed) || parsed.v !== 1) return null;
      return validateVault(parsed);
    } catch {
      return null;
    }
  }

  const parts = candidate.split('.');
  if (parts.length !== 3) return null;
  const [version, b64u, checksum] = parts;
  if (version !== COOKIE_VERSION_PREFIX || !b64u || !checksum) return null;
  if (!/^[0-9a-f]{8}$/.test(checksum)) return null;

  if (checksum !== fnv1a32Hex(`${version}.${b64u}`)) return null;

  const jsonText = base64UrlToUtf8(b64u);
  if (!jsonText) return null;

  try {
    const compact: unknown = JSON.parse(jsonText);
    if (!isPlainObject(compact) || compact.v !== 2) return null;
    if (typeof compact.r !== 'number' || !Number.isInteger(compact.r) || compact.r < 1) return null;
    if (typeof compact.u !== 'number' || !Number.isFinite(compact.u) || compact.u < 0) return null;

    const d = defaultVault().prefs;
    const curation: Record<string, CurationOverride> = {};
    if (isPlainObject(compact.C)) {
      for (const slug of Object.keys(compact.C)) {
        if (FORBIDDEN_KEYS.has(slug)) continue;
        const item = compact.C[slug];
        if (!isPlainObject(item)) continue;
        const mapped: Record<string, unknown> = {};
        if (typeof item.n === 'string') mapped.displayName = item.n;
        if (typeof item.g === 'string') mapped.tagline = item.g;
        if (typeof item.c === 'number' && CATEGORIES[item.c]) mapped.category = CATEGORIES[item.c];
        if (typeof item.l === 'string') mapped.launchUrl = item.l;
        if (typeof item.x === 'number') mapped.accent = item.x;
        if (typeof item.y === 'number' && ART_STYLES[item.y]) mapped.artStyle = ART_STYLES[item.y];
        if (item.h !== undefined) mapped.hidden = Boolean(item.h);
        if (item.f !== undefined) mapped.featured = Boolean(item.f);
        const cleaned = sanitizeCurationEntry(mapped);
        if (cleaned) curation[slug] = cleaned;
      }
    }

    return normalizeVault({
      v: 2,
      rev: compact.r,
      updatedAt: compact.u,
      pins: Array.isArray(compact.P) ? compact.P : [],
      prefs: {
        view: compact.w ?? d.view,
        sort: compact.s ?? d.sort,
        filter: compact.f ?? d.filter,
        theme: (isPlainObject(compact.prefs) ? compact.prefs.theme : undefined) ?? compact.t ?? d.theme,
        soundEnabled: compact.a === undefined ? d.soundEnabled : Boolean(compact.a),
      },
      curation,
      seen: isPlainObject(compact.S) ? compact.S : {},
    });
  } catch {
    return null;
  }
}

function resolveEnv(envOverrides: VaultEnvOverrides) {
  const hasOverride = (key: keyof VaultEnvOverrides) =>
    Object.prototype.hasOwnProperty.call(envOverrides, key);

  const getLocalStorage = (): Storage | null => {
    if (hasOverride('localStorage')) return envOverrides.localStorage ?? null;
    try {
      return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      return null;
    }
  };

  const getIndexedDb = (): IDBFactory | null => {
    if (hasOverride('indexedDB')) return envOverrides.indexedDB ?? null;
    try {
      return typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : null;
    } catch {
      return null;
    }
  };

  const getDocument = (): VaultDocumentLike | null => {
    if (hasOverride('document')) return envOverrides.document ?? null;
    try {
      return typeof globalThis.document !== 'undefined' ? globalThis.document : null;
    } catch {
      return null;
    }
  };

  const isSecureContext = (doc: VaultDocumentLike | null): boolean => {
    if (hasOverride('isSecure')) return Boolean(envOverrides.isSecure);
    if (doc?.location?.protocol === 'https:') return true;
    try {
      return typeof globalThis.location !== 'undefined' && globalThis.location.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const now = typeof envOverrides.now === 'function' ? envOverrides.now : () => Date.now();

  return {
    getLocalStorage,
    getIndexedDb,
    getDocument,
    isSecureContext,
    idbAdapter: hasOverride('idbStore') ? (envOverrides.idbStore ?? null) : null,
    now,
  };
}

function readStoreA(storage: Storage | null): StoreReadResult {
  if (!storage || typeof storage.getItem !== 'function') {
    return { available: false, state: null };
  }
  try {
    const raw = storage.getItem(VAULT_KEY);
    if (!raw) return { available: true, state: null };
    const parsed: unknown = JSON.parse(raw);
    const legacyV1 = isPlainObject(parsed) && parsed.v === 1;
    return { available: true, state: validateVault(parsed), legacyV1 };
  } catch {
    return { available: true, state: null };
  }
}

function writeStoreA(storage: Storage | null, state: VaultData): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(VAULT_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function safeCloseDb(db: IDBDatabase | null): void {
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch {
      // Ignore close errors on mock implementations
    }
  }
}

function openVaultDb(idbFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = idbFactory.open(VAULT_IDB_NAME, VAULT_IDB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event?.target as IDBOpenDBRequest | null)?.result ?? req.result;
        if (!db) return;
        if (!db.objectStoreNames?.contains(VAULT_IDB_STATE_STORE)) {
          db.createObjectStore(VAULT_IDB_STATE_STORE);
        }
      };
      req.onsuccess = (event) => {
        const db = (event?.target as IDBOpenDBRequest | null)?.result ?? req.result;
        if (db && typeof db === 'object') {
          db.onversionchange = () => safeCloseDb(db);
        }
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    } catch (err) {
      reject(err);
    }
  });
}

async function readStoreB(
  idbFactory: IDBFactory | null,
  idbAdapter: VaultIdbAdapter | null,
): Promise<StoreReadResult> {
  if (idbAdapter && typeof idbAdapter.get === 'function') {
    try {
      const value = await idbAdapter.get(VAULT_IDB_ROOT_KEY);
      return { available: true, state: validateVault(value) };
    } catch {
      return { available: false, state: null };
    }
  }

  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return { available: false, state: null };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openVaultDb(idbFactory);
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db!.transaction(VAULT_IDB_STATE_STORE, 'readonly');
      const store = tx.objectStore(VAULT_IDB_STATE_STORE);
      const req = store.get(VAULT_IDB_ROOT_KEY);
      let settled = false;
      req.onsuccess = (event) => {
        settled = true;
        resolve((event?.target as IDBRequest | null)?.result ?? req.result ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
      if ('oncomplete' in tx) {
        tx.oncomplete = () => {
          safeCloseDb(db);
          if (!settled) resolve(req.result ?? null);
        };
      }
      if ('onerror' in tx) {
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read tx failed'));
      }
    });
    safeCloseDb(db);
    return { available: true, state: validateVault(value) };
  } catch {
    safeCloseDb(db);
    return { available: false, state: null };
  }
}

async function writeStoreB(
  idbFactory: IDBFactory | null,
  idbAdapter: VaultIdbAdapter | null,
  state: VaultData,
): Promise<boolean> {
  if (idbAdapter && typeof idbAdapter.set === 'function') {
    try {
      await idbAdapter.set(VAULT_IDB_ROOT_KEY, cloneVault(state));
      return true;
    } catch {
      return false;
    }
  }

  if (!idbFactory || typeof idbFactory.open !== 'function') return false;

  let db: IDBDatabase | null = null;
  try {
    db = await openVaultDb(idbFactory);
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(VAULT_IDB_STATE_STORE, 'readwrite');
      const store = tx.objectStore(VAULT_IDB_STATE_STORE);
      const req = store.put(cloneVault(state), VAULT_IDB_ROOT_KEY);
      const isNativeTx = typeof IDBTransaction !== 'undefined' && tx instanceof IDBTransaction;
      let completed = false;

      if ('oncomplete' in tx) {
        tx.oncomplete = () => {
          completed = true;
          safeCloseDb(db);
          resolve();
        };
      }
      if ('onerror' in tx) {
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write tx failed'));
      }
      if ('onabort' in tx) {
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write tx aborted'));
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
      req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
    });
    safeCloseDb(db);
    return true;
  } catch {
    safeCloseDb(db);
    return false;
  }
}

function readCookieRaw(doc: VaultDocumentLike | null): string | null {
  if (!doc || typeof doc.cookie !== 'string' || !doc.cookie) return null;
  const prefix = `${VAULT_KEY}=`;
  const parts = doc.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const val = trimmed.slice(prefix.length).trim();
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

function readStoreC(doc: VaultDocumentLike | null): StoreReadResult {
  if (!doc || typeof doc.cookie !== 'string') {
    return { available: false, raw: null, state: null };
  }
  const raw = readCookieRaw(doc);
  if (!raw) return { available: true, raw: null, state: null };
  return { available: true, raw, state: decodeShadowCookie(raw) };
}

function writeStoreC(doc: VaultDocumentLike | null, wire: string, secure: boolean): boolean {
  if (!doc || typeof doc.cookie !== 'string') return false;
  try {
    const secureAttr = secure ? '; Secure' : '';
    doc.cookie = `${VAULT_KEY}=${wire}; Path=/; Max-Age=31536000; SameSite=Lax${secureAttr}`;
    return readCookieRaw(doc) === wire;
  } catch {
    return false;
  }
}

interface Candidate {
  name: VaultStoreName;
  priority: number;
  state: VaultData;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.state.rev !== b.state.rev) return b.state.rev - a.state.rev;
  if (a.state.updatedAt !== b.state.updatedAt) return b.state.updatedAt - a.state.updatedAt;
  return a.priority - b.priority;
}

function makeFrozenStatus(input: Omit<VaultStorageStatus, 'healthyCount'>): VaultStorageStatus {
  const healthyCount = (
    (input.stores.localStorage ? 1 : 0) +
    (input.stores.indexedDB ? 1 : 0) +
    (input.stores.cookie ? 1 : 0)
  ) as 0 | 1 | 2 | 3;

  return Object.freeze({
    rev: input.rev,
    updatedAt: input.updatedAt,
    cookieBytes: input.cookieBytes,
    cookieBudget: input.cookieBudget,
    cookieShedLevel: input.cookieShedLevel,
    stores: Object.freeze({
      localStorage: input.stores.localStorage,
      indexedDB: input.stores.indexedDB,
      cookie: input.stores.cookie,
    }),
    healthyCount,
    lastHealedFrom: input.lastHealedFrom,
    lastRepairedStores: Object.freeze(input.lastRepairedStores.slice()) as VaultStoreName[],
  });
}

/**
 * Creates a triple-redundant auto-healing vault controller across:
 * - Store A: localStorage['krunked-cookie-vault-v1'] (plain JSON for zero-FOUC bootstrap)
 * - Store B: IndexedDB 'krunked_vault_v1' (objectStore 'state', key 'root')
 * - Store C: Shadow Cookie 'krunked-cookie-vault-v1' (< 3800 UTF-8 bytes)
 */
export function createCookieVault(envOverrides: VaultEnvOverrides = {}): CookieVaultController {
  const env = resolveEnv(envOverrides);
  const stateListeners = new Set<(state: VaultData) => void>();
  const statusListeners = new Set<(status: VaultStorageStatus) => void>();

  let currentState: VaultData = defaultVault();
  let writeEpoch = 0;
  let opChain: Promise<unknown> = Promise.resolve();

  const initialCookie = encodeShadowCookie(currentState);
  let statusSnapshot: VaultStorageStatus = makeFrozenStatus({
    rev: currentState.rev,
    updatedAt: currentState.updatedAt,
    cookieBytes: initialCookie.bytes,
    cookieBudget: VAULT_COOKIE_MAX_BYTES,
    cookieShedLevel: initialCookie.shedLevel,
    stores: { localStorage: false, indexedDB: false, cookie: false },
    lastHealedFrom: 'none',
    lastRepairedStores: [],
  });

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = opChain.then(task, task);
    opChain = run.catch(() => {});
    return run;
  }

  function notifyState(): void {
    const snapshot = cloneVault(currentState);
    for (const listener of stateListeners) {
      try {
        listener(cloneVault(snapshot));
      } catch {
        // Isolate subscriber exceptions
      }
    }
  }

  function setStatus(next: Omit<VaultStorageStatus, 'healthyCount'>): void {
    statusSnapshot = makeFrozenStatus(next);
    for (const listener of statusListeners) {
      try {
        listener(statusSnapshot);
      } catch {
        // Isolate subscriber exceptions
      }
    }
  }

  /**
   * Synchronous fast-boot read across localStorage + shadow cookie.
   * Never seeds defaults when both are empty so async reconcile() can recover from IndexedDB.
   */
  function loadSync(): VaultData {
    const storage = env.getLocalStorage();
    const doc = env.getDocument();
    const storeA = readStoreA(storage);
    const storeC = readStoreC(doc);

    const candidates: Candidate[] = [];
    if (storeA.state) candidates.push({ name: 'localStorage', priority: 0, state: storeA.state });
    if (storeC.state) candidates.push({ name: 'cookie', priority: 2, state: storeC.state });

    if (candidates.length === 0) {
      currentState = defaultVault();
      const encoded = encodeShadowCookie(currentState);
      setStatus({
        rev: currentState.rev,
        updatedAt: currentState.updatedAt,
        cookieBytes: encoded.bytes,
        cookieBudget: VAULT_COOKIE_MAX_BYTES,
        cookieShedLevel: encoded.shedLevel,
        stores: {
          localStorage: false,
          indexedDB: statusSnapshot.stores.indexedDB,
          cookie: false,
        },
        lastHealedFrom: 'none',
        lastRepairedStores: [],
      });
      return cloneVault(currentState);
    }

    candidates.sort(compareCandidates);
    const winner = candidates[0]!;
    const winnerState = cloneVault(winner.state);
    const encoded = encodeShadowCookie(winnerState);

    const needsRepairA = !storeA.state || storeA.legacyV1 || !statesEqual(storeA.state, winnerState);
    const needsRepairC = !storeC.state || storeC.raw !== encoded.wire;

    const repaired: VaultStoreName[] = [];
    let storeAOk = Boolean(storeA.state) && !needsRepairA;
    let storeCOk = Boolean(storeC.state) && !needsRepairC;

    if (needsRepairA && writeStoreA(storage, winnerState)) {
      storeAOk = true;
      repaired.push('localStorage');
    }
    if (needsRepairC && writeStoreC(doc, encoded.wire, env.isSecureContext(doc))) {
      storeCOk = true;
      repaired.push('cookie');
    }

    currentState = winnerState;
    setStatus({
      rev: winnerState.rev,
      updatedAt: winnerState.updatedAt,
      cookieBytes: encoded.bytes,
      cookieBudget: VAULT_COOKIE_MAX_BYTES,
      cookieShedLevel: encoded.shedLevel,
      stores: {
        localStorage: storeAOk,
        indexedDB: statusSnapshot.stores.indexedDB,
        cookie: storeCOk,
      },
      lastHealedFrom: repaired.length > 0 ? winner.name : 'none',
      lastRepairedStores: repaired,
    });

    return cloneVault(winnerState);
  }

  async function reconcileInternal(): Promise<ReconcileResult> {
    const startEpoch = writeEpoch;
    const storage = env.getLocalStorage();
    const idbFactory = env.getIndexedDb();
    const doc = env.getDocument();

    const storeA = readStoreA(storage);
    const storeB = await readStoreB(idbFactory, env.idbAdapter);
    const storeC = readStoreC(doc);

    // A concurrent save() superseded this reconcile read; do not clobber newer user mutations.
    if (writeEpoch !== startEpoch) {
      return { state: cloneVault(currentState), status: statusSnapshot };
    }

    const candidates: Candidate[] = [];
    if (storeA.state) candidates.push({ name: 'localStorage', priority: 0, state: storeA.state });
    if (storeB.state) candidates.push({ name: 'indexedDB', priority: 1, state: storeB.state });
    if (storeC.state) candidates.push({ name: 'cookie', priority: 2, state: storeC.state });

    let winnerName: VaultStoreName | 'default' = 'default';
    let winnerState: VaultData = defaultVault();

    if (candidates.length > 0) {
      candidates.sort(compareCandidates);
      winnerName = candidates[0]!.name;
      winnerState = cloneVault(candidates[0]!.state);
    }

    const encoded = encodeShadowCookie(winnerState);
    const needsRepairA = !storeA.state || storeA.legacyV1 || !statesEqual(storeA.state, winnerState);
    const needsRepairB = !storeB.state || !statesEqual(storeB.state, winnerState);
    const needsRepairC = !storeC.state || storeC.raw !== encoded.wire;

    const repaired: VaultStoreName[] = [];
    let storeAOk = Boolean(storeA.state) && !needsRepairA;
    let storeBOk = Boolean(storeB.state) && !needsRepairB;
    let storeCOk = Boolean(storeC.state) && !needsRepairC;

    if (needsRepairA && writeStoreA(storage, winnerState)) {
      storeAOk = true;
      repaired.push('localStorage');
    }
    if (needsRepairB && (await writeStoreB(idbFactory, env.idbAdapter, winnerState))) {
      storeBOk = true;
      repaired.push('indexedDB');
    }
    if (needsRepairC && writeStoreC(doc, encoded.wire, env.isSecureContext(doc))) {
      storeCOk = true;
      repaired.push('cookie');
    }

    if (writeEpoch !== startEpoch) {
      return { state: cloneVault(currentState), status: statusSnapshot };
    }

    const changed = !statesEqual(currentState, winnerState);
    currentState = winnerState;
    setStatus({
      rev: winnerState.rev,
      updatedAt: winnerState.updatedAt,
      cookieBytes: encoded.bytes,
      cookieBudget: VAULT_COOKIE_MAX_BYTES,
      cookieShedLevel: encoded.shedLevel,
      stores: {
        localStorage: storeAOk,
        indexedDB: storeBOk,
        cookie: storeCOk,
      },
      lastHealedFrom: repaired.length > 0 ? winnerName : 'none',
      lastRepairedStores: repaired,
    });

    if (changed) notifyState();

    return { state: cloneVault(winnerState), status: statusSnapshot };
  }

  function save(data: VaultData): Promise<VaultData> {
    const normalized = normalizeVault(data);
    const nextRev = Math.max(currentState.rev, normalized.rev) + 1;
    const nextUpdatedAt = Math.max(Math.trunc(env.now()), currentState.updatedAt);

    const nextState: VaultData = {
      ...normalized,
      v: 2,
      rev: nextRev,
      updatedAt: nextUpdatedAt,
    };

    writeEpoch += 1;
    const myEpoch = writeEpoch;

    const storage = env.getLocalStorage();
    const doc = env.getDocument();
    const encoded = encodeShadowCookie(nextState);

    // Synchronous write to primary LS + shadow cookie so instant page reloads never lose writes.
    const storeAOk = writeStoreA(storage, nextState);
    const storeCOk = writeStoreC(doc, encoded.wire, env.isSecureContext(doc));

    currentState = nextState;
    setStatus({
      rev: nextState.rev,
      updatedAt: nextState.updatedAt,
      cookieBytes: encoded.bytes,
      cookieBudget: VAULT_COOKIE_MAX_BYTES,
      cookieShedLevel: encoded.shedLevel,
      stores: {
        localStorage: storeAOk,
        indexedDB: statusSnapshot.stores.indexedDB,
        cookie: storeCOk,
      },
      lastHealedFrom: 'none',
      lastRepairedStores: [],
    });
    notifyState();

    // Serialized async write to IndexedDB store B.
    return enqueue(async () => {
      const storeBOk = await writeStoreB(env.getIndexedDb(), env.idbAdapter, nextState);
      if (writeEpoch === myEpoch) {
        setStatus({
          rev: nextState.rev,
          updatedAt: nextState.updatedAt,
          cookieBytes: encoded.bytes,
          cookieBudget: VAULT_COOKIE_MAX_BYTES,
          cookieShedLevel: encoded.shedLevel,
          stores: {
            localStorage: storeAOk,
            indexedDB: storeBOk,
            cookie: storeCOk,
          },
          lastHealedFrom: 'none',
          lastRepairedStores: [],
        });
      }
      return cloneVault(nextState);
    });
  }

  return {
    loadSync,
    reconcile: () => enqueue(reconcileInternal),
    save,
    getState: () => cloneVault(currentState),
    getStatus: () => statusSnapshot,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    _resetForTests() {
      writeEpoch += 1;
      currentState = defaultVault();
      const enc = encodeShadowCookie(currentState);
      setStatus({
        rev: currentState.rev,
        updatedAt: currentState.updatedAt,
        cookieBytes: enc.bytes,
        cookieBudget: VAULT_COOKIE_MAX_BYTES,
        cookieShedLevel: enc.shedLevel,
        stores: { localStorage: false, indexedDB: false, cookie: false },
        lastHealedFrom: 'none',
        lastRepairedStores: [],
      });
    },
  };
}

export const vault = createCookieVault();

export const loadVaultSync = (): VaultData => vault.loadSync();
export const loadVault = loadVaultSync;
export const reconcileVault = (): Promise<ReconcileResult> => vault.reconcile();
export const saveVault = (data: VaultData): Promise<VaultData> => vault.save(data);
export const getVaultStatus = (): VaultStorageStatus => vault.getStatus();
export const subscribeVault = (listener: (state: VaultData) => void): (() => void) =>
  vault.subscribe(listener);
export const subscribeVaultStatus = (listener: (status: VaultStorageStatus) => void): (() => void) =>
  vault.subscribeStatus(listener);
export const _resetVaultForTests = (): void => vault._resetForTests();
