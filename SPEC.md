# SPEC — KRUNKED // DECK Interface & Data Contracts

All cross-module data structures, storage names, export signatures, PWA invariants, and CSS class hooks are locked below. Every specialist must adhere verbatim.

---

## 1. Canonical Constants & Domain Enums

- **Owner Account**: `'krunked-fpv'`
- **Telemetry IndexedDB**: `'krunked_deck_telemetry_v1'` (object stores: `'snapshot'`, `'endpoints'`, `'manifests'`)
- **Vault Key & Cookie Name**: `'krunked-cookie-vault-v1'`
- **Vault IndexedDB**: `'krunked_vault_v1'` (object store: `'state'`, key `'root'`; optional isolated key `'pat'` only inside `'pat_store'` or localStorage `'krunked-local-pat-v1'`)
- **PAT Storage Key**: `'krunked-local-pat-v1'` (NEVER written to cookies or JSON exports)
- **Shadow Cookie Max Byte Length**: `< 3800` UTF-8 bytes after `encodeURIComponent` (`document.cookie` attribute: `krunked-cookie-vault-v1=<encoded>; Path=/; Max-Age=31536000; SameSite=Lax`)
- **Service Worker Cache Name**: `KRUNKED_SW_CACHE_V1 = 'krunked-sw-cache-v1'`
- **Domain Category Tags (`CATEGORY_TAGS`)**:
  1. `'GAMES & RPG'`
  2. `'SIMULATORS & FPV'`
  3. `'UTILITIES & AI'`
  4. `'SRE & TELEMETRY'`
  5. `'AUDIO & VINYL'`
  6. `'FAMILY & EDU'`
- **Thermal Thresholds**:
  - `< 24h` (`ageMs < 86_400_000`): `{ tier: 'hot', label: 'HOT // <24H', colorToken: '--led-hot' }`
  - `< 7d` (`ageMs < 604_800_000`): `{ tier: 'active', label: 'ACTIVE // <7D', colorToken: '--led-active' }`
  - Otherwise: `{ tier: 'online', label: 'ONLINE', colorToken: '--led-online' }`

---

## 2. Data Schemas

### 2.1 `FoundrySnapshotV1` (`./data/foundry-snapshot.json`)
```json
{
  "schemaVersion": "FoundrySnapshotV1",
  "generatedAt": "2026-11-24T04:15:00.000Z",
  "owner": "krunked-fpv",
  "sourceMode": "live-github-bake | preserved-cache | offline-fallback",
  "totals": {
    "totalRepos": 16,
    "liveApps": 15,
    "commits30d": 42,
    "commits90d": 88,
    "lastPushAt": "2026-11-24T04:00:28.000Z"
  },
  "chronoPulse90d": [
    {
      "date": "2026-08-27",
      "totalCommits": 3,
      "activeRepoSlugs": ["dojo", "krunked_skymap"]
    }
  ],
  "repos": [ /* Array<RepoRecordV1>, length >= 1, sorted newest pushedAt first */ ]
}
```
Notes:
- `chronoPulse90d` MUST contain exactly `90` chronological entries ending on the UTC date of `generatedAt` (`YYYY-MM-DD`).
- Automated `github-actions[bot]` / `[skip ci]` telemetry-bake commits on `krunked-fpv.github.io` are excluded from `commits30d`, `chronoPulse90d`, and `totals.commits30d/90d` so the 20m cron never inflates velocity.

