import { STORAGE_NS } from '../config/site';

const KEY = `${STORAGE_NS}:pat`;
let cached: string | null | undefined;

/** PAT lives in localStorage (device) or sessionStorage (session). Only ever sent to api.github.com. */
export function getPat(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export function patScope(): 'device' | 'session' | null {
  try {
    if (localStorage.getItem(KEY)) return 'device';
    if (sessionStorage.getItem(KEY)) return 'session';
  } catch {
    /* ignore */
  }
  return null;
}

export function setPat(token: string, scope: 'device' | 'session') {
  clearPat();
  const t = token.trim();
  if (!t) return;
  try {
    (scope === 'device' ? localStorage : sessionStorage).setItem(KEY, t);
  } catch {
    /* ignore */
  }
  cached = t;
}

export function clearPat() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  cached = null;
}
