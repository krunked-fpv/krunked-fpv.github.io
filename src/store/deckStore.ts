import { create } from 'zustand';
import { GITHUB_USER, THEME_COLORS } from '../config/site';
import { getEntry } from '../data/httpCache';
import { projectEvents, projectRepos, projectUser } from '../data/projections';
import { syncReducer, type SyncEvent, type SyncState } from '../data/syncReducer';
import { sanitizeCurationPatch } from '../domain/sanitize';
import type { ChronoDay, ChronoWindow, GhEvent, GhRepo, GhUser } from '../types/github';
import type { PeekTab, SettingsTab, SortMode, ThemeMode, ViewMode } from '../types/project';
import type { CurationOverride, VaultData, VaultStorageStatus } from '../types/vault';
import {
  defaultVault,
  getVaultStatus,
  loadVaultSync,
  normalizeVault,
  saveVault,
  subscribeVaultStatus,
} from '../vault/cookieVault';

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
  languages: Record<string, Record<string, number>>;
  chronoPulse90d: ChronoDay[];
  /** bumped when commits/probe/language caches change so memoised projections rebuild */
  dataVersion: number;
  sync: SyncState;
  vault: VaultData;
  vaultStatus: VaultStorageStatus;
  /** Interactive Chrono-Pulse selection (single day => startDate === endDate, or dragged range). */
  chronoWindow: ChronoWindow | null;
  /** Convenience single-day UTC date string synced with chronoWindow. */
  activeDate: string | null;
  showHidden: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  shipSheetOpen: boolean;
  peek: string | null;
  peekOrigin: 'spot' | 'card' | null;
  peekTab: PeekTab | null;
  toasts: Toast[];
  snapshotAt: string | null;

  dispatchSync: (e: SyncEvent) => void;
  bump: () => void;
  setData: (
    d: Partial<Pick<DeckState, 'user' | 'repos' | 'events' | 'deepEvents' | 'languages' | 'chronoPulse90d' | 'snapshotAt'>>,
  ) => void;

  togglePin: (name: string) => void;
  reorderPins: (pins: string[]) => void;
  reorderPin: (name: string, direction: -1 | 1 | 'left' | 'right') => void;
  setView: (v: ViewMode) => void;
  setSort: (s: SortMode) => void;
  setFilter: (f: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  setCuration: (slug: string, patch: Partial<CurationOverride>) => void;
  resetCuration: (slug: string) => void;
  markSeen: (repo: string, sha: string) => void;
  replaceVault: (v: VaultData) => void;
  importVault: (v: VaultData) => void;
  resetVault: () => void;
  setVaultStatus: (status: VaultStorageStatus) => void;
  syncVaultFromReconcile: (v: VaultData) => void;

  setChronoWindow: (window: ChronoWindow | null) => void;
  setActiveDate: (date: string | null) => void;
  toggleActiveDate: (date: string) => void;
  setShowHidden: (show: boolean) => void;
  setPalette: (o: boolean) => void;
  setSettings: (o: boolean, tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setShipSheet: (o: boolean) => void;
  setPeek: (name: string | null, origin?: 'spot' | 'card' | null, tab?: PeekTab | null) => void;
  setPeekTab: (tab: PeekTab) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

/** Sync active hardware theme to DOM attributes and theme-color meta tag immediately. */
export function applyThemeToDom(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'daylight' ? 'light' : 'dark';
  const meta =
    document.getElementById('meta-theme-color') ?? document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }
}

/** Synchronous cache hydration so first paint already has content (<5ms). */
function hydrateFromCache() {
  const repos = getEntry<GhRepo[]>(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`);
  const events = getEntry<GhEvent[]>(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=100`);
  const user = getEntry<GhUser>(`https://api.github.com/users/${GITHUB_USER}`);
  return {
    user: user ? projectUser(user.body) : null,
    repos: repos ? projectRepos(repos.body) : [],
    events: events ? projectEvents(events.body) : [],
    has: Boolean(repos),
  };
}

const cache = hydrateFromCache();
const initialVault = (() => {
  try {
    return loadVaultSync();
  } catch {
    return defaultVault();
  }
})();

applyThemeToDom(initialVault.prefs.theme);

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persistImmediate(next: VaultData, set: (p: Partial<DeckState>) => void) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  void saveVault(next).then((saved) => {
    set({ vault: saved, vaultStatus: getVaultStatus() });
  });
  // Optimistically capture updated status immediately after sync LS+Cookie write.
  set({ vaultStatus: getVaultStatus() });
}

