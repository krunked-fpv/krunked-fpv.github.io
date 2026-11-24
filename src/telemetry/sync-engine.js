import {
  CATEGORY_TAGS,
  classifyRepo,
  sanitizeHttpUrl,
  stripEmojisAndDecodeHtml,
} from './classifier.js';
import {
  readCachedSnapshot,
  readEndpointCache,
  readManifestCache,
  writeCachedSnapshot,
  writeEndpointCache,
  writeManifestCache,
} from './idb-cache.js';
import { probeLiveSubApp } from './manifest-probe.js';

const DEFAULT_SNAPSHOT_URL = './data/foundry-snapshot.json';
const DEFAULT_OWNER = 'krunked-fpv';
const DEFAULT_POLL_MS = 60_000;
const MAX_PROBE_CONCURRENCY = 6;
const DAY_MS = 86_400_000;
const IDB_FAST_WAIT_MS = 25;

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function toUtcDateStr(dateInput = Date.now()) {
  const ms = typeof dateInput === 'number' ? dateInput : Date.parse(dateInput || '');
  const d = Number.isFinite(ms) ? new Date(ms) : new Date();
  return d.toISOString().slice(0, 10);
}

function buildChronoWindow(endDateStr, days = 90) {
  const endMs = Date.parse(`${endDateStr}T00:00:00.000Z`);
  const safeEndMs = Number.isFinite(endMs) ? endMs : Date.parse(`${toUtcDateStr()}T00:00:00.000Z`);
  const entries = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(safeEndMs - i * DAY_MS);
    entries.push({
      date: d.toISOString().slice(0, 10),
      totalCommits: 0,
      activeRepoSlugs: [],
    });
  }
  return entries;
}

function createEmptySnapshot(owner = DEFAULT_OWNER, nowIso = new Date().toISOString()) {
  const todayStr = toUtcDateStr(nowIso);
  return {
    schemaVersion: 'FoundrySnapshotV1',
    generatedAt: nowIso,
    owner,
    sourceMode: 'offline-fallback',
    totals: {
      totalRepos: 0,
      liveApps: 0,
      commits30d: 0,
      commits90d: 0,
      lastPushAt: null,
    },
    chronoPulse90d: buildChronoWindow(todayStr, 90),
    repos: [],
  };
}

function normalizeCommits30d(arr) {
  const out = new Array(30).fill(0);
  if (!Array.isArray(arr)) return out;
  const offset = Math.max(0, 30 - arr.length);
  const start = Math.max(0, arr.length - 30);
  for (let i = start; i < arr.length; i += 1) {
    const val = Number(arr[i]);
    out[offset + (i - start)] = Number.isFinite(val) && val > 0 ? Math.floor(val) : 0;
  }
  return out;
}

