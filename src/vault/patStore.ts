import { API_ORIGIN, PAT_STORAGE_KEY, STORAGE_NS } from '../config/site';
import type { PatScope, PatStatus } from '../types/vault';

export { PAT_STORAGE_KEY };
export type { PatScope, PatStatus };

export const GITHUB_API_ORIGIN = API_ORIGIN;

const LEGACY_PAT_KEY = `${STORAGE_NS}:pat`;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
/** Strict printable ASCII (no whitespace, CR/LF, or control chars — prevents HTTP header injection). */
const VALID_TOKEN_REGEX = /^[\x21-\x7E]{4,512}$/;

let memoryFallback: { token: string; scope: PatScope } | null = null;

function getStorage(scope: PatScope): Storage | null {
  try {
    const store = scope === 'device' ? globalThis.localStorage : globalThis.sessionStorage;
    return typeof store !== 'undefined' ? store : null;
  } catch {
    return null;
  }
}

function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!VALID_TOKEN_REGEX.test(trimmed)) return null;
  return trimmed;
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length >= 10) {
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }
  return `${token.slice(0, 2)}...${token.slice(-1)}`;
}

function readFromScope(scope: PatScope): string | null {
  const store = getStorage(scope);
  if (!store || typeof store.getItem !== 'function') return null;

  try {
    const current = store.getItem(PAT_STORAGE_KEY);
    if (current !== null) {
      return normalizeToken(current);
    }

    // One-time transparent migration from V1 'forge-deck:pat' -> 'krunked-local-pat-v1'
    const legacy = store.getItem(LEGACY_PAT_KEY);
    if (legacy !== null) {
      const valid = normalizeToken(legacy);
      try {
        store.removeItem(LEGACY_PAT_KEY);
        if (valid) store.setItem(PAT_STORAGE_KEY, valid);
      } catch {
        // Non-fatal if storage is read-only
      }
      return valid;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Origin firewall: asserts that `rawUrl` strictly targets `https://api.github.com`
 * with HTTPS protocol, exact origin/host, no control characters, and zero embedded credentials.
 */
export function assertGitHubApiOrigin(rawUrl: string | URL): URL {
  const candidate = rawUrl instanceof URL ? rawUrl.href : rawUrl;
  if (typeof candidate !== 'string' || !candidate.trim() || CONTROL_CHAR_REGEX.test(candidate)) {
    throw new Error('Blocked credential leak: invalid GitHub API URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    throw new Error('Blocked credential leak: unparseable GitHub API URL');
  }

  if (parsed.protocol !== 'https:' || parsed.origin !== GITHUB_API_ORIGIN) {
    throw new Error(
      `Blocked credential leak: origin "${parsed.origin}" is not "${GITHUB_API_ORIGIN}"`,
    );
  }

  if (parsed.hostname !== 'api.github.com' || parsed.port !== '') {
    throw new Error('Blocked credential leak: non-canonical GitHub API host');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Blocked credential leak: embedded URL userinfo is forbidden');
  }

  return parsed;
}

/**
 * Returns `{ Authorization: 'Bearer <token>' }` ONLY when `rawUrl` passes
 * `assertGitHubApiOrigin(rawUrl)` and a valid PAT is available; returns `{}` otherwise.
 */
export function getAuthHeadersForUrl(
  rawUrl: string | URL,
  patOverride?: string | null,
): Record<string, string> {
  try {
    assertGitHubApiOrigin(rawUrl);
  } catch {
    return {};
  }

  const token =
    patOverride !== undefined && patOverride !== null ? normalizeToken(patOverride) : getPat();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Loads the raw PAT strictly for internal authenticated `https://api.github.com` requests.
 * Stored exclusively in `sessionStorage` ('session') or `localStorage` ('device') under `krunked-local-pat-v1`.
 */
export function getPat(): string | null {
  const sessionToken = readFromScope('session');
  if (sessionToken) return sessionToken;

  const deviceToken = readFromScope('device');
  if (deviceToken) return deviceToken;

  return memoryFallback ? normalizeToken(memoryFallback.token) : null;
}

/** Returns the active PAT storage scope, or null when unconfigured. */
export function patScope(): PatScope | null {
  if (readFromScope('session')) return 'session';
  if (readFromScope('device')) return 'device';
  if (memoryFallback && normalizeToken(memoryFallback.token)) return memoryFallback.scope;
  return null;
}

/** Returns non-sensitive PAT status & masked hint safe for Settings UI rendering. */
export function getPatStatus(): PatStatus {
  const sessionToken = readFromScope('session');
  if (sessionToken) {
    return { configured: true, scope: 'session', maskedHint: maskToken(sessionToken) };
  }

  const deviceToken = readFromScope('device');
  if (deviceToken) {
    return { configured: true, scope: 'device', maskedHint: maskToken(deviceToken) };
  }

  if (memoryFallback) {
    const valid = normalizeToken(memoryFallback.token);
    if (valid) {
      return { configured: true, scope: memoryFallback.scope, maskedHint: maskToken(valid) };
    }
  }

  return { configured: false, scope: null, maskedHint: '' };
}

/**
 * Persists a validated GitHub PAT strictly to `sessionStorage` ('session') or `localStorage` ('device').
 * Rejects whitespace, control chars, or header-injection payloads; never touches cookies or IndexedDB.
 */
export function setPat(token: string, scope: PatScope): { saved: boolean; status: PatStatus } {
  if (typeof token !== 'string') {
    return { saved: false, status: getPatStatus() };
  }

  const trimmed = token.trim();
  if (!trimmed) {
    clearPat();
    return { saved: false, status: getPatStatus() };
  }

  const valid = normalizeToken(trimmed);
  if (!valid) {
    return { saved: false, status: getPatStatus() };
  }

  clearPat();
  const targetStore = getStorage(scope);
  if (targetStore && typeof targetStore.setItem === 'function') {
    try {
      targetStore.setItem(PAT_STORAGE_KEY, valid);
      memoryFallback = null;
      return {
        saved: true,
        status: { configured: true, scope, maskedHint: maskToken(valid) },
      };
    } catch {
      memoryFallback = { token: valid, scope };
      return {
        saved: true,
        status: { configured: true, scope, maskedHint: maskToken(valid) },
      };
    }
  }

  memoryFallback = { token: valid, scope };
  return {
    saved: true,
    status: { configured: true, scope, maskedHint: maskToken(valid) },
  };
}

/** Erases the PAT from all local/session/legacy stores and in-memory fallback. */
export function clearPat(): void {
  memoryFallback = null;
  for (const scope of ['session', 'device'] as const) {
    const store = getStorage(scope);
    if (!store || typeof store.removeItem !== 'function') continue;
    try {
      store.removeItem(PAT_STORAGE_KEY);
      store.removeItem(LEGACY_PAT_KEY);
    } catch {
      // Ignore storage errors during wipe
    }
  }
}
