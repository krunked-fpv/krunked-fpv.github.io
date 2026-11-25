import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECK_CONFIG_SCHEMA,
  PAT_STORAGE_KEY,
  STORAGE_NS,
  VAULT_COOKIE_MAX_BYTES,
  VAULT_IDB_NAME,
  VAULT_KEY,
} from '../config/site';
import {
  downloadDeckConfig,
  exportDeckConfigJson,
  importDeckConfigFromFile,
  MAX_IMPORT_BYTES,
  parseDeckConfigJson,
} from '../vault/configIo';
import {
  _resetVaultForTests,
  createCookieVault,
  decodeShadowCookie,
  defaultVault,
  encodeShadowCookie,
  loadVaultSync,
  normalizeVault,
  reconcileVault,
  saveVault,
  validateVault,
  type VaultData,
  type VaultDocumentLike,
} from '../vault/cookieVault';
import {
  assertGitHubApiOrigin,
  clearPat,
  getAuthHeadersForUrl,
  getPat,
  getPatStatus,
  patScope,
  setPat,
} from '../vault/patStore';

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** Minimal browser-spec in-memory IDBFactory mock exercising real open/upgrade/tx/store paths. */
function createMockIndexedDb() {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();

  const factory = {
    open(name: string) {
      const req: Record<string, unknown> = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name)!;

        const db = {
          objectStoreNames: {
            contains: (storeName: string) => stores.has(storeName),
          },
          createObjectStore(storeName: string) {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            return {};
          },
          transaction(storeName: string) {
            const storeMap = stores.get(storeName);
            if (!storeMap) throw new Error(`Missing objectStore ${storeName}`);
            const tx: Record<string, unknown> = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  get(key: string) {
                    const r: Record<string, unknown> = { result: null, error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      r.result = storeMap.has(key) ? structuredClone(storeMap.get(key)) : undefined;
                      if (typeof r.onsuccess === 'function') r.onsuccess({ target: r });
                      if (typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx });
                    });
                    return r;
                  },
                  put(val: unknown, key: string) {
                    const r: Record<string, unknown> = { result: key, error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      storeMap.set(key, structuredClone(val));
                      if (typeof r.onsuccess === 'function') r.onsuccess({ target: r });
                      if (typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx });
                    });
                    return r;
                  },
                };
              },
            };
            return tx;
          },
          close() {
            /* no-op */
          },
        };

        req.result = db;
        if (isNew && typeof req.onupgradeneeded === 'function') {
          req.onupgradeneeded({ target: req });
        }
        if (typeof req.onsuccess === 'function') {
          req.onsuccess({ target: req });
        }
      });

      return req as unknown as IDBOpenDBRequest;
    },
  };

  return {
    factory: factory as unknown as IDBFactory,
    getRoot: () => dbs.get(VAULT_IDB_NAME)?.get('state')?.get('root') ?? null,
    setRoot: (value: unknown) => {
      if (!dbs.has(VAULT_IDB_NAME)) dbs.set(VAULT_IDB_NAME, new Map());
      const dbStores = dbs.get(VAULT_IDB_NAME)!;
      if (!dbStores.has('state')) dbStores.set('state', new Map());
      dbStores.get('state')!.set('root', structuredClone(value));
    },
    clear: () => dbs.clear(),
  };
}

