import { foley } from '../audio/microFoley';
import { GITHUB_USER, POLL_MS, STALE_USER_MS } from '../config/site';
import { buildProjects } from '../domain/buildProjects';
import { cacheWasEmpty, useDeck } from '../store/deckStore';
import type { GhEvent, GhRepo, GhUser, SnapshotFile } from '../types/github';
import { reconcileVault } from '../vault/cookieVault';
import { getPat } from '../vault/patStore';
import { commitsPath, enrichDeepHistory, enrichSpotlight, languagesPath } from './enrich';
import {
  AuthError,
  ghFetch,
  HttpError,
  OfflineError,
  RateLimitedError,
  syncDisabled,
  SyncDisabledError,
  type GhResult,
} from './ghClient';
import { getEntry, hydrateFromIdb, putEntry } from './httpCache';
import { readIdbSnapshot, withTimeout, writeIdbSnapshot } from './idbCache';
import { hydrateProbesFromIdb, probeAll, seedProbes } from './probe';
import { projectEvents, projectRepos, projectUser } from './projections';
import { getRate } from './rateLimit';
import { getLastSnapshotAt, loadSnapshot, setLastSnapshotAt } from './snapshot';

export { syncDisabled };

const REPOS = `/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`;
const EVENTS = `/users/${GITHUB_USER}/events/public?per_page=100`;
const USER = `/users/${GITHUB_USER}`;

let inflight: Promise<void> | null = null;
let inflightForced = false;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
let onOnlineHandler: (() => void) | null = null;
let onOfflineHandler: (() => void) | null = null;
let onVisibilityHandler: (() => void) | null = null;

const liveSyncListeners = new Set<(at: number) => void>();

/** Subscribe to fresh live 200 sync completions. */
export function onLiveSync(listener: (at: number) => void): () => void {
  liveSyncListeners.add(listener);
  return () => {
    liveSyncListeners.delete(listener);
  };
}

function ingestSnapshot(snap: SnapshotFile, hydrateCoreData: boolean) {
  const snapMs = Date.parse(snap.generatedAt) || Date.now();

  if (snap.user && (hydrateCoreData || !getEntry(`https://api.github.com${USER}`))) {
    putEntry({
      url: `https://api.github.com${USER}`,
      etag: null,
      body: snap.user,
      fetchedAt: snapMs,
    });
  }

  for (const [repo, entry] of Object.entries(snap.commits ?? {})) {
    const url = `https://api.github.com${commitsPath(repo)}`;
    const existing = getEntry(url);
    const existingPushedMs = existing?.meta?.pushedAt ? Date.parse(String(existing.meta.pushedAt)) || 0 : 0;
    const snapPushedMs = entry.pushedAt ? Date.parse(entry.pushedAt) || 0 : 0;
    if (!existing || snapPushedMs >= existingPushedMs || !existing.meta?.commits30d) {
      putEntry({
        url,
        etag: existing?.etag ?? null,
        body: entry.commits,
        fetchedAt: Math.max(existing?.fetchedAt ?? 0, snapMs),
        meta: {
          pushedAt: entry.pushedAt,
          ...(entry.commits30d ? { commits30d: entry.commits30d } : {}),
          ...(entry.commits30dTotal !== undefined ? { commits30dTotal: entry.commits30dTotal } : {}),
          ...(entry.commits90dTotal !== undefined ? { commits90dTotal: entry.commits90dTotal } : {}),
        },
      });
    }
  }

  if (snap.languages) {
    for (const [repo, langMap] of Object.entries(snap.languages)) {
      const url = `https://api.github.com${languagesPath(repo)}`;
      if (!getEntry(url)) {
        putEntry({
          url,
          etag: null,
          body: langMap,
          fetchedAt: snapMs,
        });
      }
    }
  }

  if (snap.probes) {
    seedProbes(snap.probes);
  }

  const d = useDeck.getState();
  const patch: Parameters<typeof d.setData>[0] = {
    snapshotAt: snap.generatedAt,
  };

  if (snap.languages && Object.keys(snap.languages).length > 0) {
    patch.languages = { ...d.languages, ...snap.languages };
  }
  if (snap.chronoPulse90d && snap.chronoPulse90d.length > 0) {
    patch.chronoPulse90d = snap.chronoPulse90d;
  }

  if (hydrateCoreData || d.repos.length === 0) {
    patch.repos = snap.repos;
    patch.events = snap.events;
    if (snap.user) patch.user = snap.user;
  }

  d.setData(patch);
  if (hydrateCoreData) {
    d.dispatchSync({ type: 'HYDRATED', source: 'snapshot' });
  }
  d.bump();

  setLastSnapshotAt(snap.generatedAt);
  void writeIdbSnapshot(snap);
}

