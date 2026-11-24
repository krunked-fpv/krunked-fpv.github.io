import { create } from 'zustand';
import { getEntry } from '../data/httpCache';
import { projectEvents, projectRepos, projectUser } from '../data/projections';
import { GITHUB_USER } from '../config/site';
import { defaultVault, loadVault, saveVault, type VaultData } from '../vault/cookieVault';
import type { GhEvent, GhRepo, GhUser } from '../types/github';
import type { SortMode, ViewMode } from '../types/project';
import { syncReducer, type SyncEvent, type SyncState } from '../data/syncReducer';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'ok';
}

export interface DeckState {
  user: GhUser | null;
  repos: GhRepo[];
  events: GhEvent[];
  deepEvents: GhEvent[];
  /** bumped when commits/probe caches change so memoised projections rebuild */
  dataVersion: number;
  sync: SyncState;
  vault: VaultData;
  paletteOpen: boolean;
  settingsOpen: boolean;
  shipSheetOpen: boolean;
  peek: string | null;
  peekOrigin: 'spot' | 'card' | null;
  toasts: Toast[];
  snapshotAt: string | null;

  dispatchSync: (e: SyncEvent) => void;
  bump: () => void;
  setData: (d: Partial<Pick<DeckState, 'user' | 'repos' | 'events' | 'deepEvents' | 'snapshotAt'>>) => void;
  togglePin: (name: string) => void;
  reorderPins: (pins: string[]) => void;
  setView: (v: ViewMode) => void;
  setSort: (s: SortMode) => void;
  setFilter: (f: string) => void;
  markSeen: (repo: string, sha: string) => void;
  replaceVault: (v: VaultData) => void;
  setPalette: (o: boolean) => void;
  setSettings: (o: boolean) => void;
  setShipSheet: (o: boolean) => void;
  setPeek: (name: string | null, origin?: 'spot' | 'card' | null) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

/** Synchronous cache hydration so first paint already has content. */
function hydrateFromCache() {
  const repos = getEntry<GhRepo[]>(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`);
  const events = getEntry<GhEvent[]>(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=100`);
  const user = getEntry<GhUser>(`https://api.github.com/users/${GITHUB_USER}`);
  return {
    user: user ? projectUser(user.body) : null,
    repos: repos ? projectRepos(repos.body) : [],
    events: events ? projectEvents(events.body) : [],
    has: !!repos,
  };
}

const cache = hydrateFromCache();
const initialVault = (() => {
  try {
    return loadVault();
  } catch {
    return defaultVault();
  }
})();

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePersist(get: () => DeckState, set: (p: Partial<DeckState>) => void) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const v = saveVault(get().vault);
    set({ vault: { ...get().vault, updatedAt: v.updatedAt } });
  }, 250);
}

export const useDeck = create<DeckState>((set, get) => {
  const patchVault = (fn: (v: VaultData) => VaultData) => {
    set({ vault: fn(get().vault) });
    schedulePersist(get, set);
  };
  return {
    user: cache.user,
    repos: cache.repos,
    events: cache.events,
    deepEvents: [],
    dataVersion: 0,
    sync: {
      phase: cache.has ? 'HYDRATED' : 'BOOT',
      hydrateSource: cache.has ? 'cache' : 'empty',
      allNotModified: false,
      lastSyncAt: null,
      resetAt: null,
      error: null,
    },
    vault: initialVault,
    paletteOpen: false,
    settingsOpen: false,
    shipSheetOpen: false,
    peek: null,
    peekOrigin: null,
    toasts: [],
    snapshotAt: null,

    dispatchSync: (e) => set({ sync: syncReducer(get().sync, e) }),
    bump: () => set({ dataVersion: get().dataVersion + 1 }),
    setData: (d) => set(d),
    togglePin: (name) =>
      patchVault((v) => ({ ...v, pins: v.pins.includes(name) ? v.pins.filter((p) => p !== name) : [...v.pins, name] })),
    reorderPins: (pins) => patchVault((v) => ({ ...v, pins })),
    setView: (view) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, view } })),
    setSort: (sort) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, sort } })),
    setFilter: (filter) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, filter } })),
    markSeen: (repo, sha) => {
      if (get().vault.seen[repo] === sha) return;
      patchVault((v) => ({ ...v, seen: { ...v.seen, [repo]: sha } }));
    },
    replaceVault: (v) => {
      set({ vault: v });
      schedulePersist(get, set);
    },
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setSettings: (settingsOpen) => set({ settingsOpen }),
    setShipSheet: (shipSheetOpen) => set({ shipSheetOpen }),
    setPeek: (peek, origin = null) => set({ peek, peekOrigin: peek ? origin : null }),
    toast: (text, tone = 'info') => {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, tone }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
    },
  };
});

export const cacheWasEmpty = !cache.has;