function schedulePersist(get: () => DeckState, set: (p: Partial<DeckState>) => void) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    persistImmediate(get().vault, set);
  }, 180);
}

export const useDeck = create<DeckState>((set, get) => {
  const patchVault = (fn: (v: VaultData) => VaultData, immediate = true) => {
    const next = fn(get().vault);
    set({ vault: next });
    if (immediate) persistImmediate(next, set);
    else schedulePersist(get, set);
  };

  return {
    user: cache.user,
    repos: cache.repos,
    events: cache.events,
    deepEvents: [],
    languages: {},
    chronoPulse90d: [],
    dataVersion: 0,
    sync: {
      phase: cache.has ? 'HYDRATED' : 'BOOT',
      hydrateSource: cache.has ? 'cache' : 'empty',
      allNotModified: false,
      lastSyncAt: null,
      lastLive200At: null,
      resetAt: null,
      error: null,
    },
    vault: initialVault,
    vaultStatus: getVaultStatus(),
    chronoWindow: null,
    activeDate: null,
    showHidden: false,
    paletteOpen: false,
    settingsOpen: false,
    settingsTab: 'prefs',
    shipSheetOpen: false,
    peek: null,
    peekOrigin: null,
    peekTab: null,
    toasts: [],
    snapshotAt: null,

    dispatchSync: (e) => set({ sync: syncReducer(get().sync, e) }),
    bump: () => set({ dataVersion: get().dataVersion + 1 }),
    setData: (d) => set(d),

    togglePin: (name) =>
      patchVault((v) => ({
        ...v,
        pins: v.pins.includes(name) ? v.pins.filter((p) => p !== name) : [...v.pins, name],
      })),

    reorderPins: (pins) => patchVault((v) => ({ ...v, pins })),

    reorderPin: (name, direction) => {
      const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction;
      patchVault((v) => {
        const idx = v.pins.indexOf(name);
        if (idx < 0) return v;
        const target = idx + delta;
        if (target < 0 || target >= v.pins.length) return v;
        const next = v.pins.slice();
        const [item] = next.splice(idx, 1);
        if (item !== undefined) next.splice(target, 0, item);
        return { ...v, pins: next };
      });
    },

    setView: (view) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, view } })),
    setSort: (sort) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, sort } })),
    setFilter: (filter) => patchVault((v) => ({ ...v, prefs: { ...v.prefs, filter } })),

    setTheme: (theme) => {
      applyThemeToDom(theme);
      patchVault((v) => ({ ...v, prefs: { ...v.prefs, theme } }));
    },

    toggleTheme: () => {
      const next: ThemeMode = get().vault.prefs.theme === 'obsidian' ? 'daylight' : 'obsidian';
      get().setTheme(next);
    },

    setSoundEnabled: (soundEnabled) =>
      patchVault((v) => ({ ...v, prefs: { ...v.prefs, soundEnabled: Boolean(soundEnabled) } })),

    toggleSound: () => {
      const next = !get().vault.prefs.soundEnabled;
      get().setSoundEnabled(next);
    },

    setCuration: (slug, patch) => {
      if (!slug) return;
      patchVault((v) => {
        const existing = v.curation[slug] ?? {};
        const cleaned = sanitizeCurationPatch(patch);
        const merged: CurationOverride = { ...existing };

        // Apply sanitized fields; explicitly empty strings/undefined clear text/url fields.
        if ('displayName' in patch) {
          if (cleaned.displayName) merged.displayName = cleaned.displayName;
          else delete merged.displayName;
        }
        if ('tagline' in patch) {
          if (cleaned.tagline) merged.tagline = cleaned.tagline;
          else delete merged.tagline;
        }
        if ('category' in patch) {
          if (cleaned.category) merged.category = cleaned.category;
          else delete merged.category;
        }
        if ('artStyle' in patch) {
          if (cleaned.artStyle) merged.artStyle = cleaned.artStyle;
          else delete merged.artStyle;
        }
        if ('launchUrl' in patch) {
          if (cleaned.launchUrl) merged.launchUrl = cleaned.launchUrl;
          else delete merged.launchUrl;
        }
        if ('accent' in patch) {
          if (cleaned.accent !== undefined) merged.accent = cleaned.accent;
          else delete merged.accent;
        }
        if ('hidden' in patch) {
          if (typeof cleaned.hidden === 'boolean') merged.hidden = cleaned.hidden;
          else delete merged.hidden;
        }
        if ('featured' in patch) {
          if (typeof cleaned.featured === 'boolean') merged.featured = cleaned.featured;
          else delete merged.featured;
        }

        const nextCuration = { ...v.curation };
        if (Object.keys(merged).length > 0) nextCuration[slug] = merged;
        else delete nextCuration[slug];

        return { ...v, curation: nextCuration };
      });
    },

    resetCuration: (slug) => {
      if (!slug) return;
      patchVault((v) => {
        if (!(slug in v.curation)) return v;
        const nextCuration = { ...v.curation };
        delete nextCuration[slug];
        return { ...v, curation: nextCuration };
      });
    },

    markSeen: (repo, sha) => {
      if (get().vault.seen[repo] === sha) return;
      patchVault((v) => ({ ...v, seen: { ...v.seen, [repo]: sha } }), false);
    },

    replaceVault: (v) => {
      const normalized = normalizeVault(v);
      applyThemeToDom(normalized.prefs.theme);
      set({ vault: normalized });
      persistImmediate(normalized, set);
    },

    importVault: (v) => {
      const normalized = normalizeVault(v);
      applyThemeToDom(normalized.prefs.theme);
      set({ vault: normalized });
      persistImmediate(normalized, set);
    },

    resetVault: () => {
      const fresh = defaultVault();
      applyThemeToDom(fresh.prefs.theme);
      set({ vault: fresh, chronoWindow: null, activeDate: null, showHidden: false });
      persistImmediate(fresh, set);
    },

    setVaultStatus: (vaultStatus) => set({ vaultStatus }),

    syncVaultFromReconcile: (v) => {
      const normalized = normalizeVault(v);
      applyThemeToDom(normalized.prefs.theme);
      set({ vault: normalized, vaultStatus: getVaultStatus() });
    },

    setChronoWindow: (chronoWindow) =>
      set({
        chronoWindow,
        activeDate:
          chronoWindow && chronoWindow.startDate === chronoWindow.endDate ? chronoWindow.startDate : null,
      }),

    setActiveDate: (date) => {
      if (!date) {
        set({ chronoWindow: null, activeDate: null });
        return;
      }
      const pulse = get().chronoPulse90d;
      const idx = pulse.findIndex((d) => d.date === date);
      const day = idx >= 0 ? pulse[idx] : undefined;
      set({
        activeDate: date,
        chronoWindow: {
          startDate: date,
          endDate: date,
          startIdx: idx >= 0 ? idx : 0,
          endIdx: idx >= 0 ? idx : 0,
          totalCount: day?.count ?? 0,
          repos: day?.repos ?? [],
        },
      });
    },

    toggleActiveDate: (date) => {
      if (get().activeDate === date) get().setActiveDate(null);
      else get().setActiveDate(date);
    },

    setShowHidden: (showHidden) => set({ showHidden }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setSettings: (settingsOpen, tab) =>
      set((s) => ({
        settingsOpen,
        settingsTab: tab ?? (settingsOpen ? s.settingsTab : 'prefs'),
      })),
    setSettingsTab: (settingsTab) => set({ settingsTab }),
    setShipSheet: (shipSheetOpen) => set({ shipSheetOpen }),
    setPeek: (peek, origin = null, tab = null) =>
      set({
        peek,
        peekOrigin: peek ? origin : null,
        peekTab: peek ? tab : null,
      }),
    setPeekTab: (peekTab) => set({ peekTab }),
    toast: (text, tone = 'info') => {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, tone }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
    },
  };
});

// Keep Zustand vaultStatus synced whenever async IDB writes complete.
subscribeVaultStatus((status) => {
  useDeck.getState().setVaultStatus(status);
});

export const cacheWasEmpty = !cache.has;
