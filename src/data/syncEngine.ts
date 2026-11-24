import { GITHUB_USER, POLL_MS, STALE_USER_MS } from '../config/site';
import { useDeck } from '../store/deckStore';
import { cacheWasEmpty } from '../store/deckStore';
import { enrichDeepHistory, enrichSpotlight } from './enrich';
import { AuthError, HttpError, OfflineError, RateLimitedError, ghFetch, fetchRateLimit, type GhResult } from './ghClient';
import { getEntry } from './httpCache';
import { probeAll } from './probe';
import { projectEvents, projectRepos, projectUser } from './projections';
import { getRate } from './rateLimit';
import { loadSnapshot } from './snapshot';
import { putEntry } from './httpCache';
import { buildProjects } from '../domain/buildProjects';
import type { GhEvent, GhRepo, GhUser } from '../types/github';

const REPOS = `/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`;
const EVENTS = `/users/${GITHUB_USER}/events/public?per_page=100`;
const USER = `/users/${GITHUB_USER}`;

export const syncDisabled = () => new URLSearchParams(location.search).get('sync') === 'off';

let inflight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function runEnrichment(force: boolean) {
  const s = useDeck.getState();
  const projects = buildProjects({ repos: s.repos, events: s.events, pins: [], now: Date.now() });
  const byRecent = projects.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  const names = new Set(byRecent.slice(0, 5).map((p) => p.name));
  const repos = s.repos.filter((r) => names.has(r.name)).sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  void enrichSpotlight(repos).then((changed) => {
    if (changed || force) useDeck.getState().bump();
  });
  void enrichDeepHistory().then((ev) => {
    if (ev) useDeck.getState().setData({ deepEvents: ev });
  });
  const urls = projects.map((p) => p.launchUrl).filter((u): u is string => !!u);
  probeAll(urls, () => useDeck.getState().bump());
}

/** One revalidation pass over the three core endpoints. */
export function sync(force = false): Promise<void> {
  if (syncDisabled()) return Promise.resolve();
  if (inflight) return inflight;
  const st = useDeck.getState();
  st.dispatchSync({ type: 'START' });
  inflight = (async () => {
    try {
      const userStale = (() => {
        const e = getEntry(`https://api.github.com${USER}`);
        return !e || Date.now() - e.fetchedAt > STALE_USER_MS || force;
      })();
      const [repos, events, user] = await Promise.all([
        ghFetch<GhRepo[]>(REPOS, { project: projectRepos }),
        ghFetch<GhEvent[]>(EVENTS, { project: projectEvents }),
        userStale ? ghFetch<GhUser>(USER, { project: projectUser }).catch((e) => (e instanceof RateLimitedError ? Promise.reject(e) : null)) : Promise.resolve(null),
      ]);
      const results: GhResult<unknown>[] = [repos, events, ...(user ? [user] : [])];
      const allNotModified = results.every((r) => r.source === 'etag');
      const d = useDeck.getState();
      d.setData({
        repos: repos.data,
        events: events.data,
        ...(user ? { user: user.data } : {}),
      });
      d.dispatchSync({ type: 'CORE_RESULT', allNotModified, at: Date.now() });
      runEnrichment(force);
    } catch (e) {
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
    }
  })();
  return inflight;
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const rate = getRate();
  const every = Math.max(POLL_MS, (rate?.pollInterval ?? 0) * 1000);
  pollTimer = setTimeout(() => {
    if (document.visibilityState === 'visible' && useDeck.getState().sync.phase !== 'RATE_LIMITED') void sync();
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
    if (s.phase === 'LIVE') useDeck.getState().toast(s.allNotModified ? 'Up to date · 304 Not Modified (0 quota)' : 'Synced fresh data', 'ok');
  });
}

export async function startEngine() {
  if (started) return;
  started = true;
  const d = useDeck.getState();
  if (cacheWasEmpty) {
    const snap = await loadSnapshot();
    if (snap) {
      if (snap.user) putEntry({ url: `https://api.github.com${USER}`, etag: null, body: snap.user, fetchedAt: 0 });
      for (const [repo, c] of Object.entries(snap.commits ?? {}))
        putEntry({
          url: `https://api.github.com/repos/${GITHUB_USER}/${repo}/commits?per_page=30`,
          etag: null,
          body: c.commits,
          fetchedAt: 0,
          meta: { pushedAt: c.pushedAt },
        });
      d.setData({ repos: snap.repos, events: snap.events, user: snap.user, snapshotAt: snap.generatedAt });
      d.dispatchSync({ type: 'HYDRATED', source: 'snapshot' });
      d.bump();
    }
  }
  if (syncDisabled()) {
    return;
  }
  if (!getRate()) void fetchRateLimit();
  window.addEventListener('online', () => {
    useDeck.getState().dispatchSync({ type: 'ONLINE' });
    void sync();
  });
  window.addEventListener('offline', () => useDeck.getState().dispatchSync({ type: 'OFFLINE' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const last = useDeck.getState().sync.lastSyncAt ?? 0;
    if (Date.now() - last > 60_000) void sync();
  });
  await sync();
  schedulePoll();
}
