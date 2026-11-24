import { VAULT_KEY } from '../config/site';
import type { SortMode, ViewMode } from '../types/project';

export interface VaultData {
  v: 1;
  pins: string[];
  prefs: { view: ViewMode; sort: SortMode; filter: string };
  seen: Record<string, string>;
  updatedAt: number;
}

export const defaultVault = (): VaultData => ({
  v: 1,
  pins: [],
  prefs: { view: 'bento', sort: 'push', filter: 'live' },
  seen: {},
  updatedAt: 0,
});

const VIEWS = ['bento', 'grid', 'matrix'];
const SORTS = ['push', 'created', 'velocity', 'alpha'];

/** Hand-rolled validation: returns a clean VaultData or null. */
export function validate(x: unknown): VaultData | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, any>;
  if (o.v !== 1 || typeof o.updatedAt !== 'number') return null;
  if (!Array.isArray(o.pins) || !o.pins.every((p: unknown) => typeof p === 'string')) return null;
  const prefs = o.prefs ?? {};
  const d = defaultVault();
  const seen: Record<string, string> = {};
  if (o.seen && typeof o.seen === 'object')
    for (const [k, v] of Object.entries(o.seen)) if (typeof v === 'string') seen[k] = v;
  return {
    v: 1,
    pins: o.pins as string[],
    prefs: {
      view: VIEWS.includes(prefs.view) ? prefs.view : d.prefs.view,
      sort: SORTS.includes(prefs.sort) ? prefs.sort : d.prefs.sort,
      filter: typeof prefs.filter === 'string' ? prefs.filter : d.prefs.filter,
    },
    seen,
    updatedAt: o.updatedAt,
  };
}

function readLS(): VaultData | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? validate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function readCookie(): VaultData | null {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${VAULT_KEY}=`));
    if (!m) return null;
    return validate(JSON.parse(decodeURIComponent(m.slice(VAULT_KEY.length + 1))));
  } catch {
    return null;
  }
}

function writeLS(d: VaultData) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

function writeCookie(d: VaultData) {
  try {
    let enc = encodeURIComponent(JSON.stringify(d));
    if (enc.length > 3500) enc = encodeURIComponent(JSON.stringify({ ...d, seen: {} }));
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${VAULT_KEY}=${enc}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

/** Read both mirrors, choose the newest valid copy, and heal the other side. */
export function loadVault(): VaultData {
  const a = readLS();
  const b = readCookie();
  const best = a && b ? (b.updatedAt > a.updatedAt ? b : a) : (a ?? b);
  if (!best) return defaultVault();
  if (!a || a.updatedAt < best.updatedAt) writeLS(best);
  if (!b || b.updatedAt < best.updatedAt) writeCookie(best);
  return best;
}

export function saveVault(d: VaultData) {
  const next = { ...d, updatedAt: Date.now() };
  writeLS(next);
  writeCookie(next);
  return next;
}