### 2.2 `RepoRecordV1`
```json
{
  "slug": "chaosdeck-sre",
  "owner": "krunked-fpv",
  "fullName": "krunked-fpv/chaosdeck-sre",
  "htmlUrl": "https://github.com/krunked-fpv/chaosdeck-sre",
  "actionsUrl": "https://github.com/krunked-fpv/chaosdeck-sre/actions",
  "title": "ChaosDeck SRE",
  "tagline": "Phosphor War Room",
  "description": "Phosphor War Room — Chaos engineering and SRE telemetry workbench.",
  "category": "SRE & TELEMETRY",
  "surfaceType": "WEB_APP",
  "isLiveApp": true,
  "isSelfDeck": false,
  "liveVerified": true,
  "liveUrl": "https://krunked-fpv.github.io/chaosdeck-sre/",
  "pagesCandidateUrl": "https://krunked-fpv.github.io/chaosdeck-sre/",
  "homepage": null,
  "hasPages": true,
  "isPrivate": false,
  "isFork": false,
  "isArchived": false,
  "defaultBranch": "main",
  "primaryLanguage": "JavaScript",
  "languages": { "JavaScript": 45120, "CSS": 8200, "HTML": 3100 },
  "topics": [],
  "sizeKb": 1240,
  "stars": 0,
  "watchers": 0,
  "openIssues": 0,
  "createdAt": "2026-11-23T08:00:00Z",
  "updatedAt": "2026-11-23T08:40:29Z",
  "pushedAt": "2026-11-23T08:40:29Z",
  "commits30d": [0, 0, "...30 integers oldest->today"],
  "commits30dTotal": 5,
  "recentCommits": [
    {
      "sha": "a1b2c3d4e5f6...",
      "sha7": "a1b2c3d",
      "message": "Initial phosphor war room telemetry layout",
      "author": "krunked-fpv",
      "date": "2026-11-23T08:40:29Z",
      "url": "https://github.com/krunked-fpv/chaosdeck-sre/commit/a1b2c3d4e5f6..."
    }
  ],
  "manifest": {
    "name": "ChaosDeck SRE",
    "shortName": "ChaosDeck",
    "themeColor": "#08090B",
    "iconUrl": null,
    "ogImageUrl": null
  }
}
```
Validation Rules:
- Every text field (`title`, `tagline`, `description`, `recentCommits[].message`, `manifest.name`, `manifest.shortName`) MUST be entity-decoded and stripped of all Unicode pictographic emojis (`\p{Extended_Pictographic}`).
- `surfaceType`: `'WEB_APP'` when `isLiveApp === true`, otherwise `'CLI_REPO'`.
- If a repo has `hasPages === true` and its live HTTP probe returns `404` or `"Site not found"`, set `liveVerified: false`, `isLiveApp: false`, `surfaceType: 'CLI_REPO'`, `liveUrl: null` (while keeping `pagesCandidateUrl`).
- For `slug.toLowerCase() === 'krunked-fpv.github.io'`: set `isSelfDeck: true`, `isLiveApp: true`, `liveVerified: true`, `surfaceType: 'WEB_APP'`, `liveUrl: 'https://krunked-fpv.github.io/'`, `category: 'SRE & TELEMETRY'`, `title: 'KRUNKED // DECK'`.

### 2.3 `krunked-cookie-vault-v1` State Schema (`DEFAULT_VAULT_STATE`)
```json
{
  "v": 1,
  "rev": 1,
  "updatedAt": 1795492800000,
  "theme": "obsidian",
  "view": "deck",
  "sort": "latest",
  "category": "ALL",
  "launchTarget": "new_tab",
  "audioMuted": true,
  "showHidden": false,
  "unlockPrivate": false,
  "installDismissed": false,
  "pinned": [],
  "hidden": [],
  "curated": {
    "<slug>": {
      "title": "Optional string (max 72 chars)",
      "description": "Optional string (max 200 chars)",
      "liveUrl": "Optional https:// URL",
      "category": "Optional CATEGORY_TAGS value",
      "accentHex": "Optional #RRGGBB"
    }
  }
}
```
Wire compaction inside shadow cookie `krunked-cookie-vault-v1`:
- Serialize using short keys (`v,r,u,t,w,s,c,l,m,h,p,d,P,H,C`) + omit defaults so normal usage stays <1KB and never exceeds 3800 encoded bytes; if user adds dozens of long custom descriptions, automatically truncate/prune oldest `curated` descriptions from the cookie mirror (keeping full data in A/B while guaranteeing `pinned`, `hidden`, `theme`, `view`, `title` overrides always fit under `3800` encoded bytes).

