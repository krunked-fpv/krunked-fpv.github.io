# KRUNKED // FORGE DECK V2 — Specification

Locked cross-module contracts, design tokens, schemas, security invariants, and acceptance criteria for **KRUNKED // FORGE DECK V2** (`Vite + React 19 + TypeScript strict + Tailwind v4 + Framer Motion + Zustand`). Every specialist must adhere verbatim.

---

## 1. Canonical Constants & Security Invariants

Defined in `src/config/site.ts`:
- `GITHUB_USER = 'krunked-fpv'`
- `PAGES_ORIGIN = 'https://krunked-fpv.github.io'`
- `API_ORIGIN = 'https://api.github.com'`
- `THEME_COLORS = { obsidian: '#08090B', daylight: '#ECEAE4' }` (`THEME_COLOR = THEME_COLORS.obsidian`)
- `SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }`
- `STORAGE_NS = 'forge-deck'`
- `TELEMETRY_IDB_NAME = 'krunked_deck_telemetry_v2'`
- `VAULT_KEY = 'krunked-cookie-vault-v1'`
- `VAULT_IDB_NAME = 'krunked_vault_v1'`
- `VAULT_COOKIE_MAX_BYTES = 3800`
- `PAT_STORAGE_KEY = 'krunked-local-pat-v1'`
- `DECK_CONFIG_SCHEMA = 'KrunkedDeckConfigV2'`