function shiftCommits30d(arr, fromDateStr, toDateStr) {
  const base = normalizeCommits30d(arr);
  const fromMs = Date.parse(`${fromDateStr}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDateStr}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return base;
  }
  const shift = Math.round((toMs - fromMs) / DAY_MS);
  if (shift <= 0) return base;
  if (shift >= 30) return new Array(30).fill(0);
  return [...base.slice(shift), ...new Array(shift).fill(0)];
}

function normalizeRecentCommits(commits) {
  if (!Array.isArray(commits)) return [];
  const seen = new Set();
  const list = [];
  for (const c of commits) {
    if (!c || !c.sha || seen.has(c.sha)) continue;
    seen.add(c.sha);
    list.push({
      sha: String(c.sha),
      sha7: String(c.sha7 || String(c.sha).slice(0, 7)),
      message: stripEmojisAndDecodeHtml(c.message || ''),
      author: stripEmojisAndDecodeHtml(c.author || ''),
      date: c.date || null,
      url: sanitizeHttpUrl(c.url) || null,
    });
  }
  list.sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
  return list.slice(0, 10);
}

function mergeRecentCommits(a, b) {
  return normalizeRecentCommits([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
}

function sanitizeManifestRecord(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      name: null,
      shortName: null,
      themeColor: null,
      iconUrl: null,
      ogImageUrl: null,
    };
  }
  return {
    name: manifest.name ? stripEmojisAndDecodeHtml(manifest.name) : null,
    shortName: manifest.shortName ? stripEmojisAndDecodeHtml(manifest.shortName) : null,
    themeColor: manifest.themeColor ? stripEmojisAndDecodeHtml(manifest.themeColor) : null,
    iconUrl: sanitizeHttpUrl(manifest.iconUrl),
    ogImageUrl: sanitizeHttpUrl(manifest.ogImageUrl),
  };
}

function normalizeRepoRecord(raw, defaultOwner = DEFAULT_OWNER) {
  if (!raw || typeof raw !== 'object') return null;
  const slug = stripEmojisAndDecodeHtml(raw.slug || raw.name || '');
  if (!slug) return null;

  const owner = stripEmojisAndDecodeHtml(raw.owner?.login || raw.owner || defaultOwner) || defaultOwner;
  const isSelfDeck =
    Boolean(raw.isSelfDeck) || slug.toLowerCase() === `${owner.toLowerCase()}.github.io` || slug.toLowerCase() === 'krunked-fpv.github.io';

  const hasPages = Boolean(raw.hasPages ?? raw.has_pages ?? isSelfDeck);
  const defaultPagesUrl = isSelfDeck
    ? `https://${owner}.github.io/`
    : hasPages
      ? `https://${owner}.github.io/${encodeURIComponent(slug)}/`
      : null;

  const pagesCandidateUrl = sanitizeHttpUrl(raw.pagesCandidateUrl) || defaultPagesUrl;
  const safeHomepage = sanitizeHttpUrl(raw.homepage);
  const safeLiveUrl = sanitizeHttpUrl(raw.liveUrl);

  let liveVerified = typeof raw.liveVerified === 'boolean' ? raw.liveVerified : Boolean(safeLiveUrl);
  let liveUrl = isSelfDeck ? `https://${owner}.github.io/` : safeLiveUrl;
  let isLiveApp = isSelfDeck ? true : (typeof raw.isLiveApp === 'boolean' ? raw.isLiveApp : Boolean(liveUrl && liveVerified));

  if (!isSelfDeck && raw.liveVerified === false) {
    isLiveApp = false;
    liveVerified = false;
    liveUrl = null;
  }

  const surfaceType = isLiveApp ? 'WEB_APP' : 'CLI_REPO';
  const manifest = sanitizeManifestRecord(raw.manifest);
  const classified = classifyRepo({
    ...raw,
    slug,
    owner,
    manifest,
  });
  const preservedCategory = CATEGORY_TAGS.includes(raw.category) ? raw.category : classified.category;

  const commits30d = normalizeCommits30d(raw.commits30d);
  const commits30dTotal = commits30d.reduce((sum, n) => sum + n, 0);
  const recentCommits = normalizeRecentCommits(raw.recentCommits);

  const htmlUrl = sanitizeHttpUrl(raw.htmlUrl || raw.html_url) || `https://github.com/${owner}/${encodeURIComponent(slug)}`;
  const actionsUrl = sanitizeHttpUrl(raw.actionsUrl) || `${htmlUrl}/actions`;

  return {
    slug,
    owner,
    fullName: stripEmojisAndDecodeHtml(raw.fullName || raw.full_name || `${owner}/${slug}`),
    htmlUrl,
    actionsUrl,
    title: isSelfDeck ? 'KRUNKED // DECK' : classified.title,
    tagline: isSelfDeck ? 'Live App Launchpad & Telemetry Surface' : classified.tagline,
    description: classified.description,
    category: isSelfDeck ? 'SRE & TELEMETRY' : preservedCategory,
    surfaceType,
    isLiveApp,
    isSelfDeck,
    liveVerified: isSelfDeck ? true : liveVerified,
    liveUrl,
    pagesCandidateUrl,
    homepage: safeHomepage,
    hasPages,
    isPrivate: Boolean(raw.isPrivate ?? raw.private),
    isFork: Boolean(raw.isFork ?? raw.fork),
    isArchived: Boolean(raw.isArchived ?? raw.archived),
    defaultBranch: stripEmojisAndDecodeHtml(raw.defaultBranch || raw.default_branch || 'main') || 'main',
    primaryLanguage: stripEmojisAndDecodeHtml(raw.primaryLanguage || raw.language || '') || null,
    languages: raw.languages && typeof raw.languages === 'object' ? { ...raw.languages } : {},
    topics: Array.isArray(raw.topics) ? raw.topics.map((t) => stripEmojisAndDecodeHtml(t)).filter(Boolean) : [],
    sizeKb: Number.isFinite(Number(raw.sizeKb ?? raw.size)) ? Number(raw.sizeKb ?? raw.size) : 0,
    stars: Number.isFinite(Number(raw.stars ?? raw.stargazers_count)) ? Number(raw.stars ?? raw.stargazers_count) : 0,
    watchers: Number.isFinite(Number(raw.watchers ?? raw.watchers_count)) ? Number(raw.watchers ?? raw.watchers_count) : 0,
    openIssues: Number.isFinite(Number(raw.openIssues ?? raw.open_issues_count)) ? Number(raw.openIssues ?? raw.open_issues_count) : 0,
    createdAt: raw.createdAt || raw.created_at || null,
    updatedAt: raw.updatedAt || raw.updated_at || null,
    pushedAt: raw.pushedAt || raw.pushed_at || raw.updatedAt || raw.updated_at || null,
    commits30d,
    commits30dTotal,
    recentCommits,
    manifest,
  };
}

function mergeTwoRepoRecords(older, newer) {
  if (!older) return newer;
  if (!newer) return older;

  const olderMs = Date.parse(older.pushedAt || '') || 0;
  const newerMs = Date.parse(newer.pushedAt || '') || 0;
  const primary = newerMs >= olderMs ? newer : older;
  const secondary = primary === newer ? older : newer;

  const commits30d = primary.commits30d.map((val, idx) => Math.max(val, secondary.commits30d[idx] || 0));
  const recentCommits = mergeRecentCommits(primary.recentCommits, secondary.recentCommits);
  const languages = Object.keys(primary.languages || {}).length > 0 ? primary.languages : secondary.languages;

  const manifest = {
    name: primary.manifest?.name || secondary.manifest?.name || null,
    shortName: primary.manifest?.shortName || secondary.manifest?.shortName || null,
    themeColor: primary.manifest?.themeColor || secondary.manifest?.themeColor || null,
    iconUrl: primary.manifest?.iconUrl || secondary.manifest?.iconUrl || null,
    ogImageUrl: primary.manifest?.ogImageUrl || secondary.manifest?.ogImageUrl || null,
  };

  return {
    ...secondary,
    ...primary,
    languages,
    commits30d,
    commits30dTotal: commits30d.reduce((s, n) => s + n, 0),
    recentCommits,
    manifest,
  };
}

function mergeChronoPulse(pulseA, pulseB, targetEndDateStr) {
  const byDate = new Map();
  const ingest = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry.date !== 'string') continue;
      const existing = byDate.get(entry.date) || { totalCommits: 0, slugs: new Set() };
      const count = Number.isFinite(Number(entry.totalCommits)) ? Math.max(0, Math.floor(Number(entry.totalCommits))) : 0;
      existing.totalCommits = Math.max(existing.totalCommits, count);
      if (Array.isArray(entry.activeRepoSlugs)) {
        for (const s of entry.activeRepoSlugs) {
          if (typeof s === 'string' && s) existing.slugs.add(s);
        }
      }
      byDate.set(entry.date, existing);
    }
  };
  ingest(pulseA);
  ingest(pulseB);

  const window = buildChronoWindow(targetEndDateStr, 90);
  for (const day of window) {
    const rec = byDate.get(day.date);
    if (rec) {
      day.totalCommits = rec.totalCommits;
      day.activeRepoSlugs = Array.from(rec.slugs);
    }
  }
  return window;
}