function runEnrichment(force: boolean, isColdBoot = false) {
  if (syncDisabled()) return;
  const s = useDeck.getState();
  const projects = buildProjects({
    repos: s.repos,
    events: s.events,
    pins: s.vault.pins,
    curation: s.vault.curation,
    now: Date.now(),
  });
  const byRecent = projects.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  const names = new Set(byRecent.slice(0, 5).map((p) => p.name));
  const repos = s.repos
    .filter((r) => names.has(r.name))
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));

  const authed = Boolean(getPat());
  // On unauthenticated cold boot with a loaded SnapshotV2, keep total API calls strictly <= 3.
  if (force || authed || !isColdBoot || !s.snapshotAt) {
    void enrichSpotlight(repos).then((changed) => {
      if (changed || force) useDeck.getState().bump();
    });
  }

  // Never fire deep events pages 2-3 on unauthenticated cold boot (SPEC.md §3).
  if (force || authed) {
    void enrichDeepHistory().then((ev) => {
      if (ev) useDeck.getState().setData({ deepEvents: ev });
    });
  }

  const targets = projects
    .filter((p) => p.launchUrl && !p.isSelfDeck)
    .map((p) => ({ slug: p.name, url: p.launchUrl as string }));
  probeAll(targets, () => useDeck.getState().bump());
}

/** One revalidation pass over the core endpoints (cold boot <= 3 unauthenticated calls). */
export function sync(force = false, isColdBoot = false): Promise<void> {
  if (syncDisabled()) return Promise.resolve();

  const current = useDeck.getState().sync;
  if (!force && current.phase === 'RATE_LIMITED' && current.resetAt && current.resetAt > Date.now()) {
    return Promise.resolve();
  }

  if (inflight) {
    if (!force || inflightForced) return inflight;
    return inflight.then(() => sync(true));
  }

  inflightForced = force;
  useDeck.getState().dispatchSync({ type: 'START' });

  inflight = (async () => {
    try {
      const userStale = (() => {
        const e = getEntry(`https://api.github.com${USER}`);
        return !e || Date.now() - e.fetchedAt > STALE_USER_MS || force;
      })();

      const [repos, events, user] = await Promise.all([
        ghFetch<GhRepo[]>(REPOS, { project: projectRepos }),
        ghFetch<GhEvent[]>(EVENTS, { project: projectEvents }),
        userStale
          ? ghFetch<GhUser>(USER, { project: projectUser }).catch((e) =>
              e instanceof RateLimitedError ? Promise.reject(e) : null,
            )
          : Promise.resolve(null),
      ]);

      const results: GhResult<unknown>[] = [repos, events, ...(user ? [user] : [])];
      const allNotModified = results.every((r) => r.source === 'etag');
      const now = Date.now();
      const d = useDeck.getState();
      d.setData({
        repos: repos.data,
        events: events.data,
        ...(user ? { user: user.data } : {}),
      });
      d.dispatchSync({ type: 'CORE_RESULT', allNotModified, at: now });

      if (!allNotModified) {
        try {
          foley.sync();
        } catch {
          /* ignore audio errors */
        }
        liveSyncListeners.forEach((fn) => fn(now));
      }

      runEnrichment(force, isColdBoot);
    } catch (e) {
      if (e instanceof SyncDisabledError) return;
      const d = useDeck.getState();
      if (e instanceof RateLimitedError) {
        d.dispatchSync({ type: 'CORE_FAIL', kind: 'rate', resetAt: e.resetAt });
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => void sync(), Math.max(1000, e.resetAt - Date.now() + 1500));
      } else if (e instanceof OfflineError) {
        d.dispatchSync({ type: 'CORE_FAIL', kind: 'offline' });
      } else if (e instanceof AuthError) {
        d.dispatchSync({ type: 'CORE_FAIL', kind: 'error', message: 'Token rejected' });
        d.toast('GitHub token was rejected — check Settings', 'warn');
      } else if (e instanceof HttpError) {
        d.dispatchSync({ type: 'CORE_FAIL', kind: 'error', message: `HTTP ${e.status}` });
      } else {
        d.dispatchSync({ type: 'CORE_FAIL', kind: 'error', message: (e as Error).message });
      }
    } finally {
      inflight = null;
      inflightForced = false;
    }
  })();

  return inflight;
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const rate = getRate();
  const every = Math.max(POLL_MS, (rate?.pollInterval ?? 0) * 1000);
  pollTimer = setTimeout(() => {
    if (!started) return;
    const st = useDeck.getState().sync;
    const rateLimited = st.phase === 'RATE_LIMITED' && st.resetAt !== null && st.resetAt > Date.now();
    if (typeof document === 'undefined' || (document.visibilityState === 'visible' && !rateLimited)) {
      void sync();
    }
    schedulePoll();
  }, every);
}