/** Minimal cookie jar tracking exact Set-Cookie headers written by the vault. */
function createMockDocument(protocol = 'http:'): VaultDocumentLike & {
  lastSetHeader: string;
  clear: () => void;
} {
  const jar = new Map<string, string>();
  let lastSetHeader = '';

  return {
    location: { protocol },
    get lastSetHeader() {
      return lastSetHeader;
    },
    get cookie() {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    },
    set cookie(header: string) {
      lastSetHeader = header;
      const [pair = '', ...attrs] = header.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) return;
      const key = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      const maxAgeAttr = attrs.find((a) => a.trim().toLowerCase().startsWith('max-age='));
      if (maxAgeAttr && Number(maxAgeAttr.split('=')[1]) <= 0) {
        jar.delete(key);
      } else {
        jar.set(key, val);
      }
    },
    clear() {
      jar.clear();
      lastSetHeader = '';
    },
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

function sampleV2(overrides: Partial<VaultData> = {}): VaultData {
  return {
    v: 2,
    rev: 4,
    updatedAt: 1_795_500_000_000,
    pins: ['maul-forge', 'dojo'],
    prefs: {
      view: 'grid',
      sort: 'velocity',
      filter: 'live',
      theme: 'daylight',
      soundEnabled: true,
    },
    curation: {
      dojo: {
        displayName: 'Dojo Arena',
        tagline: 'Train daily on the forge',
        category: 'Game',
        launchUrl: 'https://krunked-fpv.github.io/dojo/',
        accent: 145,
        artStyle: 'synthwave',
        hidden: false,
        featured: true,
      },
    },
    seen: { dojo: 'abc1234', 'maul-forge': 'def5678' },
    ...overrides,
  };
}

describe('Triple-redundant auto-healing Vault V2 (cookieVault.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = `${VAULT_KEY}=; Path=/; Max-Age=0`;
    _resetVaultForTests();
  });

  it('persists across localStorage (plain JSON), IndexedDB krunked_vault_v1, and <3800B shadow cookie with monotonic rev', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument('https:');
    let clock = 1_795_600_000_000;

    const v = createCookieVault({
      localStorage: ls,
      indexedDB: idb.factory,
      document: doc,
      now: () => (clock += 100),
    });

    const first = await v.save(sampleV2({ rev: 1 }));
    expect(first.v).toBe(2);
    expect(first.rev).toBe(2);

    const second = await v.save({ ...first, prefs: { ...first.prefs, theme: 'obsidian' } });
    expect(second.rev).toBe(3);

    // Store A: plain JSON so index.html pre-paint script can read prefs.theme with zero FOUC
    const rawLs = JSON.parse(ls.getItem(VAULT_KEY)!);
    expect(rawLs.v).toBe(2);
    expect(rawLs.rev).toBe(3);
    expect(rawLs.prefs.theme).toBe('obsidian');
    expect(rawLs.prefs.soundEnabled).toBe(true);

    // Store B: IndexedDB krunked_vault_v1 -> state/root
    const rawIdb = idb.getRoot() as VaultData;
    expect(rawIdb.rev).toBe(3);
    expect(rawIdb.curation.dojo?.displayName).toBe('Dojo Arena');

    // Store C: Shadow Cookie attributes & wire format
    expect(doc.lastSetHeader).toContain('Path=/');
    expect(doc.lastSetHeader).toContain('Max-Age=31536000');
    expect(doc.lastSetHeader).toContain('SameSite=Lax');
    expect(doc.lastSetHeader).toContain('; Secure');
    const cookieVal = doc.cookie.split('=')[1]!;
    expect(cookieVal.startsWith('v2.')).toBe(true);
    expect(utf8Bytes(cookieVal)).toBeLessThan(VAULT_COOKIE_MAX_BYTES);

    const status = v.getStatus();
    expect(status.healthyCount).toBe(3);
    expect(status.stores).toEqual({ localStorage: true, indexedDB: true, cookie: true });
    expect(status.cookieBudget).toBe(VAULT_COOKIE_MAX_BYTES);
    expect(status.cookieShedLevel).toBe('none');
  });

  it('heals deleted localStorage + IndexedDB from surviving shadow cookie', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();

    const writer = createCookieVault({
      localStorage: ls,
      indexedDB: idb.factory,
      document: doc,
      now: () => 1_795_600_005_000,
    });
    const saved = await writer.save(sampleV2({ rev: 5 }));

    // Wipe Store A and Store B completely
    ls.clear();
    idb.clear();
    expect(ls.getItem(VAULT_KEY)).toBeNull();
    expect(idb.getRoot()).toBeNull();

    // Fresh boot reconciles from Store C (shadow cookie)
    const reader = createCookieVault({
      localStorage: ls,
      indexedDB: idb.factory,
      document: doc,
    });
    const { state, status } = await reader.reconcile();

    expect(state.rev).toBe(saved.rev);
    expect(state.pins).toEqual(['maul-forge', 'dojo']);
    expect(state.prefs.theme).toBe('daylight');
    expect(state.prefs.soundEnabled).toBe(true);
    expect(state.curation.dojo?.displayName).toBe('Dojo Arena');

    expect(status.lastHealedFrom).toBe('cookie');
    expect(status.lastRepairedStores).toEqual(['localStorage', 'indexedDB']);
    expect(status.healthyCount).toBe(3);

    // Verify both primary stores were repaired on disk
    expect(JSON.parse(ls.getItem(VAULT_KEY)!).rev).toBe(saved.rev);
    expect((idb.getRoot() as VaultData).rev).toBe(saved.rev);
  });

  it('heals cleared or tampered shadow cookie from primary stores', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();

    const data = sampleV2({ rev: 7 });
    ls.setItem(VAULT_KEY, JSON.stringify(data));
    idb.setRoot(data);
    // Tamper cookie checksum
    const goodWire = encodeShadowCookie(data).wire;
    const tamperedWire = `${goodWire.slice(0, -1)}${goodWire.endsWith('0') ? '1' : '0'}`;
    expect(decodeShadowCookie(tamperedWire)).toBeNull();
    doc.cookie = `${VAULT_KEY}=${tamperedWire}; Path=/`;

    const vault = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });
    const { state, status } = await vault.reconcile();

    expect(state.rev).toBe(7);
    expect(status.lastHealedFrom).toBe('localStorage');
    expect(status.lastRepairedStores).toEqual(['cookie']);
    expect(status.healthyCount).toBe(3);
    expect(doc.cookie).toContain(goodWire);
  });

  it('heals deleted localStorage + cookie from IndexedDB without sync-boot clobbering', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();

    const data = sampleV2({ rev: 3 });
    idb.setRoot(data);

    const vault = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });
    const listener = vi.fn();
    vault.subscribe(listener);

    // Sync fast boot sees empty LS + Cookie and must NOT write default to LS/Cookie
    const syncState = vault.loadSync();
    expect(syncState.pins).toEqual([]);
    expect(ls.getItem(VAULT_KEY)).toBeNull();
    expect(doc.cookie).toBe('');

    // Async reconcile discovers IndexedDB rev 3 and heals LS + Cookie + notifies subscribers
    const { state, status } = await vault.reconcile();
    expect(state.rev).toBe(3);
    expect(state.pins).toEqual(['maul-forge', 'dojo']);
    expect(state.seen).toEqual({ dojo: 'abc1234', 'maul-forge': 'def5678' });
    expect(status.lastHealedFrom).toBe('indexedDB');
    expect(status.lastRepairedStores).toEqual(['localStorage', 'cookie']);
    expect(status.healthyCount).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ls.getItem(VAULT_KEY)!).rev).toBe(3);
    expect(decodeShadowCookie(doc.cookie.split('=')[1]!)?.rev).toBe(3);
  });

  it('reconciles by monotonic rev first (immune to clock skew), then updatedAt, then priority LS > IDB > Cookie', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();

    // Higher rev in IDB (rev 10, older timestamp) MUST beat lower rev in LS (rev 9, future timestamp)
    ls.setItem(VAULT_KEY, JSON.stringify(sampleV2({ rev: 9, updatedAt: 9_999_999_999_999, pins: ['stale-clock'] })));
    idb.setRoot(sampleV2({ rev: 10, updatedAt: 1_700_000_000_000, pins: ['higher-rev-wins'] }));

    const v1 = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });
    const res1 = await v1.reconcile();
    expect(res1.state.rev).toBe(10);
    expect(res1.state.pins).toEqual(['higher-rev-wins']);
    expect(res1.status.lastHealedFrom).toBe('indexedDB');

    // Equal rev & updatedAt: unshed IDB (priority 1) beats shed cookie (priority 2) when LS is cleared
    ls.clear();
    const bigSeen: Record<string, string> = {};
    for (let i = 0; i < 160; i += 1) bigSeen[`repo-${i}`] = 'a'.repeat(40);
    const full = sampleV2({ rev: 12, updatedAt: 1_795_700_000_000, seen: bigSeen });
    idb.setRoot(full);
    const shedCookie = encodeShadowCookie(full);
    expect(shedCookie.shedLevel).toBe('seen');
    doc.cookie = `${VAULT_KEY}=${shedCookie.wire}; Path=/`;

    const v2 = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });
    const res2 = await v2.reconcile();
    expect(res2.status.lastHealedFrom).toBe('indexedDB');
    expect(Object.keys(res2.state.seen)).toHaveLength(160);
    expect(Object.keys(JSON.parse(ls.getItem(VAULT_KEY)!).seen)).toHaveLength(160);
  });

  it('migrates legacy V1 localStorage and V1 URI-encoded shadow cookies transparently to V2', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();

    const legacyV1 = {
      v: 1,
      pins: ['krunked_skymap'],
      prefs: { view: 'matrix', sort: 'alpha', filter: 'all' },
      seen: { krunked_skymap: '9f8e7d6' },
      updatedAt: 9000,
    };
    doc.cookie = `${VAULT_KEY}=${encodeURIComponent(JSON.stringify(legacyV1))}; Path=/`;

    const vault = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });
    const { state, status } = await vault.reconcile();

    expect(state.v).toBe(2);
    expect(state.rev).toBe(1);
    expect(state.pins).toEqual(['krunked_skymap']);
    expect(state.prefs).toEqual({
      view: 'matrix',
      sort: 'alpha',
      filter: 'all',
      theme: 'obsidian',
      soundEnabled: false,
    });
    expect(state.curation).toEqual({});
    expect(state.seen).toEqual({ krunked_skymap: '9f8e7d6' });
    expect(status.healthyCount).toBe(3);

    // Upgraded on disk to V2 plain JSON + V2 checksummed cookie
    expect(JSON.parse(ls.getItem(VAULT_KEY)!).v).toBe(2);
    expect(doc.cookie.split('=')[1]!.startsWith('v2.')).toBe(true);
  });

  it('enforces <3800B shadow cookie ceiling across all 4 progressive shedding stages', async () => {
    // Stage 1: shed `seen`
    const hugeSeen: Record<string, string> = {};
    for (let i = 0; i < 200; i += 1) hugeSeen[`repo-${i}`] = 'f'.repeat(40);
    const s1 = encodeShadowCookie(sampleV2({ seen: hugeSeen }));
    expect(s1.shedLevel).toBe('seen');
    expect(s1.bytes).toBeLessThan(VAULT_COOKIE_MAX_BYTES);
    const decodedS1 = decodeShadowCookie(s1.wire)!;
    expect(decodedS1.seen).toEqual({});
    expect(decodedS1.pins).toEqual(['maul-forge', 'dojo']);
    expect(decodedS1.curation.dojo?.displayName).toBe('Dojo Arena');

    // Stage 2/3: shed `curation` taglines / metadata / oldest entries
    const heavyCuration: VaultData['curation'] = {};
    for (let i = 0; i < 65; i += 1) {
      heavyCuration[`project-slug-${i}`] = {
        displayName: `Forge Telemetry Rig Number ${i}`,
        tagline: `Long architectural hardware description for project ${i} `.repeat(3).trim(),
        category: 'Automation',
        launchUrl: `https://krunked-fpv.github.io/project-slug-${i}/`,
        accent: (i * 11) % 360,
        artStyle: 'topo',
        featured: true,
      };
    }
    const s2 = encodeShadowCookie(sampleV2({ curation: heavyCuration, seen: {} }));
    expect(s2.shedLevel).toBe('curation');
    expect(s2.bytes).toBeLessThan(VAULT_COOKIE_MAX_BYTES);
    const decodedS2 = decodeShadowCookie(s2.wire)!;
    expect(decodedS2.pins).toEqual(['maul-forge', 'dojo']);
    expect(decodedS2.prefs.theme).toBe('daylight');

    // Stage 4: emergency tail-truncation of pathological pins (still <3800B and preserves theme + rev)
    const manyPins = Array.from({ length: 500 }, (_, i) => `very-long-project-repository-slug-${i}`);
    const s4 = encodeShadowCookie(sampleV2({ pins: manyPins, curation: {}, seen: {} }));
    expect(s4.shedLevel).toBe('pins');
    expect(s4.bytes).toBeLessThan(VAULT_COOKIE_MAX_BYTES);
    const decodedS4 = decodeShadowCookie(s4.wire)!;
    expect(decodedS4.rev).toBe(4);
    expect(decodedS4.prefs.theme).toBe('daylight');
    // Verify index.html zero-FOUC pre-paint cookie parser sees `prefs.theme === 'daylight'` directly
    const b64Seg = s4.wire.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64Seg + '='.repeat((4 - (b64Seg.length % 4)) % 4);
    const decodedJson = JSON.parse(atob(padded)) as { prefs?: { theme?: string } };
    expect(decodedJson.prefs?.theme).toBe('daylight');
    expect(decodedS4.pins.length).toBeGreaterThan(0);
    expect(decodedS4.pins.length).toBeLessThan(manyPins.length);
    expect(decodedS4.pins[0]).toBe('very-long-project-repository-slug-0');
  });

  it('maintains referentially stable getStatus() snapshots for React useSyncExternalStore', async () => {
    const ls = createMemoryStorage();
    const idb = createMockIndexedDb();
    const doc = createMockDocument();
    const v = createCookieVault({ localStorage: ls, indexedDB: idb.factory, document: doc });

    const snapA = v.getStatus();
    const snapB = v.getStatus();
    expect(Object.is(snapA, snapB)).toBe(true);

    const statusListener = vi.fn();
    v.subscribeStatus(statusListener);

    await v.save(sampleV2());
    const snapC = v.getStatus();
    expect(Object.is(snapA, snapC)).toBe(false);
    expect(Object.is(snapC, v.getStatus())).toBe(true);
    expect(statusListener).toHaveBeenCalled();
  });

  it('sanitizes XSS, emojis, control chars, unsafe URLs, and forbidden keys in vault state', () => {
    const clean = normalizeVault({
      v: 2,
      rev: 2,
      updatedAt: 1000,
      pins: ['dojo', '__proto__', 'constructor', '<b>maul-forge</b> 🚀★', 'dojo'],
      prefs: {
        view: 'invalid-view',
        sort: 'alpha',
        filter: '<script>evil()</script>live 🔥',
        theme: 'daylight',
        soundEnabled: true,
      },
      curation: {
        __proto__: { displayName: 'polluted' },
        dojo: {
          displayName: '&lt;script&gt;alert(1)&lt;/script&gt;<b>Dojo</b> 🚀★',
          tagline: 'Sharp &amp; clean <img src=x onerror=alert(1)>',
          launchUrl: 'javascript:alert(1)',
          accent: 999,
          category: 'Game',
          artStyle: 'orbital',
        },
        badurl: {
          launchUrl: 'https://user:pass@evil.example/app',
        },
      },
      seen: { __proto__: 'bad', dojo: 'abc1234\r\n' },
    });

    expect(clean.pins).toEqual(['dojo', 'maul-forge']);
    expect(clean.prefs.view).toBe('bento');
    expect(clean.prefs.filter).toBe('live');
    expect(clean.curation.dojo).toEqual({
      displayName: 'Dojo',
      tagline: 'Sharp & clean',
      accent: 360,
      category: 'Game',
      artStyle: 'orbital',
    });
    expect(clean.curation.badurl).toBeUndefined();
    expect(clean.seen).toEqual({ dojo: 'abc1234' });
    expect(({} as Record<string, unknown>).displayName).toBeUndefined();
    expect(validateVault({ v: 99, rev: 1, updatedAt: 0, pins: [] })).toBeNull();
  });

  it('default singleton exports work cleanly in jsdom', async () => {
    const saved = await saveVault(sampleV2({ rev: 1 }));
    expect(saved.rev).toBe(2);
    const loaded = loadVaultSync();
    expect(loaded.pins).toEqual(['maul-forge', 'dojo']);
    const rec = await reconcileVault();
    expect(rec.state.rev).toBe(2);
    expect(rec.status.stores.localStorage).toBe(true);
    expect(rec.status.stores.cookie).toBe(true);
  });
});