function finalizeSnapshot(snapshot, owner = DEFAULT_OWNER) {
  const repos = [...(snapshot.repos || [])].sort(
    (a, b) => (Date.parse(b.pushedAt || '') || 0) - (Date.parse(a.pushedAt || '') || 0)
  );
  const chronoPulse90d = Array.isArray(snapshot.chronoPulse90d) && snapshot.chronoPulse90d.length === 90
    ? snapshot.chronoPulse90d
    : buildChronoWindow(toUtcDateStr(snapshot.generatedAt), 90);

  const commits30d = repos.reduce((sum, r) => sum + (r.commits30dTotal || 0), 0);
  const commits90d = chronoPulse90d.reduce((sum, d) => sum + (Number(d.totalCommits) || 0), 0);
  const liveApps = repos.filter((r) => r.isLiveApp).length;
  const lastPushAt = repos.reduce((latest, r) => {
    const ms = Date.parse(r.pushedAt || '') || 0;
    const latestMs = Date.parse(latest || '') || 0;
    return ms > latestMs ? r.pushedAt : latest;
  }, null);

  return {
    schemaVersion: 'FoundrySnapshotV1',
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    owner: snapshot.owner || owner,
    sourceMode: snapshot.sourceMode || 'preserved-cache',
    totals: {
      totalRepos: repos.length,
      liveApps,
      commits30d,
      commits90d,
      lastPushAt,
    },
    chronoPulse90d,
    repos,
  };
}

function normalizeSnapshot(raw, owner = DEFAULT_OWNER) {
  if (!raw || typeof raw !== 'object') return null;
  const rawRepos = Array.isArray(raw.repos) ? raw.repos : [];
  const repos = [];
  for (const item of rawRepos) {
    const norm = normalizeRepoRecord(item, raw.owner || owner);
    if (norm) repos.push(norm);
  }
  const generatedAt = raw.generatedAt || new Date().toISOString();
  const endDate = toUtcDateStr(generatedAt);
  const chronoPulse90d = mergeChronoPulse(raw.chronoPulse90d, null, endDate);
  return finalizeSnapshot(
    {
      generatedAt,
      owner: raw.owner || owner,
      sourceMode: raw.sourceMode || 'preserved-cache',
      chronoPulse90d,
      repos,
    },
    owner
  );
}

function mergeSnapshots(snapA, snapB, owner = DEFAULT_OWNER) {
  const normA = normalizeSnapshot(snapA, owner);
  const normB = normalizeSnapshot(snapB, owner);
  if (!normA && !normB) return createEmptySnapshot(owner);
  if (!normA) return normB;
  if (!normB) return normA;

  const genMsA = Date.parse(normA.generatedAt || '') || 0;
  const genMsB = Date.parse(normB.generatedAt || '') || 0;
  const generatedAt = genMsB > genMsA ? normB.generatedAt : normA.generatedAt;
  const endDate = toUtcDateStr(generatedAt);
  const dateA = toUtcDateStr(normA.generatedAt);
  const dateB = toUtcDateStr(normB.generatedAt);

  const bySlug = new Map();
  for (const repo of normA.repos) {
    const shifted = shiftCommits30d(repo.commits30d, dateA, endDate);
    bySlug.set(repo.slug.toLowerCase(), {
      ...repo,
      commits30d: shifted,
      commits30dTotal: shifted.reduce((s, n) => s + n, 0),
    });
  }
  for (const repo of normB.repos) {
    const key = repo.slug.toLowerCase();
    const shifted = shiftCommits30d(repo.commits30d, dateB, endDate);
    const alignedRepo = {
      ...repo,
      commits30d: shifted,
      commits30dTotal: shifted.reduce((s, n) => s + n, 0),
    };
    bySlug.set(key, mergeTwoRepoRecords(bySlug.get(key), alignedRepo));
  }

  const chronoPulse90d = mergeChronoPulse(normA.chronoPulse90d, normB.chronoPulse90d, endDate);
  return finalizeSnapshot(
    {
      generatedAt,
      owner: normB.owner || normA.owner || owner,
      sourceMode: genMsB > genMsA ? normB.sourceMode : normA.sourceMode,
      chronoPulse90d,
      repos: Array.from(bySlug.values()),
    },
    owner
  );
}

function readHeader(headers, name) {
  if (!headers) return null;
  const target = name.toLowerCase();
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(target) ?? null;
  }
  if (headers instanceof Map) {
    for (const [k, v] of headers.entries()) {
      if (String(k).toLowerCase() === target) return v;
    }
    return null;
  }
  if (typeof headers === 'object') {
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === target) return headers[k];
    }
  }
  return null;
}