### 2.4 `KrunkedDeckConfigV1` (JSON Export / Import)
```json
{
  "schema": "KrunkedDeckConfigV1",
  "exportedAt": "2026-11-24T04:20:00.000Z",
  "state": { /* DEFAULT_VAULT_STATE shape without any PAT */ }
}
```

---

## 3. Exact ES Module Export Signatures

### `./src/telemetry/classifier.js`
- `export const CATEGORY_TAGS = ['GAMES & RPG', 'SIMULATORS & FPV', 'UTILITIES & AI', 'SRE & TELEMETRY', 'AUDIO & VINYL', 'FAMILY & EDU'];`
- `export function stripEmojisAndDecodeHtml(input)` -> `string` (decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&middot;`, numeric entities; removes `\p{Extended_Pictographic}`, variation selectors, ZWJ sequences; collapses whitespace; preserves `⌘` and `↵`)
- `export function sanitizeHttpUrl(rawUrl, baseUrl)` -> `string | null` (returns normalized `http:`/`https:` URL string, else `null`)
- `export function humanizeSlug(slug)` -> `string` (splits `-`/`_`, uppercases acronyms `fpv, ui, pwa, cli, ai, sre, qr, dsp, gpu, rpg, edu, api, sdk, 2d, 3d`)
- `export function classifyRepo(repoLike)` -> `{ category, title, tagline, description }`
- `export function getThermalState(pushedAtIso, nowMs = Date.now())` -> `{ tier, label, ageMs, colorVar }`

### `./src/telemetry/idb-cache.js`
- `export const TELEMETRY_IDB_NAME = 'krunked_deck_telemetry_v1';`
- `export async function readCachedSnapshot()` -> `Promise<FoundrySnapshotV1 | null>`
- `export async function writeCachedSnapshot(snapshot)` -> `Promise<void>`
- `export async function readEndpointCache(url)` -> `Promise<{ etag: string | null, data: any, rateLimit: object, checkedAt: number } | null>`
- `export async function writeEndpointCache(url, record)` -> `Promise<void>`
- `export async function readManifestCache(slug)` -> `Promise<object | null>`
- `export async function writeManifestCache(slug, data)` -> `Promise<void>`
- `export async function clearTelemetryCache()` -> `Promise<void>`

### `./src/telemetry/manifest-probe.js`
- `export function parseSubAppHtml(htmlText, baseUrl)` -> `{ title, tagline, description, themeColor, iconUrl, ogImageUrl, manifestUrl, isNotFound }`
- `export async function probeLiveSubApp(slug, liveUrl, options = {})` -> `Promise<{ liveVerified, manifest, parsedTitle, parsedDescription, error }>` (uses `fetchFn` option if supplied for tests; 4500ms `AbortSignal` timeout; returns safe null fields on failure/404)

### `./src/telemetry/sync-engine.js`
- `export class TelemetrySyncEngine extends EventTarget`
- `export function createSyncEngine(options = {})` -> `TelemetrySyncEngine`
  - `options`: `{ snapshotUrl = './data/foundry-snapshot.json', owner = 'krunked-fpv', getAuthHeaders, getUnlockPrivate, fetchFn, pollIntervalMs = 60000 }`
  - Methods:
    - `async boot()` -> merges `./data/foundry-snapshot.json` + IndexedDB snapshot immediately (<50ms when cached) and emits `'update'`, starts visibility-aware polling + initial background delta sync.
    - `async syncNow({ manual = false } = {})` -> conditional `If-None-Match` GET on repos + public events, handles `304`, `200`, `403`/`429`/offline cleanly without throwing.
    - `getSnapshot()` -> current `FoundrySnapshotV1`
    - `getStatus()` -> `{ mode: 'LIVE DELTA // ETAG 304' | 'LIVE FETCH // 200' | 'SNAPSHOT CACHE' | 'SYNCING...', badgeTier: 'online' | 'hot' | 'active' | 'cached', lastCheckedAt, lastError, rateLimit: { limit, remaining, resetAt, used } }`
    - `setOptions(patch)`
    - `destroy()`
  - Emits `CustomEvent('update', { detail: { snapshot, status } })` and `CustomEvent('status', { detail: status })`.

### `./src/vault/cookie-vault.js`
- `export const VAULT_KEY = 'krunked-cookie-vault-v1';`
- `export const VAULT_IDB_NAME = 'krunked_vault_v1';`
- `export const COOKIE_MAX_BYTES = 3800;`
- `export const DEFAULT_VAULT_STATE = { ... }`
- `export function encodeShadowCookiePayload(state)` -> `string` (strictly `< 3800` bytes)
- `export function decodeShadowCookiePayload(encoded)` -> `object | null`
- `export function createCookieVault(envOverrides = {})` -> controller object:
  - `async init()` -> runs `reconcile()` and returns state
  - `async reconcile()` -> reads Store A (`localStorage`), Store B (`IndexedDB`), Store C (`document.cookie`), picks highest valid `rev`/`updatedAt`, heals all missing/stale stores symmetrically, returns `{ state, healedFrom, repairedStores }`
  - `getState()` -> deep-cloned current state
  - `async update(mutatorFn)` -> increments `rev`, sets `updatedAt = Date.now()`, writes all 3 stores, notifies subscribers
  - `async setPreference(key, value)`
  - `async togglePin(slug)`
  - `async toggleHide(slug)`
  - `async setCuration(slug, patch)`
  - `async resetCuration(slug)`
  - `async importState(statePatch)`
  - `subscribe(listener)` -> unsubscribe fn
  - `getDiagnostics()` -> `{ rev, updatedAt, cookieBytes, storeAOk, storeBOk, storeCOk, lastHealedFrom, lastRepairedStores }`
- `export const vault = createCookieVault();`

### `./src/vault/pat-vault.js`
- `export const PAT_STORAGE_KEY = 'krunked-local-pat-v1';`
- `export function assertGitHubApiOrigin(rawUrl)` -> `URL` (throws `Error` unless `https:` AND `origin === 'https://api.github.com'`)
- `export function getAuthHeadersForUrl(rawUrl, patOverride = null)` -> `{ Authorization: 'Bearer ...' }` ONLY if valid PAT exists and `rawUrl` origin is `https://api.github.com`, otherwise `{}`
- `export async function savePat(rawToken)` -> `{ saved: boolean, maskedHint: string }` (never logs token)
- `export function getPatStatus()` -> `{ configured: boolean, maskedHint: string }`
- `export function loadRawPatForInternalSync()` -> `string | null`
- `export async function wipePat()` -> `void`

### `./src/vault/config-io.js`
- `export function exportDeckConfigJson(vaultState)` -> `string` (pretty JSON `KrunkedDeckConfigV1`, guaranteed stripped of any PAT keys)
- `export function parseAndValidateDeckConfigJson(jsonText)` -> `{ state }` (validates schema, strips unknown/PAT keys, sanitizes URLs & strings, rejects malformed JSON)
- `export function downloadDeckConfig(vaultState)` -> `void`
- `export async function importDeckConfigFromFile(file)` -> `Promise<object>`

### `./src/graphics/qr-svg.js`
- `export function encodeQrMatrix(text, options = { ecLevel: 'M' })` -> `{ version, size, ecLevel, modules: Uint8Array[] }` (genuine ISO/IEC 18004 byte-mode QR encoder with GF(256) Reed-Solomon, finder/timing/alignment patterns, 8-mask penalty scoring, BCH format & version info)
- `export function renderQrSvgString(text, options = {})` -> `string` (crisp quiet-zone SVG markup)
- `export function mountQrSvg(containerEl, text, options = {})` -> `SVGElement`

### `./src/graphics/swiss-emblem.js`
- `export function fnv1a32(str)` -> `number` (unsigned 32-bit FNV-1a hash)
- `export function renderSwissEmblemSvg(slug, options = {})` -> `string` (deterministic geometric Swiss-grid vector emblem)
- `export function createSwissEmblemElement(slug, options = {})` -> `SVGElement`

### `./src/graphics/sparkline.js`
- `export function renderSparklineSvg(counts30d, options = {})` -> `string`
- `export function mountSparkline(containerEl, counts30d, options = {})` -> `SVGElement`

### `./src/graphics/chrono-pulse.js`
- `export function mountChronoPulse(containerEl, options = {})` -> `{ update({ days90, activeWindow }), destroy() }`
  - `options`: `{ days90, activeWindow, onHoverDay, onSelectWindow, onTickSound }`
  - Renders 90 daily thermal bars inside a crisp SVG/Canvas strip, hovering displays floating telemetry tooltip (date, commit total, active slugs) and emits `onHoverDay(dayOrNull)`, clicking a bar or dragging locks `[startIdx, endIdx]` sprint window and calls `onSelectWindow({ startDate, endDate, slugs } | null)`.

### `./src/graphics/film-grain.js`
- `export function mountFilmGrain(rootEl)` -> `HTMLElement` (injects fixed pointer-events-none 2.5% opacity monochrome SVG `feTurbulence` overlay)

### `./src/audio/micro-foley.js`
- `export function createMicroFoley()` -> `{ tick(), click(), latch(), relay(), setMuted(muted), isMuted(), dispose() }`
- `export const foley = createMicroFoley();`

---

## 4. PWA & GitHub Workflows Contract

- **`./manifest.json`**:
  - `"name": "KRUNKED // DECK — Live App Launchpad & Telemetry"`
  - `"short_name": "KRUNKED DECK"`
  - `"description": "Live App Launchpad, Sub-App Portal & Real-Time GitHub Telemetry Surface for krunked-fpv."`
  - `"display": "standalone"`
  - `"background_color": "#08090B"`, `"theme_color": "#08090B"`
  - `"start_url": "./"`, `"scope": "./"`
  - `"icons"`: `icon-192.png` (`192x192`, `image/png`, `any maskable`) and `icon-512.png` (`512x512`, `image/png`, `any maskable`)
- **`./sw.js`**:
  - `const KRUNKED_SW_CACHE_V1 = 'krunked-sw-cache-v1';`
  - Install precaches `./`, `./index.html`, `./manifest.json`, `./data/foundry-snapshot.json`, `./assets/icons/icon-192.png`, `./assets/icons/icon-512.png`, `./assets/icons/favicon.svg`, `./src/app.js`, and core styles/modules.
  - Activate deletes caches !== `KRUNKED_SW_CACHE_V1` and calls `self.clients.claim()`.
  - Fetch strictly ignores non-GET, non-same-origin (`api.github.com`, etc.), and any path outside KRUNKED // DECK's own relative app-shell allowlist (`''`, `'index.html'`, `'manifest.json'`, `'sw.js'`, `'src/'`, `'data/'`, `'assets/'`). Uses network-first for HTML/JS/CSS/manifest and stale-while-revalidate for `./data/foundry-snapshot.json` and `./assets/icons/*`.
- **PNG Icons**: `icon-192.png` (`192x192`), `icon-512.png` (`512x512`), `apple-touch-icon.png` (`180x180`), all valid PNG binaries starting `89 50 4E 47 0D 0A 1A 0A`.

---

## 5. CSS Custom Properties & Semantic Class Contract

### Theme Variables (`tokens.css`)
- Root / `[data-theme="obsidian"]`:
  - `--bg-chassis: #08090B;`
  - `--bg-surface: #101216;`
  - `--bg-elevated: #161A21;`
  - `--bg-inset: #0B0D11;`
  - `--ink-primary: #F3F5F8;`
  - `--ink-secondary: #B4BCC9;`
  - `--ink-muted: #8590A2;`
  - `--border-hairline: rgba(255, 255, 255, 0.07);`
  - `--border-strong: rgba(255, 255, 255, 0.14);`
  - `--inset-highlight: rgba(255, 255, 255, 0.13);`
  - `--led-hot: #FF4F00;`
  - `--led-online: #10B981;`
  - `--led-active: #F59E0B;`
  - `--cursor-x: 50%;` `--cursor-y: 25%;`
  - `--ease-snappy: cubic-bezier(0.16, 1, 0.3, 1);` `--t-snappy: 140ms;`
- `[data-theme="daylight"]`:
  - `--bg-chassis: #ECEAE4;`
  - `--bg-surface: #F6F5F0;`
  - `--bg-elevated: #FFFFFF;`
  - `--bg-inset: #E2DFD7;`
  - `--ink-primary: #141518;`
  - `--ink-secondary: #3A404B;`
  - `--ink-muted: #5A6270;`
  - `--border-hairline: rgba(20, 21, 24, 0.11);`
  - `--border-strong: rgba(20, 21, 24, 0.22);`
  - `--inset-highlight: rgba(255, 255, 255, 0.75);`

### Exact Semantic Layout & Component Classes
- **Shell**: `.deck-root`, `.film-grain-overlay`, `.deck-main`, `.sr-only`
- **Top Bar**: `.top-bar`, `.top-bar__brand`, `.brand-mark`, `.brand-title`, `.sync-pill`, `.sync-pill__led`, `.top-bar__chrono`, `.chrono-strip`, `.chrono-tooltip`, `.chrono-clear-btn`, `.top-bar__telemetry`, `.metric-readout`, `.metric-readout__label`, `.metric-readout__value`, `.top-bar__actions`, `.view-switcher`, `.view-switcher__btn`, `.is-active`, `.hw-btn`, `.hw-btn--primary`, `.hw-btn--ghost`, `.hw-btn--install`, `.install-wrap`
- **Hero Stage**: `.hero-forge`, `.hero-forge__header`, `.hero-forge__eyebrow`, `.hero-forge__rail`, `.rail-slot`, `.hero-forge__grid`, `.hero-forge__bezel`, `.bezel-toolbar`, `.bezel-viewport`, `.bezel-viewport--mobile`, `.bezel-iframe`, `.bezel-blueprint`, `.bezel-guard-notice`, `.hero-forge__meta`, `.hero-forge__title`, `.hero-forge__desc`, `.hero-forge__telemetry`, `.hero-forge__actions`, `.commit-chip`
- **Filter Rail & Bento Grid**: `.filter-rail`, `.filter-pills`, `.filter-pill`, `.filter-pill__count`, `.sort-select`, `.bento-grid`, `.bento-card`, `.bento-card--wide`, `.bento-card--focused`, `.bento-card__sheen`, `.bento-card__top`, `.bento-card__icon`, `.bento-card__title`, `.bento-card__desc`, `.bento-card__meta`, `.bento-card__footer`, `.bento-card__actions`, `.icon-btn`, `.led-badge`, `.led-badge--hot`, `.led-badge--active`, `.led-badge--online`, `.led-badge--private`, `.led-dot`, `.chip`
- **Secondary Views**: `.matrix-view`, `.matrix-toolbar`, `.matrix-table-wrap`, `.matrix-table`, `.matrix-row`, `.matrix-row--selected`, `.surface-tag`, `.split-view`, `.split-view__rail`, `.split-view__pane`
- **Drawer, Palette & Modals**: `.drawer-backdrop`, `.inspector-drawer`, `.drawer-section`, `.commit-list`, `.commit-row`, `.lang-bar`, `.lang-bar__seg`, `.lang-legend`, `.curation-form`, `.field-group`, `.hw-input`, `.hw-select`, `.palette-backdrop`, `.command-palette`, `.palette-input-row`, `.palette-results`, `.palette-item`, `.palette-item--active`, `.keycap`, `.modal-backdrop`, `.hw-modal`, `.qr-stage`, `.diag-grid`