describe('Portable KrunkedDeckConfigV2 Export / Import (configIo.ts)', () => {
  it('round-trips valid config and guarantees ZERO PAT or secret leakage on export & import', () => {
    const poisonedInput = {
      ...sampleV2(),
      pat: 'github_pat_LEAK_TOP_LEVEL_123456',
      token: 'ghp_LEAK_TOKEN_987654',
      Authorization: 'Bearer ghp_LEAK_AUTH',
      prefs: {
        ...sampleV2().prefs,
        pat: 'github_pat_LEAK_IN_PREFS',
      },
    };

    const json = exportDeckConfigJson(poisonedInput);
    expect(json).not.toContain('github_pat_');
    expect(json).not.toContain('ghp_');
    expect(json).not.toContain('Bearer');
    expect(json).not.toContain('"pat"');
    expect(json).not.toContain('"token"');

    const { config, state } = parseDeckConfigJson(json);
    expect(config.schema).toBe(DECK_CONFIG_SCHEMA);
    expect(state.v).toBe(2);
    expect(state.pins).toEqual(['maul-forge', 'dojo']);
    expect(state.prefs.theme).toBe('daylight');
    expect(state.prefs.soundEnabled).toBe(true);
    expect(state.curation.dojo?.displayName).toBe('Dojo Arena');
  });

  it('blocks prototype pollution, rogue PAT keys, XSS/emojis, and unsafe URLs on import', () => {
    const hostileJson = `{
      "schema": "KrunkedDeckConfigV2",
      "exportedAt": "2026-11-24T20:00:00.000Z",
      "pat": "github_pat_HOSTILE_ROOT",
      "__proto__": { "pollutedRoot": true },
      "state": {
        "v": 2,
        "rev": 5,
        "updatedAt": 1795500000000,
        "pat": "github_pat_HOSTILE_STATE",
        "__proto__": { "pollutedState": true },
        "pins": ["dojo", "__proto__", "prototype", "constructor", "maul-forge"],
        "prefs": { "view": "matrix", "sort": "push", "filter": "live", "theme": "daylight", "soundEnabled": false, "token": "secret" },
        "curation": {
          "__proto__": { "pollutedCuration": true },
          "dojo": {
            "displayName": "<script>alert(1)</script>Dojo ★🚀",
            "tagline": "&lt;img src=x onerror=alert(1)&gt;Clean tagline",
            "launchUrl": "data:text/html,<script>alert(1)</script>",
            "category": "Game",
            "pat": "secret"
          }
        },
        "seen": { "__proto__": "x", "dojo": "1234567" }
      }
    }`;

    const { state } = parseDeckConfigJson(hostileJson);
    const probe = {} as Record<string, unknown>;
    expect(probe.pollutedRoot).toBeUndefined();
    expect(probe.pollutedState).toBeUndefined();
    expect(probe.pollutedCuration).toBeUndefined();

    expect(state.pins).toEqual(['dojo', 'maul-forge']);
    expect(state.curation.dojo).toEqual({
      displayName: 'Dojo',
      tagline: 'Clean tagline',
      category: 'Game',
    });
    expect(JSON.stringify(state)).not.toContain('github_pat_');
    expect(JSON.stringify(state)).not.toContain('secret');
    expect(JSON.stringify(state)).not.toContain('data:text/html');
  });

  it('rejects malformed JSON, wrong schema, unsupported version, and >2MB payloads', async () => {
    expect(() => parseDeckConfigJson('')).toThrow();
    expect(() => parseDeckConfigJson('{not-json')).toThrow(/Malformed/);
    expect(() => parseDeckConfigJson('[]')).toThrow(/root value/);
    expect(() =>
      parseDeckConfigJson(JSON.stringify({ schema: 'KrunkedDeckConfigV1', state: defaultVault() })),
    ).toThrow(/schema/);
    expect(() =>
      parseDeckConfigJson(JSON.stringify({ schema: DECK_CONFIG_SCHEMA, state: { v: 99 } })),
    ).toThrow(/Unsupported vault state version/);

    const oversized = `{"schema":"KrunkedDeckConfigV2","pad":"${'x'.repeat(MAX_IMPORT_BYTES)}"}`;
    expect(() => parseDeckConfigJson(oversized)).toThrow(/2MB/);
    expect(() => parseDeckConfigJson(' '.repeat(MAX_IMPORT_BYTES + 16))).toThrow(/2MB/);

    await expect(
      importDeckConfigFromFile({ size: MAX_IMPORT_BYTES + 1, text: async () => '{}' }),
    ).rejects.toThrow(/2MB/);

    const validJson = exportDeckConfigJson(sampleV2());
    const imported = await importDeckConfigFromFile({
      size: utf8Bytes(validJson),
      text: async () => validJson,
    });
    expect(imported.state.pins).toEqual(['maul-forge', 'dojo']);
  });

  it('triggers safe browser download with noopener and deferred revokeObjectURL', () => {
    vi.useFakeTimers();
    const createUrl = vi.fn(() => 'blob:mock-config-url');
    const revokeUrl = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      downloadDeckConfig(sampleV2());
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      // Must NOT revoke synchronously (prevents browser download cancellation race)
      expect(revokeUrl).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeUrl).toHaveBeenCalledWith('blob:mock-config-url');
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      vi.useRealTimers();
    }
  });
});