function extractRateLimit(headers, previousRateLimit = null) {
  const parseOptionalInt = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const n = Number.parseInt(String(val), 10);
    return Number.isFinite(n) ? n : null;
  };

  const limit = parseOptionalInt(readHeader(headers, 'x-ratelimit-limit'));
  const remaining = parseOptionalInt(readHeader(headers, 'x-ratelimit-remaining'));
  const used = parseOptionalInt(readHeader(headers, 'x-ratelimit-used'));
  const resetRaw = parseOptionalInt(readHeader(headers, 'x-ratelimit-reset'));

  let resetAt = previousRateLimit?.resetAt ?? null;
  if (resetRaw !== null) {
    const ms = resetRaw > 1e12 ? resetRaw : resetRaw * 1000;
    resetAt = new Date(ms).toISOString();
  }

  return {
    limit: limit !== null ? limit : (previousRateLimit?.limit ?? null),
    remaining: remaining !== null ? remaining : (previousRateLimit?.remaining ?? null),
    resetAt,
    used: used !== null ? used : (previousRateLimit?.used ?? null),
  };
}

function getResponseStatus(res) {
  if (!res) return 0;
  if (typeof res.status === 'number') return res.status;
  return res.ok ? 200 : 0;
}

function hasAuthorizationHeader(headers) {
  if (!headers || typeof headers !== 'object') return false;
  return Object.keys(headers).some(
    (k) => k.toLowerCase() === 'authorization' && Boolean(String(headers[k] || '').trim())
  );
}