export function forceSync() {
  const d = useDeck.getState();
  if (syncDisabled()) {
    d.toast('Sync disabled (?sync=off)', 'warn');
    return Promise.resolve();
  }
  return sync(true).then(() => {
    const s = useDeck.getState().sync;
    if (s.phase === 'LIVE') {
      useDeck
        .getState()
        .toast(s.allNotModified ? 'Up to date · 304 Not Modified (0 quota)' : 'Synced fresh data', 'ok');
    }
  });
}

/** Boot Tier-1 snapshot + IndexedDB + Triple-Store Vault healing, then start Tier-2 ETag sync. */
export async function startEngine() {
  if (started) return;
  started = true;

  // Kick off async 3-store vault reconciliation (LS + IDB + Shadow Cookie) without blocking paint.
  void reconcileVault()
    .then(({ state, status }) => {
      const store = useDeck.getState();
      store.setVaultStatus(status);
      if (state.rev > store.vault.rev || (state.rev === store.vault.rev && state.updatedAt > store.vault.updatedAt)) {
        store.syncVaultFromReconcile(state);
      }
    })
    .catch(() => {
      /* non-fatal */
    });

  // Concurrent Tier-1 snapshot + IndexedDB hydration (bounded <= 25ms IDB race).
  const [idbHttpCount, idbProbeCount, idbSnap, bundledSnap] = await Promise.all([
    hydrateFromIdb(25),
    hydrateProbesFromIdb(25),
    withTimeout(readIdbSnapshot().catch(() => null), 25, null),
    loadSnapshot(),
  ]);

  if (idbHttpCount > 0 || idbProbeCount > 0) {
    useDeck.getState().bump();
  }

  const bestSnap = (() => {
    if (bundledSnap && idbSnap) {
      return (Date.parse(bundledSnap.generatedAt) || 0) >= (Date.parse(idbSnap.generatedAt) || 0)
        ? bundledSnap
        : idbSnap;
    }
    return bundledSnap ?? idbSnap;
  })();

  if (bestSnap) {
    const lastIngested = getLastSnapshotAt();
    const snapMs = Date.parse(bestSnap.generatedAt) || 0;
    const prevMs = lastIngested ? Date.parse(lastIngested) || 0 : 0;
    const needsEnrichment =
      cacheWasEmpty ||
      useDeck.getState().repos.length === 0 ||
      useDeck.getState().chronoPulse90d.length === 0 ||
      snapMs > prevMs;

    if (needsEnrichment) {
      ingestSnapshot(bestSnap, cacheWasEmpty || useDeck.getState().repos.length === 0);
    }
  }

  if (syncDisabled()) {
    return;
  }

  if (typeof window !== 'undefined') {
    onOnlineHandler = () => {
      useDeck.getState().dispatchSync({ type: 'ONLINE' });
      void sync();
    };
    onOfflineHandler = () => useDeck.getState().dispatchSync({ type: 'OFFLINE' });
    window.addEventListener('online', onOnlineHandler);
    window.addEventListener('offline', onOfflineHandler);
  }

  if (typeof document !== 'undefined') {
    onVisibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      const st = useDeck.getState().sync;
      if (st.phase === 'RATE_LIMITED' && st.resetAt && st.resetAt > Date.now()) return;
      const last = st.lastSyncAt ?? 0;
      if (Date.now() - last > 60_000) void sync();
    };
    document.addEventListener('visibilitychange', onVisibilityHandler);
  }

  await sync(false, true);
  if (started) schedulePoll();
}

/** Cleanly tear down timers and window/document listeners (deterministic test isolation). */
export function stopEngine() {
  started = false;
  clearTimeout(pollTimer);
  clearTimeout(resumeTimer);
  pollTimer = undefined;
  resumeTimer = undefined;

  if (typeof window !== 'undefined') {
    if (onOnlineHandler) window.removeEventListener('online', onOnlineHandler);
    if (onOfflineHandler) window.removeEventListener('offline', onOfflineHandler);
  }
  if (typeof document !== 'undefined' && onVisibilityHandler) {
    document.removeEventListener('visibilitychange', onVisibilityHandler);
  }
  onOnlineHandler = null;
  onOfflineHandler = null;
  onVisibilityHandler = null;
}

export function resetEngineForTests() {
  stopEngine();
  inflight = null;
  inflightForced = false;
  liveSyncListeners.clear();
}