describe('Local PAT Security Firewall (patStore.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = `${VAULT_KEY}=; Path=/; Max-Age=0`;
    clearPat();
  });

  afterEach(() => {
    clearPat();
    vi.restoreAllMocks();
  });

  it('isolates session vs device persistence under krunked-local-pat-v1 with zero cookie/vault/console leakage', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const secret = 'github_pat_11ABCDEFGH_9876543210SECRET';
    const r1 = setPat(secret, 'session');
    expect(r1.saved).toBe(true);
    expect(r1.status.configured).toBe(true);
    expect(r1.status.scope).toBe('session');
    expect(r1.status.maskedHint).toBe('gith...CRET');
    expect(r1.status.maskedHint).not.toContain('ABCDEFGH');

    expect(sessionStorage.getItem(PAT_STORAGE_KEY)).toBe(secret);
    expect(localStorage.getItem(PAT_STORAGE_KEY)).toBeNull();
    expect(patScope()).toBe('session');
    expect(getPat()).toBe(secret);

    // Switch to device scope -> must remove from sessionStorage and store only in localStorage
    const r2 = setPat(secret, 'device');
    expect(r2.saved).toBe(true);
    expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe(secret);
    expect(sessionStorage.getItem(PAT_STORAGE_KEY)).toBeNull();
    expect(patScope()).toBe('device');

    // Never leaks to cookies, vault storage, config export, or console
    expect(document.cookie).not.toContain(secret);
    expect(localStorage.getItem(VAULT_KEY)).toBeNull();
    expect(exportDeckConfigJson(defaultVault())).not.toContain(secret);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();

    clearPat();
    expect(getPat()).toBeNull();
    expect(patScope()).toBeNull();
    expect(getPatStatus()).toEqual({ configured: false, scope: null, maskedHint: '' });
  });

  it('migrates legacy V1 forge-deck:pat key cleanly into krunked-local-pat-v1', () => {
    const legacyKey = `${STORAGE_NS}:pat`;
    localStorage.setItem(legacyKey, 'ghp_LegacyMigratedToken1234');
    expect(getPat()).toBe('ghp_LegacyMigratedToken1234');
    expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe('ghp_LegacyMigratedToken1234');
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(patScope()).toBe('device');
  });

  it('rejects whitespace, control chars, and HTTP header-injection tokens', () => {
    expect(setPat('ghp_valid\r\nX-Injected: evil', 'session').saved).toBe(false);
    expect(setPat('ghp_has spaces inside', 'session').saved).toBe(false);
    expect(setPat('ghp_null\u0000byte', 'device').saved).toBe(false);
    expect(setPat('abc', 'session').saved).toBe(false);
    expect(getPat()).toBeNull();
  });

  it('enforces strict https://api.github.com origin firewall in assertGitHubApiOrigin & getAuthHeadersForUrl', () => {
    const secret = 'github_pat_FirewallVerifiedToken9999';
    setPat(secret, 'session');

    // Permitted canonical API URLs
    const parsed1 = assertGitHubApiOrigin('https://api.github.com/users/krunked-fpv/repos?per_page=100');
    expect(parsed1.origin).toBe('https://api.github.com');
    expect(assertGitHubApiOrigin(new URL('https://api.github.com/rate_limit')).pathname).toBe('/rate_limit');
    expect(getAuthHeadersForUrl('https://api.github.com/users/krunked-fpv/repos')).toEqual({
      Authorization: `Bearer ${secret}`,
    });
    expect(getAuthHeadersForUrl('https://api.github.com/rate_limit', 'ghp_OverrideToken1234')).toEqual({
      Authorization: 'Bearer ghp_OverrideToken1234',
    });

    // Adversarial non-API / spoofing / userinfo / scheme attacks MUST be blocked
    const hostileUrls = [
      'http://api.github.com/users/krunked-fpv/repos',
      'https://api.github.com:8443/users/krunked-fpv/repos',
      'https://api.github.com.evil.com/users/krunked-fpv/repos',
      'https://evil.com/https://api.github.com/users/krunked-fpv/repos',
      'https://user:pass@api.github.com/users/krunked-fpv/repos',
      'https://token@api.github.com/users/krunked-fpv/repos',
      'https://krunked-fpv.github.io/snapshot.json',
      'https://github.com/krunked-fpv',
      'javascript:alert(1)',
      'data:text/plain,hello',
      'https://api.github.com/users/\nkrunked-fpv',
      '',
      '   ',
      'not-a-valid-url',
    ];

    for (const url of hostileUrls) {
      expect(() => assertGitHubApiOrigin(url), `Expected throw for ${url}`).toThrow();
      expect(getAuthHeadersForUrl(url), `Expected empty headers for ${url}`).toEqual({});
      expect(getAuthHeadersForUrl(url, secret), `Expected empty headers w/ override for ${url}`).toEqual({});
    }
  });
});