async function runWithConcurrency(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await workerFn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Tier-2 live GitHub ETag delta sync engine and snapshot coordinator.
 */
export class TelemetrySyncEngine extends EventTarget {
  /**
   * @param {{
   *   snapshotUrl?: string,
   *   owner?: string,
   *   getAuthHeaders?: (url: string) => Record<string, string> | Promise<Record<string, string>>,
   *   getUnlockPrivate?: () => boolean | Promise<boolean>,
   *   fetchFn?: typeof fetch,
   *   probeFn?: typeof probeLiveSubApp,
   *   pollIntervalMs?: number,
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this._options = {
      snapshotUrl: options.snapshotUrl || DEFAULT_SNAPSHOT_URL,
      owner: options.owner || DEFAULT_OWNER,
      getAuthHeaders: options.getAuthHeaders || null,
      getUnlockPrivate: options.getUnlockPrivate || null,
      fetchFn: options.fetchFn || null,
      probeFn: options.probeFn || null,
      pollIntervalMs:
        typeof options.pollIntervalMs === 'number' && options.pollIntervalMs > 0
          ? options.pollIntervalMs
          : DEFAULT_POLL_MS,
    };

    this._snapshot = createEmptySnapshot(this._options.owner);
    this._status = {
      mode: 'SNAPSHOT CACHE',
      badgeTier: 'cached',
      lastCheckedAt: null,
      lastError: null,
      rateLimit: {
        limit: null,
        remaining: null,
        resetAt: null,
        used: null,
      },
    };

    this._endpointCache = new Map();
    this._manifestCache = new Map();
    this._countedCommitShas = new Set();
    this._booted = false;
    this._destroyed = false;
    this._inFlightSync = null;
    this._pollTimer = null;
    this._bootSyncTimer = null;
    this._visibilityHandler = null;
  }

  _getFetchFn() {
    if (typeof this._options.fetchFn === 'function') return this._options.fetchFn;
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return globalThis.fetch.bind(globalThis);
    }
    return null;
  }

  _getProbeFn() {
    return typeof this._options.probeFn === 'function' ? this._options.probeFn : probeLiveSubApp;
  }

  _isVisible() {
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden';
  }

  _seedCountedShas(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.repos)) return;
    for (const repo of snapshot.repos) {
      if (!Array.isArray(repo.recentCommits)) continue;
      for (const c of repo.recentCommits) {
        if (c && c.sha) this._countedCommitShas.add(c.sha);
      }
    }
  }

  _emitStatus() {
    if (this._destroyed) return;
    const status = this.getStatus();
    if (typeof CustomEvent === 'function') {
      this.dispatchEvent(new CustomEvent('status', { detail: status }));
    } else {
      const ev = new Event('status');
      ev.detail = status;
      this.dispatchEvent(ev);
    }
  }

  _emitUpdate() {
    if (this._destroyed) return;
    const detail = {
      snapshot: this.getSnapshot(),
      status: this.getStatus(),
    };
    if (typeof CustomEvent === 'function') {
      this.dispatchEvent(new CustomEvent('update', { detail }));
    } else {
      const ev = new Event('update');
      ev.detail = detail;
      this.dispatchEvent(ev);
    }
  }

  async _fetchLocalSnapshot() {
    const fetchFn = this._getFetchFn();
    if (!fetchFn || !this._options.snapshotUrl) return null;
    try {
      const res = await fetchFn(this._options.snapshotUrl, { method: 'GET' });
      const status = getResponseStatus(res);
      const ok = typeof res?.ok === 'boolean' ? res.ok : (status >= 200 && status < 300);
      if (!res || !ok || status >= 400) return null;
      if (typeof res.json === 'function') {
        return await res.json();
      }
      if (typeof res.text === 'function') {
        return JSON.parse(await res.text());
      }
      return null;
    } catch {
      return null;
    }
  }

  _startPolling() {
    this._stopPolling();
    if (this._destroyed) return;

    this._pollTimer = setInterval(() => {
      if (!this._destroyed && this._isVisible()) {
        void this.syncNow({ manual: false });
      }
    }, this._options.pollIntervalMs);
    if (typeof this._pollTimer?.unref === 'function') {
      this._pollTimer.unref();
    }

    if (
      !this._visibilityHandler &&
      typeof document !== 'undefined' &&
      typeof document.addEventListener === 'function'
    ) {
      this._visibilityHandler = () => {
        if (!this._destroyed && document.visibilityState === 'visible') {
          void this.syncNow({ manual: false });
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  _stopPolling() {
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Hydrate immediately from IndexedDB and bundled snapshot, emit initial events,
   * and start visibility-aware polling + initial background conditional sync.
   * @returns {Promise<object>}
   */
  async boot() {
    if (this._destroyed) {
      return this.getSnapshot();
    }

    const owner = this._options.owner || DEFAULT_OWNER;
    const bundledPromise = this._fetchLocalSnapshot();
    const idbPromise = readCachedSnapshot().catch(() => null);

    let bundledSettled = false;
    let bundledData = null;
    const trackedBundled = bundledPromise.then((data) => {
      bundledSettled = true;
      bundledData = data;
      return data;
    });

    const cachedData = await idbPromise;

    if (cachedData) {
      if (!bundledSettled) {
        let fastWaitTimer = null;
        await Promise.race([
          trackedBundled,
          new Promise((resolve) => {
            fastWaitTimer = setTimeout(resolve, IDB_FAST_WAIT_MS);
          }),
        ]);
        if (fastWaitTimer !== null) clearTimeout(fastWaitTimer);
      }
      if (bundledSettled) {
        this._snapshot = mergeSnapshots(bundledData, cachedData, owner);
      } else {
        this._snapshot = normalizeSnapshot(cachedData, owner) || createEmptySnapshot(owner);
        void trackedBundled.then((lateBundled) => {
          if (this._destroyed || !lateBundled) return;
          this._snapshot = mergeSnapshots(lateBundled, this._snapshot, owner);
          this._seedCountedShas(this._snapshot);
          void writeCachedSnapshot(this._snapshot);
          this._emitUpdate();
        });
      }
    } else {
      const localData = await trackedBundled;
      this._snapshot = normalizeSnapshot(localData, owner) || createEmptySnapshot(owner);
    }

    this._seedCountedShas(this._snapshot);

    if (this._snapshot.repos.length > 0 && cachedData && bundledSettled) {
      void writeCachedSnapshot(this._snapshot);
    }

    this._status = {
      ...this._status,
      mode: 'SNAPSHOT CACHE',
      badgeTier: 'cached',
    };

    this._emitUpdate();
    this._emitStatus();

    if (!this._booted) {
      this._booted = true;
      this._startPolling();
      this._bootSyncTimer = setTimeout(() => {
        this._bootSyncTimer = null;
        if (!this._destroyed && this._isVisible()) {
          void this.syncNow({ manual: false });
        }
      }, 0);
      if (typeof this._bootSyncTimer?.unref === 'function') {
        this._bootSyncTimer.unref();
      }
    }

    return this.getSnapshot();
  }

  async _resolveAuthHeaders(url) {
    if (typeof this._options.getAuthHeaders !== 'function') return {};
    try {
      const headers = await this._options.getAuthHeaders(url);
      return headers && typeof headers === 'object' ? { ...headers } : {};
    } catch {
      return {};
    }
  }

  async _resolveUnlockPrivate() {
    if (typeof this._options.getUnlockPrivate === 'function') {
      try {
        return Boolean(await this._options.getUnlockPrivate());
      } catch {
        return false;
      }
    }
    return Boolean(this._options.getUnlockPrivate);
  }

  async _getEndpointRecord(url) {
    if (this._endpointCache.has(url)) {
      return this._endpointCache.get(url);
    }
    const fromIdb = await readEndpointCache(url).catch(() => null);
    if (fromIdb) {
      this._endpointCache.set(url, fromIdb);
    }
    return fromIdb;
  }

  async _setEndpointRecord(url, record) {
    this._endpointCache.set(url, record);
    await writeEndpointCache(url, record);
  }

  async _conditionalGet(fetchFn, url) {
    const cached = await this._getEndpointRecord(url);
    const authHeaders = await this._resolveAuthHeaders(url);
    const headers = {
      Accept: 'application/vnd.github+json',
      ...authHeaders,
    };
    if (cached && cached.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    const res = await fetchFn(url, { method: 'GET', headers });
    const status = getResponseStatus(res);
    const rateLimit = extractRateLimit(res?.headers, this._status.rateLimit);
    const etag = readHeader(res?.headers, 'etag') || cached?.etag || null;

    if (status === 304) {
      const updatedRecord = {
        etag,
        data: cached?.data ?? null,
        rateLimit,
        checkedAt: Date.now(),
      };
      await this._setEndpointRecord(url, updatedRecord);
      return { status: 304, ok: true, data: cached?.data ?? null, etag, rateLimit };
    }

    const ok = typeof res?.ok === 'boolean' ? res.ok : (status >= 200 && status < 300);
    if (!ok || status >= 400) {
      return { status, ok: false, data: null, etag, rateLimit };
    }

    let data = null;
    if (typeof res.json === 'function') {
      data = await res.json();
    } else if (typeof res.text === 'function') {
      data = JSON.parse(await res.text());
    }

    const record = {
      etag: readHeader(res?.headers, 'etag') || null,
      data,
      rateLimit,
      checkedAt: Date.now(),
    };
    await this._setEndpointRecord(url, record);
    return { status: status || 200, ok: true, data, etag: record.etag, rateLimit };
  }

  async _probeReposIfNeeded(candidates, fetchFn) {
    if (!candidates.length) return new Map();
    const probeFn = this._getProbeFn();
    const probedBySlug = new Map();

    await runWithConcurrency(candidates, MAX_PROBE_CONCURRENCY, async ({ slug, url }) => {
      const key = slug.toLowerCase();
      let cached = this._manifestCache.get(key) || (await readManifestCache(slug).catch(() => null));
      if (!cached || cached.probedUrl !== url) {
        const fresh = await probeFn(slug, url, { fetchFn });
        cached = { ...fresh, probedUrl: url };
        this._manifestCache.set(key, cached);
        await writeManifestCache(slug, cached);
      }
      probedBySlug.set(key, cached);
    });

    return probedBySlug;
  }

  async _mergeLiveData(reposPayload, eventsPayload, unlockPrivate, fetchFn) {
    const owner = this._options.owner || DEFAULT_OWNER;
    const nowIso = new Date().toISOString();
    const prevDateStr = toUtcDateStr(this._snapshot.generatedAt);
    const todayDateStr = toUtcDateStr(nowIso);

    const existingBySlug = new Map();
    for (const r of this._snapshot.repos) {
      const shiftedCommits = shiftCommits30d(r.commits30d, prevDateStr, todayDateStr);
      existingBySlug.set(r.slug.toLowerCase(), {
        ...cloneValue(r),
        commits30d: shiftedCommits,
        commits30dTotal: shiftedCommits.reduce((s, n) => s + n, 0),
      });
    }

    const chronoPulse90d = mergeChronoPulse(this._snapshot.chronoPulse90d, null, todayDateStr);
    const chronoByDate = new Map(chronoPulse90d.map((d) => [d.date, d]));

    const probeTargets = [];
    const mergedBySlug = new Map();

    if (Array.isArray(reposPayload)) {
      for (const ghRepo of reposPayload) {
        if (!ghRepo || !ghRepo.name) continue;
        const slug = stripEmojisAndDecodeHtml(ghRepo.name);
        const key = slug.toLowerCase();
        const existing = existingBySlug.get(key);
        const repoOwner = stripEmojisAndDecodeHtml(ghRepo.owner?.login || owner) || owner;
        const isSelfDeck =
          key === `${repoOwner.toLowerCase()}.github.io` || key === 'krunked-fpv.github.io';

        const hasPages = Boolean(ghRepo.has_pages ?? isSelfDeck);
        const safeHomepage = sanitizeHttpUrl(ghRepo.homepage);
        const pagesCandidateUrl = isSelfDeck
          ? `https://${repoOwner}.github.io/`
          : hasPages
            ? `https://${repoOwner}.github.io/${encodeURIComponent(slug)}/`
            : existing?.pagesCandidateUrl || null;
        const candidateUrl = isSelfDeck
          ? `https://${repoOwner}.github.io/`
          : safeHomepage || pagesCandidateUrl;

        const newlyEnabledPages = Boolean(hasPages && (!existing || !existing.hasPages));
        const newlyDiscoveredLive = Boolean(!existing && candidateUrl);
        const changedHomepage = Boolean(existing && safeHomepage && safeHomepage !== existing.homepage);

        if (!isSelfDeck && candidateUrl && (newlyDiscoveredLive || newlyEnabledPages || changedHomepage)) {
          probeTargets.push({ slug, url: candidateUrl });
        }

        const merged = normalizeRepoRecord(
          {
            ...(existing || {}),
            slug,
            owner: repoOwner,
            fullName: ghRepo.full_name || `${repoOwner}/${slug}`,
            htmlUrl: ghRepo.html_url,
            description: ghRepo.description ?? existing?.description ?? null,
            homepage: safeHomepage,
            hasPages,
            pagesCandidateUrl,
            isPrivate: Boolean(ghRepo.private),
            isFork: Boolean(ghRepo.fork),
            isArchived: Boolean(ghRepo.archived),
            defaultBranch: ghRepo.default_branch || existing?.defaultBranch || 'main',
            primaryLanguage: ghRepo.language || existing?.primaryLanguage || null,
            languages: existing?.languages || {},
            topics: Array.isArray(ghRepo.topics) ? ghRepo.topics : (existing?.topics || []),
            sizeKb: ghRepo.size ?? existing?.sizeKb ?? 0,
            stars: ghRepo.stargazers_count ?? existing?.stars ?? 0,
            watchers: ghRepo.watchers_count ?? existing?.watchers ?? 0,
            openIssues: ghRepo.open_issues_count ?? existing?.openIssues ?? 0,
            createdAt: ghRepo.created_at || existing?.createdAt || null,
            updatedAt: ghRepo.updated_at || existing?.updatedAt || null,
            pushedAt: ghRepo.pushed_at || existing?.pushedAt || ghRepo.updated_at || null,
            commits30d: existing?.commits30d || new Array(30).fill(0),
            recentCommits: existing?.recentCommits || [],
            manifest: existing?.manifest || null,
            liveVerified: existing ? existing.liveVerified : isSelfDeck,
            isLiveApp: existing ? existing.isLiveApp : isSelfDeck,
            liveUrl: existing ? existing.liveUrl : (isSelfDeck ? `https://${repoOwner}.github.io/` : null),
          },
          repoOwner
        );

        if (merged) {
          mergedBySlug.set(key, merged);
        }
      }

      for (const [key, prev] of existingBySlug.entries()) {
        if (!mergedBySlug.has(key)) {
          if (!prev.isPrivate || unlockPrivate) {
            mergedBySlug.set(key, prev);
          }
        }
      }
    } else {
      for (const [key, prev] of existingBySlug.entries()) {
        mergedBySlug.set(key, prev);
      }
    }

    const probeResults = await this._probeReposIfNeeded(probeTargets, fetchFn);
    for (const [key, probe] of probeResults.entries()) {
      const repo = mergedBySlug.get(key);
      if (!repo) continue;
      if (probe && probe.liveVerified) {
        const candidateUrl = repo.homepage || repo.pagesCandidateUrl;
        const manifest = sanitizeManifestRecord(probe.manifest);
        const reclassified = classifyRepo({
          ...repo,
          parsedTitle: probe.parsedTitle,
          parsedDescription: probe.parsedDescription,
          tagline: probe.tagline || repo.tagline,
          manifest,
        });
        mergedBySlug.set(key, {
          ...repo,
          title: reclassified.title,
          tagline: reclassified.tagline,
          description: reclassified.description,
          category: reclassified.category,
          liveVerified: true,
          isLiveApp: true,
          surfaceType: 'WEB_APP',
          liveUrl: candidateUrl,
          manifest,
        });
      } else {
        mergedBySlug.set(key, {
          ...repo,
          liveVerified: false,
          isLiveApp: false,
          surfaceType: 'CLI_REPO',
          liveUrl: null,
        });
      }
    }

    if (Array.isArray(eventsPayload)) {
      const todayMs = Date.parse(`${todayDateStr}T00:00:00.000Z`);
      for (const ev of eventsPayload) {
        if (!ev || ev.type !== 'PushEvent') continue;
        const rawRepoName = String(ev.repo?.name || '');
        const slug = rawRepoName.includes('/') ? rawRepoName.split('/').slice(1).join('/') : rawRepoName;
        if (!slug) continue;
        const key = slug.toLowerCase();
        const repo = mergedBySlug.get(key);
        if (!repo) continue;

        if (ev.created_at) {
          const evMs = Date.parse(ev.created_at) || 0;
          const prevMs = Date.parse(repo.pushedAt || '') || 0;
          if (evMs > prevMs) {
            repo.pushedAt = ev.created_at;
          }
        }

        const payloadCommits = Array.isArray(ev.payload?.commits) ? ev.payload.commits : [];
        const addedCommits = [];

        for (const c of payloadCommits) {
          if (!c || !c.sha) continue;
          const message = stripEmojisAndDecodeHtml(c.message || '');
          const author = stripEmojisAndDecodeHtml(c.author?.name || ev.actor?.login || repo.owner);
          if (
            repo.isSelfDeck &&
            (author.toLowerCase().includes('github-actions[bot]') || /\[skip ci\]/i.test(message))
          ) {
            continue;
          }

          const commitDate = c.timestamp || ev.created_at || nowIso;
          const commitObj = {
            sha: String(c.sha),
            sha7: String(c.sha).slice(0, 7),
            message: message.split(/\r?\n/)[0].slice(0, 140),
            author,
            date: commitDate,
            url: sanitizeHttpUrl(`https://github.com/${repo.fullName}/commit/${c.sha}`),
          };
          addedCommits.push(commitObj);

          if (!this._countedCommitShas.has(commitObj.sha)) {
            this._countedCommitShas.add(commitObj.sha);
            const commitDayStr = toUtcDateStr(commitDate);
            const commitDayMs = Date.parse(`${commitDayStr}T00:00:00.000Z`);
            if (Number.isFinite(commitDayMs) && Number.isFinite(todayMs)) {
              const daysAgo = Math.round((todayMs - commitDayMs) / DAY_MS);
              if (daysAgo >= 0 && daysAgo < 30) {
                const idx30 = 29 - daysAgo;
                repo.commits30d[idx30] = (repo.commits30d[idx30] || 0) + 1;
              }
              const chronoEntry = chronoByDate.get(commitDayStr);
              if (chronoEntry) {
                chronoEntry.totalCommits += 1;
                if (!chronoEntry.activeRepoSlugs.includes(repo.slug)) {
                  chronoEntry.activeRepoSlugs.push(repo.slug);
                }
              }
            }
          }
        }

        if (addedCommits.length > 0) {
          repo.recentCommits = mergeRecentCommits(addedCommits, repo.recentCommits);
          repo.commits30dTotal = repo.commits30d.reduce((s, n) => s + n, 0);
        }
      }
    }

    this._snapshot = finalizeSnapshot(
      {
        generatedAt: nowIso,
        owner,
        sourceMode: 'live-github-bake',
        chronoPulse90d,
        repos: Array.from(mergedBySlug.values()),
      },
      owner
    );
    this._seedCountedShas(this._snapshot);
    await writeCachedSnapshot(this._snapshot);
  }

  /**
   * Perform conditional GitHub API sync using If-None-Match ETags.
   * Handles 304, 200, 403/429, and offline failures without throwing.
   * @param {{ manual?: boolean }} [options]
   * @returns {Promise<{ snapshot: object, status: object }>}
   */
  async syncNow({ manual = false } = {}) {
    if (this._destroyed) {
      return { snapshot: this.getSnapshot(), status: this.getStatus() };
    }

    if (this._bootSyncTimer !== null) {
      clearTimeout(this._bootSyncTimer);
      this._bootSyncTimer = null;
    }

    if (this._inFlightSync) {
      if (!manual) return this._inFlightSync;
      await this._inFlightSync.catch(() => {});
    }

    const executeSync = async () => {
      const fetchFn = this._getFetchFn();
      if (!fetchFn) {
        this._status = {
          ...this._status,
          mode: 'SNAPSHOT CACHE',
          badgeTier: 'cached',
          lastCheckedAt: new Date().toISOString(),
          lastError: 'Fetch unavailable',
        };
        this._emitStatus();
        return { snapshot: this.getSnapshot(), status: this.getStatus() };
      }

      this._status = {
        ...this._status,
        mode: 'SYNCING...',
        badgeTier: 'active',
      };
      this._emitStatus();

      const owner = this._options.owner || DEFAULT_OWNER;
      const privateCandidateUrl =
        'https://api.github.com/user/repos?visibility=all&affiliation=owner&sort=pushed&per_page=100';
      const probeAuth = await this._resolveAuthHeaders(privateCandidateUrl);
      const unlockPrivate = await this._resolveUnlockPrivate();
      const usePrivateEndpoint = hasAuthorizationHeader(probeAuth) && unlockPrivate;

      const reposUrl = usePrivateEndpoint
        ? privateCandidateUrl
        : `https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=pushed&per_page=100`;
      const eventsUrl = `https://api.github.com/users/${encodeURIComponent(owner)}/events/public?per_page=100`;

      try {
        const [reposOutcome, eventsOutcome] = await Promise.all([
          this._conditionalGet(fetchFn, reposUrl),
          this._conditionalGet(fetchFn, eventsUrl).catch(() => ({
            status: 0,
            ok: false,
            data: null,
            etag: null,
            rateLimit: null,
          })),
        ]);

        const nowIso = new Date().toISOString();
        const combinedRateLimit = {
          ...this._status.rateLimit,
          ...(eventsOutcome.rateLimit || {}),
          ...(reposOutcome.rateLimit || {}),
        };

        if (reposOutcome.status === 403 || reposOutcome.status === 429) {
          this._status = {
            mode: 'SNAPSHOT CACHE',
            badgeTier: 'cached',
            lastCheckedAt: nowIso,
            lastError: `HTTP ${reposOutcome.status} rate limited`,
            rateLimit: reposOutcome.rateLimit || combinedRateLimit,
          };
          this._emitStatus();
          return { snapshot: this.getSnapshot(), status: this.getStatus() };
        }

        if (eventsOutcome.status === 403 || eventsOutcome.status === 429) {
          if (reposOutcome.status === 200 && Array.isArray(reposOutcome.data)) {
            await this._mergeLiveData(reposOutcome.data, null, usePrivateEndpoint, fetchFn);
            this._emitUpdate();
          }
          this._status = {
            mode: 'SNAPSHOT CACHE',
            badgeTier: 'cached',
            lastCheckedAt: nowIso,
            lastError: `HTTP ${eventsOutcome.status} rate limited`,
            rateLimit: eventsOutcome.rateLimit || combinedRateLimit,
          };
          this._emitStatus();
          return { snapshot: this.getSnapshot(), status: this.getStatus() };
        }

        if (!reposOutcome.ok) {
          this._status = {
            mode: 'SNAPSHOT CACHE',
            badgeTier: 'cached',
            lastCheckedAt: nowIso,
            lastError: `HTTP ${reposOutcome.status || 'ERROR'}`,
            rateLimit: combinedRateLimit,
          };
          this._emitStatus();
          return { snapshot: this.getSnapshot(), status: this.getStatus() };
        }

        if (reposOutcome.status === 304 && eventsOutcome.status !== 200) {
          this._status = {
            mode: 'LIVE DELTA // ETAG 304',
            badgeTier: 'online',
            lastCheckedAt: nowIso,
            lastError: null,
            rateLimit: combinedRateLimit,
          };
          this._emitStatus();
          return { snapshot: this.getSnapshot(), status: this.getStatus() };
        }

        const reposPayload = reposOutcome.status === 200 ? reposOutcome.data : null;
        const eventsPayload = eventsOutcome.status === 200 ? eventsOutcome.data : null;

        await this._mergeLiveData(reposPayload, eventsPayload, usePrivateEndpoint, fetchFn);

        this._status = {
          mode: 'LIVE FETCH // 200',
          badgeTier: 'online',
          lastCheckedAt: nowIso,
          lastError: null,
          rateLimit: combinedRateLimit,
        };
        this._emitUpdate();
        this._emitStatus();
        return { snapshot: this.getSnapshot(), status: this.getStatus() };
      } catch (err) {
        this._status = {
          ...this._status,
          mode: 'SNAPSHOT CACHE',
          badgeTier: 'cached',
          lastCheckedAt: new Date().toISOString(),
          lastError: err?.message || 'Network error',
        };
        this._emitStatus();
        return { snapshot: this.getSnapshot(), status: this.getStatus() };
      }
    };

    const runPromise = executeSync().finally(() => {
      if (this._inFlightSync === runPromise) {
        this._inFlightSync = null;
      }
    });
    this._inFlightSync = runPromise;
    return runPromise;
  }

  /**
   * Return a defensive copy of the active FoundrySnapshotV1.
   * @returns {object}
   */
  getSnapshot() {
    return cloneValue(this._snapshot);
  }

  /**
   * Return a defensive copy of the current sync status object.
   * @returns {object}
   */
  getStatus() {
    return cloneValue(this._status);
  }

  /**
   * Update runtime sync engine options without recreating the instance.
   * @param {object} [patch]
   */
  setOptions(patch = {}) {
    if (!patch || typeof patch !== 'object') return;
    const prevPoll = this._options.pollIntervalMs;
    this._options = {
      ...this._options,
      ...patch,
    };
    if (
      this._booted &&
      !this._destroyed &&
      typeof patch.pollIntervalMs === 'number' &&
      patch.pollIntervalMs > 0 &&
      patch.pollIntervalMs !== prevPoll
    ) {
      this._startPolling();
    }
  }

  /**
   * Stop polling timers and remove DOM visibility listeners.
   */
  destroy() {
    this._destroyed = true;
    this._stopPolling();
    if (this._bootSyncTimer !== null) {
      clearTimeout(this._bootSyncTimer);
      this._bootSyncTimer = null;
    }
    if (
      this._visibilityHandler &&
      typeof document !== 'undefined' &&
      typeof document.removeEventListener === 'function'
    ) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    this._visibilityHandler = null;
  }
}

/**
 * Factory helper for creating a configured TelemetrySyncEngine instance.
 * @param {object} [options]
 * @returns {TelemetrySyncEngine}
 */
export function createSyncEngine(options = {}) {
  return new TelemetrySyncEngine(options);
}