### Hard Invariants (Zero Exceptions)
1. **Zero Emojis / Pictographs in UI & Data**: No Unicode emojis (`\p{Extended_Pictographic}`, regional flags, keycap `\u20E3`, variation selector `\uFE0F`, ZWJ sequences, `★` U+2605) in any component, config, snapshot, or rendered DOM text. Use Lucide icons for symbols; preserve keyboard glyphs (`⌘`, `⇧`, `↵`, `↑`, `↓`, `←`, `→`) strictly inside `<Kbd>` keycaps.
2. **Zero Purple / Violet / Magenta**: No purple/violet CSS tokens or gradients anywhere; procedural OKLCH palettes strictly remap hues in `245°..340°` outside that band across `key`, `counter`, and `prism` spectral dispersion.
3. **WCAG AA Contrast (`>= 4.5:1`)**: Every readable text/label token (including muted eyebrows, timestamps, axis ticks, and LED badge inks) must achieve `>= 4.5:1` contrast against its surface in **both** Anodized Obsidian and Braun Daylight.
4. **XSS & URL Sanitization**: All GitHub API strings, HTML-probed titles/descriptions, commit messages, and user curation inputs pass through `stripHtmlAndEmojis()` (strips `<script>`/`<style>`/tags, decodes HTML entities, strips newly revealed tags and emojis) and `sanitizeHttpUrl()` (rejects `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, control characters, and embedded userinfo; allows `http:`/`https:` only). README HTML uses DOMPurify forbidding `script/style/iframe/form/input/object/embed` with post-sanitized `http(s)` links.
5. **Self-Iframe Recursion Guard & Iframe Sandbox**: `isSelfHostedPeekTarget(url, currentLocation, owner)` blocks framing `http(s)://<owner>.github.io/` root, `index.html`, the current `origin + pathname`, or any `project.isSelfDeck` repo, showing a safe architectural notice instead. All permitted Peek iframes MUST carry `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` and `allow="fullscreen; gamepad; autoplay"` (never `clipboard-write`, never unsandboxed).
6. **PAT Origin Firewall**: Every outbound GitHub API call (`ghFetch` and `fetchRateLimit`) calls `assertGitHubApiOrigin(url)` + `getAuthHeadersForUrl(url)` enforcing `url.protocol === 'https:' && url.origin === 'https://api.github.com'` with zero embedded credentials. PAT is NEVER written to cookies, vault state, IndexedDB vault, `KrunkedDeckConfigV2` exports, or `console.*`.
7. **`?sync=off` Silence & Zero CORS Console Errors**: When `?sync=off` is active, ZERO outbound network requests may fire (including boot sync, Peek `TelemetryBrief` commits/languages, Peek `ReadmeView`, and sub-app HTML probes). On live loads from non-`PAGES_ORIGIN` origins (e.g., `127.0.0.1` / `localhost`), client-side cross-origin sub-app HTML probes are skipped (relying on Tier-1 `SnapshotV2.probes`) so zero CORS console errors occur.

---

## 2. Dual Hardware Theme System & CSS Token Contract (`src/index.css`)

Theme state is controlled via `document.documentElement.dataset.theme = 'obsidian' | 'daylight'`, synchronized with `vault.prefs.theme` and `<meta id="meta-theme-color" name="theme-color">`, with a synchronous pre-paint inline bootstrap script in `index.html` for **zero FOUC** and 140ms View Transitions morph (disabled under `prefers-reduced-motion`).

### 2.1 Token Matrix

| Token | Anodized Obsidian (`:root, [data-theme="obsidian"]`) | Braun Daylight (`[data-theme="daylight"]`) | Role |
|---|---|---|---|
| `--bg-chassis` | `#08090B` | `#ECEAE4` | Page ground (`theme-color`) |
| `--bg-inset` | `#0C0E12` | `#E1DED6` | Recessed telemetry racks, wells, inputs |
| `--bg-surface` | `#111419` | `#F7F6F2` | Cards, panels, drawers |
| `--bg-elevated` | `#181C24` | `#FFFFFF` | Modals, popovers, active controls |
| `--bg-bar` | `rgba(8, 9, 11, 0.84)` | `rgba(236, 234, 228, 0.86)` | Frosted TopBar / FilterBar / StatusBar |
| `--bezel-frame` | `#06070A` | `#111419` | Hardware iframe / preview bezel |
| `--ink-primary` | `#F3F5F8` | `#14161A` | Primary text |
| `--ink-secondary` | `#B4BCC9` | `#3B414D` | Secondary copy |
| `--ink-muted` | `#848F9E` (5.4:1) | `#596170` (5.6:1) | Eyebrows, timestamps, axis ticks (AA safe) |
| `--hairline` | `rgba(255, 255, 255, 0.08)` | `rgba(20, 22, 26, 0.11)` | Default 1px milled border |
| `--hairline-strong` | `rgba(255, 255, 255, 0.16)` | `rgba(20, 22, 26, 0.22)` | Hover/active 1px border |
| `--inset-highlight` | `rgba(255, 255, 255, 0.12)` | `rgba(255, 255, 255, 0.85)` | Top machined chamfer highlight |
| `--sheen-border` | `rgba(255, 255, 255, 0.42)` | `rgba(20, 22, 26, 0.34)` | Pointer-tracked specular ring |
| `--sheen-fill` | `rgba(255, 255, 255, 0.045)` | `rgba(20, 22, 26, 0.035)` | Subtle interior pointer sheen |
| `--surface-tint` | `rgba(255, 255, 255, 0.035)` | `rgba(20, 22, 26, 0.035)` | Chip/button resting fill |
| `--hover-tint` | `rgba(255, 255, 255, 0.055)` | `rgba(20, 22, 26, 0.05)` | Button/row hover fill |
| `--scrim` | `rgba(5, 6, 8, 0.78)` | `rgba(20, 22, 26, 0.42)` | Modal/drawer backdrop |
| `--grid-line` | `rgba(255, 255, 255, 0.035)` | `rgba(20, 22, 26, 0.055)` | Hero architectural micro-grid |
| `--keycap-shadow` | `rgba(0, 0, 0, 0.55)` | `rgba(20, 22, 26, 0.18)` | `<Kbd>` bottom bevel |
| `--grain-opacity` | `0.028` | `0.02` | Monochrome SVG film grain |
| `--led-hot` / `--led-hot-ink` / `--led-hot-soft` | `#FF4F00` / `#FF6E2E` / `rgba(255,79,0,0.13)` | `#FF4F00` / `#BD3800` / `rgba(255,79,0,0.11)` | Primary CTA, `<24h` fresh, focus ring |
| `--led-online` / `--led-online-ink` / `--led-online-soft` | `#10B981` / `#34D399` / `rgba(16,185,129,0.13)` | `#10B981` / `#047857` / `rgba(16,185,129,0.12)` | Live/synced, verified online, PWA |
| `--led-active` / `--led-active-ink` / `--led-active-soft` | `#F59E0B` / `#FBBF24` / `rgba(245,158,11,0.13)` | `#F59E0B` / `#9A5B00` / `rgba(245,158,11,0.14)` | Revalidating, `<7d` active, pinned |
| `--led-alarm` / `--led-alarm-ink` / `--led-alarm-soft` | `#EF4444` / `#F87171` / `rgba(239,68,68,0.13)` | `#EF4444` / `#B91C1C` / `rgba(239,68,68,0.11)` | Error, critical quota |
| `--heat-0` / `--heat-1` / `--heat-2` / `--heat-3` | `rgba(255,255,255,0.09)` / `#10B981` / `#F59E0B` / `#FF4F00` | `rgba(20,22,26,0.13)` / `#047857` / `#B45309` / `#D94100` | 90d Chrono-Pulse thermal bars |
| `--cover-scrim-end` | `rgba(8, 9, 11, 0.92)` | `rgba(247, 246, 242, 0.94)` | Bottom legibility gradient on CoverArt |
| `--badge-bg` / `--badge-border` | `rgba(8, 9, 11, 0.74)` / `rgba(255,255,255,0.14)` | `rgba(247, 246, 242, 0.86)` / `rgba(20,22,26,0.16)` | Badges overlaid on cover canvases |

Layout CSS variables: `--topbar-h: 56px`, `--filterbar-h: 52px`, `--statusbar-h: 36px`, `--ease-snap: cubic-bezier(0.16, 1, 0.3, 1)`, `--t-snap: 140ms`.

Tailwind v4 `@theme inline` exposes semantic utilities: `bg-chassis`, `bg-inset`, `bg-surface`, `bg-elevated`, `bg-bar`, `bg-tint`, `bg-hover`, `border-hairline`, `border-hairline-strong`, `text-ink`, `text-dim`, `text-mute`, `text-hot`, `text-hot-ink`, `text-phosphor`, `text-phosphor-ink`, `text-solar`, `text-solar-ink`, `text-alarm`, `text-alarm-ink` (plus legacy aliases `ob-950/900/800/700` -> chassis/surface/elevated/inset). Component authors MUST use semantic utilities — never hardcode `border-white/*`, `bg-white/*`, or dark hex literals.

---

## 3. Data & Domain Contracts (`src/types/github.ts`, `src/types/project.ts`)

### 3.1 `SnapshotV2` (`public/snapshot.json`)
Baked by zero-dependency `scripts/build-snapshot.mjs` (`MAX_CONCURRENCY=6`, `API_TIMEOUT_MS=10000`, `PROBE_TIMEOUT_MS=4500`, `MAX_HTML_BYTES=512KB`):
- `schemaVersion: 'SnapshotV2'`, `generatedAt`, `owner`, `sourceMode: 'live-github-bake' | 'preserved-cache' | 'offline-fallback'`
- `user`, `repos`, `events`, `commits` (up to 15 non-bot commits + `commits30d[30]` + `commits30dTotal` + `commits90dTotal` for every non-fork, non-archived repo)
- `languages: Record<string, Record<string, number>>` (byte maps per repo)
- `probes: Record<string, SnapshotProbe>` (verified HTTP status, soft-404 detection, sanitized title/subtitle/description, `themeColor`, `ogImage`, `iconUrl`, `isPwa`, `manifest`)
- `chronoPulse90d: ChronoDay[]` (exact 90 chronological UTC days `{ date: 'YYYY-MM-DD', count, repos[] }`, excluding `github-actions[bot]`, `dependabot[bot]`, `renovate[bot]`, and `[skip ci]` / `[ci skip]` automated commits)
- `totals: { totalRepos, liveApps, verifiedPages, deadPages, commits30d, commits90d, lastPushAt }`
- Resilience: preserves and re-sanitizes prior valid `public/snapshot.json` (`preserved-cache`) or generates a valid 90-day `offline-fallback` if offline/rate-limited.

### 3.2 Launch URL Resolution & Live Verification (`resolveLaunch`)
1. User curation `vault.curation[slug].launchUrl` (strictly sanitized `http(s)`).
2. Static `PROJECT_OVERRIDES[slug].launchUrl`.
3. `repo.homepage` (strictly sanitized `http(s)`).
4. `repo.has_pages`: candidate `https://<user>.github.io/<repo>/` (or root `https://<user>.github.io/` for `<user>.github.io`).
5. **Dead Pages Demotion**: If no explicit override/curation `launchUrl` was set AND `probe?.isNotFound === true` (or `probe?.liveVerified === false`), demote the repo to `kind = 'code'`, `launchUrl = null`, `liveVerified = false` so 404 / GitHub `"Site not found"` repos NEVER render as broken live tiles or broken Peek iframes.

### 3.3 Classification, Freshness & Spotlight Eligibility
- **Category**: `vault.curation.category` -> `PROJECT_OVERRIDES.category` -> keyword heuristic (`Game`, `Hardware/Sky`, `Audio/Vinyl`, `Automation`) -> `App` (live) | `Utility` (code, `<200 KB`) | `Engine` (code).
- **Freshness** (`lastActivityAt = max(pushed_at, latest non-bot PushEvent)`):
  - `< 24h`: `tier = 'fresh'`, LED `--led-hot` (`#FF4F00`), `SHIPPED <delta> AGO`, pulse ON.
  - `< 72h`: `tier = 'active'`, LED `--led-active` (`#F59E0B`), `UPDATED <delta> AGO`, pulse ON.
  - `< 7d`: `tier = 'active'`, LED `--led-active`, `UPDATED <delta> AGO`, pulse OFF.
  - `>= 7d`: `tier = 'idle'`, muted LED, `IDLE <delta>`, pulse OFF.
  - `FreshnessBadge` recomputes pulse dynamically from `useNow()`.
- **Spotlight Eligibility (`spotlightOf`)**: Never place empty `sizeKb === 0` non-live repos ahead of real builds. Rank `featured` first, then `kind === 'live'` builds by recency/velocity, using non-empty `code` repos (`sizeKb > 0`) only as fallback if fewer than `SPOTLIGHT_COUNT` (5) live builds exist.
- **UTC Activity Buckets**: All `sparkline` (30 UTC days) and `chronoPulse90d` (90 UTC days) calculations use strict `Date.UTC` `YYYY-MM-DD` keys (zero local timezone / DST drift).

---

## 4. Vault V2 & Local PAT Security (`src/types/vault.ts`, `src/vault/*`)

### 4.1 Triple-Redundant Bidirectional Auto-Healing (`src/vault/cookieVault.ts`)
- **Stores**:
  - **Store A**: `localStorage['krunked-cookie-vault-v1']` (plain JSON so `index.html` pre-paint script reads `prefs.theme` with zero FOUC).
  - **Store B**: IndexedDB `krunked_vault_v1` (object store `'state'`, key `'root'`).
  - **Store C**: Shadow Cookie `krunked-cookie-vault-v1` (`Path=/; Max-Age=31536000; SameSite=Lax`, plus `; Secure` on HTTPS).
- **Schema (`VaultData`)**: `{ v: 2, rev, updatedAt, pins[], prefs: { view, sort, filter, theme, soundEnabled }, curation: Record<slug, CurationOverride>, seen: Record<repo, sha> }`. Transparently migrates V1 `{ v: 1 }` payloads on read.
- **Shadow Cookie Wire Format & Ceiling**: `v2.<base64url>.<fnv1a32hex>` verified on decode (plus legacy V1 URI-JSON decode). Enforces `< 3800` UTF-8 bytes via 4-stage progressive shedding: `(1)` drop `seen`, `(2)` drop `curation` taglines/secondary fields, `(3)` prune oldest `curation` entries, `(4)` tail-truncate `pins`.
- **Reconciliation**: Winner is highest `rev` -> highest `updatedAt` -> tie-break `localStorage > indexedDB > cookie`. Any missing, corrupt, or stale mirror is healed bidirectionally and reported via `getVaultStatus(): VaultStorageStatus`.
- **APIs**: `loadVaultSync()` (sync LS+Cookie boot for Zustand), `reconcileVault()` (async 3-store heal on boot), `saveVault(data)` (monotonic `rev++`, serialized queue), `getVaultStatus()`, `subscribeVault(fn)`, `subscribeVaultStatus(fn)`, `createCookieVault(envOverrides?)`.

### 4.2 Portable Config Export / Import (`src/vault/configIo.ts`)
- Schema `KrunkedDeckConfigV2`: `{ schema: 'KrunkedDeckConfigV2', exportedAt, state: VaultData }`.
- `exportDeckConfigJson(state)` uses a strict allowlist (guaranteed zero PAT/secret fields).
- `parseDeckConfigJson(text)` enforces 2 MB ceiling, strict `schema === 'KrunkedDeckConfigV2'`, blocks `__proto__`/`constructor`/`prototype`, strips unknown/PAT keys, sanitizes strings/URLs/emojis.
- `downloadDeckConfig(state)` defers `URL.revokeObjectURL`; `importDeckConfigFromFile(file)` validates size & schema.

### 4.3 Local PAT Firewall (`src/vault/patStore.ts`)
- Storage key `krunked-local-pat-v1` (migrates/removes legacy `forge-deck:pat`). `'session'` -> `sessionStorage` only; `'device'` -> `localStorage` only. Rejects whitespace/control chars (header-injection guard).
- Exports `assertGitHubApiOrigin(url)`, `getAuthHeadersForUrl(url, patOverride?)`, `setPat(token, scope)`, `getPat()`, `patScope()`, `getPatStatus()`, `clearPat()`.

---

## 5. Audio Micro-Foley Contract (`src/types/audio.ts`, `src/audio/*`)

- **Default Muted**: `vault.prefs.soundEnabled` defaults to `false`. Zero `AudioContext` allocation on import, while muted, or on passive `setMuted(false)` hydration — allocated lazily ONLY when `!muted` AND triggered inside a user gesture while `document.visibilityState !== 'hidden'`.
- **5 Hardware Cues (`FoleyCue`)**: `tick` (2ms 3.4kHz bandpass, 8ms debounce), `click` (3ms 2.6kHz + triangle 520->140Hz), `latch` (2-stage pre-catch + 9ms lock detent), `relay` (weighted armature + 14ms contact snap), `sync` (restrained dual-pulse 880->660Hz + 1320->990Hz).
- **Limiter & Hygiene**: `DynamicsCompressorNode` (-18dB, 12:1, 1ms/40ms) -> `masterGain <= 0.12` (default `0.11`), smooth zero-click envelopes, `MAX_ACTIVE_VOICES = 10` FIFO eviction, `onended` disconnect, `dispose()` teardown. Under `prefers-reduced-motion: reduce`, suppress `tick`/`sync` while honoring deliberate opt-in `click`/`latch`/`relay`.
- **React Integration**: `useFoleySync()` mounted once in `App.tsx`; `useFoley()` hook for Claire and Devon (safe no-op in jsdom/SSR, zero try/catch boilerplate).

---

## 6. Graphics, Viz & Interactive UI Contracts

### 6.1 Dual-Theme Procedural Art & Viz (`src/art/*`, `src/components/art/*`, `src/components/viz/*`, `src/components/hero/HeatStrip.tsx`)
- **Procedural Covers**: 5 gallery-grade canvas styles (`topo`, `orbital`, `synthwave`, `prism`, `groove`) with shared `drafting.ts` micro-grid/fiducials/grain and dual-theme `makePalette(rawHue, theme)` (`ArtTheme = 'obsidian' | 'daylight'`), keyed in LRU `coverCache` (`MAX=96`) including `theme`. Render eagerly or with generous `400px` pre-load margin (zero blank black off-screen cards, zero `ReadPixels` GPU stalls) and apply `--cover-scrim-end` bottom scrim for AA title legibility.
- **Interactive 90d Chrono-Pulse (`HeatStrip.tsx` + `src/art/chronoPulse.ts`)**: Responsive SVG (`viewBox="0 0 360 44"`) over 90 UTC `ChronoDay`s with `-90D/-60D/-30D/NOW` ticks, thermal bars (`--heat-0..3`), momentum polyline, pointer hover tooltip (date, count, active slugs, clamped within viewport at `375px`), click/drag sprint-window selection (`ChronoWindow`), Clear control, full keyboard scrubbing (`ArrowLeft/Right`, `Shift+Arrow`, `Enter/Space`, `Escape`), and optional `tick` foley callback. Connected directly to `useDeck` (`chronoWindow`, `setChronoWindow`).
- **30-Day Sparkline (`Sparkline.tsx`)**: Monotone cubic Hermite (Fritsch–Carlson) curve (zero baseline overshoot), theme-safe baseline, area fill, active endpoint dot.
- **ISO/IEC 18004 QR SVG (`src/art/qr.ts` + `QrCode.tsx`)**: Zero-dep byte-mode V1–V14 encoder with GF(256) `0x11D` Reed-Solomon ECC, 8-mask penalty scoring, horizontal RLE path, mandatory 4-module quiet zone, and high-contrast light plate (`#FFFFFF` / `#090B0F`) scannable in both themes.
- **Swiss Emblem (`src/art/swissEmblem.ts` + `SwissEmblem.tsx`)**: FNV-1a deterministic 8-archetype architectural SVG emblem.

### 6.2 Layout, Viewport Budgets & Interactive Surfaces
- **Desktop (`1440x900`) Above-the-Fold Budget**:
  - `TopBar`: `56px` — machined `BrandEmblem`, `KRUNKED // FORGE DECK`, clickable `LiveClock` (24h <-> stopwatch, dblclick reset), clickable `.sync-pill`, conditional PWA Install pill (`usePwaInstall`), `⌘K` palette button, Theme toggle, Audio foley mute toggle, `ForceSyncButton`, `Settings`.
  - `HeroBand`: **`<= 270px` tall**. Tight editorial display (`clamp(32px, 5.2vw, 64px)`), single consistent visible repo count (never contradicting `StatCounter`), concise 1-line dispatch, right-hand recessed telemetry rack (`bg-inset`) with 3 LED-keyed `StatCounter`s (`Live Builds`, `30d Commits` / `Pushes 7d`, `Tracked Repos`) above the 90d Chrono-Pulse.
  - **Lead Spotlight Tile**: Title, tagline/commit ticker, and `[ LAUNCH ]` / `[ LIVE PEEK ]` / `[ QR ]` controls MUST be visible above the `900px` fold!
- **Mobile (`375x812`) Budget**:
  - TopBar brand renders cleanly (`KRUNKED // DECK` or emblem + `KRUNKED`, never trailing `KRUNKED //`).
  - Total sticky/fixed vertical chrome during scroll: **`<= 140px`** (keep `FilterBar` non-sticky on `<768px` or single-row compact so `TopBar 56px + StatusBar 36px = 92px`).
  - `FilterBar` horizontal pill rail uses CSS scroll-fade edges (`mask-image`) so pills never clip abruptly mid-character.
  - `SandboxFrame` defaults viewport to `'mobile'` (`390x844`) on `<768px` screens.
- **4-Tab PeekDrawer (`PeekTab = 'sandbox' | 'brief' | 'qr' | 'curate'`)**:
  - `SANDBOX` (default for live apps): self-iframe guarded, sandboxed `<iframe>`, URL bezel + Copy URL, Desktop/Mobile switch with scale readout.
  - `BRIEF & README` (default for code repos): language composition bar, 30d sparkline/velocity, CI Actions link, clone command copy, sanitized README (gated on `!syncDisabled()`).
  - `QR HANDOFF`: `<QrCode />` + Copy URL + Download SVG.
  - `CURATE`: local per-project override form (`displayName`, `tagline`, `category`, `accent`, `artStyle`, `hidden`) -> `vault.curation[slug]` with Reset.
  - Mobile drag-to-close bound via `useDragControls()` strictly on the top grabber bar; full `Tab` focus trap + `Escape` close.
- **3-Tab SettingsModal (`SettingsTab = 'prefs' | 'vault' | 'diagnostics'`)**:
  - `PREFERENCES`: Theme switcher (Obsidian / Braun Daylight), Audio micro-foley toggle + hardware test button.
  - `VAULT & CONFIG`: Triple-store mirror indicators (`localStorage` / `IndexedDB` / `Shadow Cookie`), cookie byte meter (`<3800B`), monotonic `rev`, PAT-free `KrunkedDeckConfigV2` Export/Import, 2-step Reset.
  - `API & DIAGNOSTICS`: Rate-limit bar, sync phase & ETag diagnostics, cache purge, PAT config (`session` vs `device`) with `https://api.github.com ONLY` firewall status.
- **Persistent Micro-Actions & Keyboard Map**:
  - Cards expose persistent subtle hardware actions (`Peek`, `QR` for live apps, `Source`, `Pin`) — never hover-hidden `opacity-0`.
  - `FlagshipDock`: numbered hardware cartridges (`01`..`0N`) with keyboard/button `←`/`→` reorder + isolated drag handle + Peek + Unpin.
  - Global hotkeys (modal/input guarded): `⌘/Ctrl+K` or `/` Palette, `1`/`2`/`3` Views (`bento`/`grid`/`matrix`), `T` Theme, `M` Audio Mute, `R` Force Sync, `G` Settings, `Esc` Close; spatial grid nav arrows + `Enter` Launch, `I` Peek, `P` Pin, `Q` QR; hash deep-links `#peek/<slug>`, `#qr/<slug>`, `#palette`, `#settings`.

---

## 7. PWA, Icons & CI Contracts

- **Relative URLs**: `vite.config.ts` uses `base: './'` so `dist/` runs cleanly at `/` and `/<subpath>/`.
- **Icons (`scripts/generate-icons.mjs`)**: Pure-Node 4×4 supersampled PNG rasterizer producing V2 anodized Obsidian chassis + angular `#F3F5F8` K-monogram + `#FF4F00` hardware LED + telemetry bars: `favicon-32.png`, `apple-touch-icon.png` (180 opaque), `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, plus `public/favicon.svg`. All PNGs must verify `89 50 4E 47 0D 0A 1A 0A` signature and exact IHDR dimensions.
- **Manifest V2 (`manifest.webmanifest`)**: `display: 'standalone'`, `display_override: ['window-controls-overlay', 'standalone']`, separate `any` and `maskable` icon entries, shortcuts to `./#palette` and `./#settings`, relative `./` URLs.
- **Service Worker (`vite/pwaPlugin.ts` & `src/domain/swScope.ts`)**:
  - Content-hashed cache `forge-deck-v2-<hash>`; `activate` purges stale `forge-deck-*` AND legacy V0 `krunked-sw-cache-*` (never sibling app caches); supports `SKIP_WAITING`.
  - Strict scope isolation (normalized trailing `/`): ignores non-GET, cross-origin (`api.github.com`), and all sibling `/<repo>/*` paths.
  - Strategies: navigation (`scope` / `index.html`) -> `network-first` (fallback cached shell -> `503 Offline`); `snapshot.json` & `manifest.webmanifest` -> `network-first` (offline cold-boot resilience); `assets/*` -> `cache-first` (precache JS/CSS + `latin` `.woff2` only); `favicon.svg` & `icons/*` -> `stale-while-revalidate`.
- **GitHub Actions CI (`.github/workflows/deploy.yml` & `ci.yml`)**:
  - Two-job `build -> deploy` (`concurrency: { group: pages, cancel-in-progress: false }`), `actions/configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`.
  - Ephemeral build-time `npm run snapshot` on push + `workflow_dispatch` + schedule (`17 */3 * * *`) — zero cron git commits polluting history or inflating telemetry!
  - Mandatory gates in both `ci.yml` and `deploy.yml`: `npm run typecheck`, `npm test`, `npm run build`, and automated `dist/` integrity check (`./` relative URLs, manifest, `sw.js`, `.nojekyll`, `snapshot.json`, valid PNG headers).

---

## 8. Phase 3 Acceptance Criteria

1. `npm run verify` (`typecheck` + `test` + `build`) passes with zero errors and zero `TODO/FIXME` markers.
2. Comprehensive Vitest suites green across `art.test.ts` (dual-theme, non-purple, QR matrix/RS/SVG, Swiss emblem, ChronoPulse), `audio.test.ts` (muted default, lazy AudioContext, limiter, 5 cues, disconnect/dispose), `domain.test.ts` (XSS/emoji sanitization, 404 Pages demotion, self-iframe guard, UTC buckets, SW scope, fuzzy search), `ghClient.test.ts` (304 zero-quota, PAT firewall, 403/429 backoff, offline, `?sync=off`), `vault.test.ts` (triple-store IDB+LS+Cookie healing, `<3800B` progressive shedding, `KrunkedDeckConfigV2` PAT-free I/O, PAT firewall), and `v2Audit.test.ts` (SnapshotV2 schema/bot-exclusion, PNG signatures/IHDR, `dist/` relative URLs, zero emojis/purple audit).
3. Live browser verification at `1440x900` and `375x812` in **both Obsidian and Braun Daylight**:
   - Zero console errors, zero `pageerror`, zero failed/CORS/404 requests under `?sync=off` (including Peek on README-less repos) and live cold boot (`<= 3` unauthenticated core calls).
   - Zero horizontal overflow; `HeroBand <= 270px` with Lead Spotlight title + actions above the `900px` fold; mobile sticky chrome `<= 140px`; WCAG AA `>= 4.5:1` across all text/label tokens.
   - Verified dual-theme toggle persistence (zero FOUC on reload), interactive 90d Chrono-Pulse filtering, 4-tab PeekDrawer (sandboxed iframe + QR SVG + live local curation), CommandPalette fuzzy actions, and Settings triple-store Vault Diagnostics.
