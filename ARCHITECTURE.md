# ARCHITECTURE — KRUNKED // DECK

## 1. System Overview & Zero-Backend Constraint
KRUNKED // DECK is a 100% client-side, zero-backend operational App Launchpad, automated sub-app manifest harvester, 90-day Chrono-Pulse GitHub telemetry surface, and installable standalone WebAPK PWA for `krunked-fpv`.

- **Runtime Stack**: Semantic HTML5, Modern CSS custom properties, and native browser ES Modules (`type="module"`). Zero runtime frameworks, zero bundler steps, zero npm runtime dependencies (`./index.html` runs directly over any static HTTP server or GitHub Pages).
- **Subpath `./` Portability**: Every internal script import, stylesheet link, snapshot fetch (`./data/foundry-snapshot.json`), icon asset (`./assets/icons/*`), manifest link (`./manifest.json`), and Service Worker registration (`./sw.js` with `{ scope: './' }`) uses strictly relative `./` paths. The identical static artifact deploys without modification at both `https://krunked-fpv.github.io/` and `https://krunked-fpv.github.io/<repo-slug>/`.

## 2. Three-Tier Telemetry & Persistence Architecture

```
+-------------------------------------------------------------------------+
| TIER 1: CI Snapshot Baker (GitHub Actions every 20m + on push)          |
|   scripts/build-snapshot.mjs -> data/foundry-snapshot.json              |
|   - Harvests krunked-fpv repos, commits (excluding bot skip-ci commits),|
|     language bytes, and live GitHub Pages HTML + manifest.json metadata |
+-------------------------------------------------------------------------+
                                    |
                          <50ms cold-boot fetch
                                    v
+-------------------------------------------------------------------------+
| TIER 2: Client ETag Delta Engine (src/telemetry/*)                      |
|   - Concurrent boot: ./data/foundry-snapshot.json + IDB telemetry store |
|   - Background conditional GET api.github.com with If-None-Match ETag     |
|   - HTTP 304 Not Modified -> 0 API quota consumed (LIVE DELTA // 304)   |
|   - HTTP 200 OK -> merges PushEvents, probes newly pushed Pages apps    |
|   - HTTP 403 / 429 / Offline -> silent fallback to SNAPSHOT CACHE       |
+-------------------------------------------------------------------------+
                                    |
                    User curation, pins, hidden, theme, audio
                                    v
+-------------------------------------------------------------------------+
| TIER 3: Triple-Redundant Auto-Healing Vault (src/vault/*)               |
|   Store A: localStorage['krunked-cookie-vault-v1']                      |
|   Store B: IndexedDB 'krunked_vault_v1' (objectStore: 'state')          |
|   Store C: Shadow Cookie 'krunked-cookie-vault-v1' (<3800B URI-safe)    |
|   - Reconciles highest monotonic rev/updatedAt across A, B, and C       |
|   - Wiping A + B auto-heals 100% from Shadow Cookie C and refills A + B |
|   - Clearing C regenerates Shadow Cookie C from primary stores A / B    |
+-------------------------------------------------------------------------+
```

## 3. Security & Isolation Boundaries

### 3.1 Device-Local PAT Firewall (`src/vault/pat-vault.js`)
- Optional user-supplied read-only GitHub PAT resides exclusively in `localStorage['krunked-local-pat-v1']` (mirrored only inside local IndexedDB `krunked_vault_v1` private-token key if needed, never cookies).
- **Never** serialized into `document.cookie`, **never** included in JSON Deck Config exports, **never** logged to `console` or rendered unmasked in the DOM.
- Before attaching `Authorization: Bearer <token>`, `assertGitHubApiOrigin(url)` parses via `new URL(url)` and enforces `parsed.protocol === 'https:' && parsed.origin === 'https://api.github.com'`. Any other origin receives `{}`.

### 3.2 External HTML / Manifest XSS Sanitization (`src/telemetry/*`, `src/ui/*`)
- Live `krunked-fpv` sub-app `<title>`, `<meta>`, `manifest.json`, and GitHub repo/commit strings are untrusted third-party HTML/JSON inputs.
- All strings pass through `stripEmojisAndDecodeHtml()` (decoding safe entities, removing Unicode pictographic emojis while retaining keycap glyphs `⌘` and `↵`), and are rendered in the DOM strictly via `.textContent` or `createElement` + `setAttribute` — never via unsafe `.innerHTML` interpolation of untrusted data.
- Every URL (`liveUrl`, `htmlUrl`, `iconUrl`, `ogImageUrl`, custom user launch URL) passes through `sanitizeHttpUrl()`, permitting strictly `http:` or `https:` schemes and rejecting `javascript:`, `data:`, `vbscript:`, or relative exploits.

### 3.3 Recursive Self-Iframe Guard (`src/ui/hero-forge.js`, `src/ui/foundry-matrix.js`)
- Because KRUNKED // DECK runs at `https://krunked-fpv.github.io/`, launching `[ LIVE PEEK ]` against `krunked-fpv.github.io` itself (or the active deployment's own origin + pathname) would recursively embed the launchpad inside itself.
- Before creating any `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups">`, the peek controller normalizes the candidate URL against `window.location` and checks `repo.isSelfDeck`. When matched (or when framing fails), it blocks `<iframe>` creation and renders the `"SELF-HOSTED TELEMETRY SURFACE // LAUNCH DIRECT"` diagnostic blueprint with a 1-click launch action.

### 3.4 Service Worker App-Shell Allowlist (`sw.js`)
- At `https://krunked-fpv.github.io/`, `sw.js` registered with `{ scope: './' }` shares the root origin with sibling sub-apps (`/dojo/`, `/discogs_sniper/`, etc.).
- To prevent intercepting sub-app assets or corrupting GitHub API ETag headers, `sw.js` strictly checks:
  1. `request.method === 'GET'` and `url.origin === self.location.origin`.
  2. Relative path from `self.registration.scope` strictly matches KRUNKED // DECK's own shell allowlist: `''`, `'index.html'`, `'manifest.json'`, `'sw.js'`, `'src/...'`, `'data/...'`, `'assets/...'`.
  3. Any request outside that allowlist (including `api.github.com` and sibling `/<sub-app>/` paths) returns immediately without calling `event.respondWith()`.

## 4. Visual & Acoustic Subsystem Architecture
- **Graphics (`src/graphics/*`)**: Pure SVG & Canvas primitives with zero dependencies: ISO/IEC 18004 QR matrix encoder (`qr-svg.js`) with GF(256) Reed-Solomon ECC, FNV-1a seeded Swiss-grid emblem generator (`swiss-emblem.js`), 30-day commit sparkline (`sparkline.js`), interactive 90-day Chrono-Pulse scrubber (`chrono-pulse.js`), and 2.5% monochrome SVG `feTurbulence` film grain (`film-grain.js`).
- **Micro-Foley (`src/audio/micro-foley.js`)**: Muted by default; lazy `AudioContext` unlock on gesture when enabled; 2ms bandpass-filtered noise bursts with auto-disconnecting gain envelopes.
- **Design System (`src/styles/*`)**: Anodized Obsidian default theme + Braun Daylight mechanical toggle, `tabular-nums` telemetry discipline, single passive `requestAnimationFrame` pointer sheen tracking (`--cursor-x`, `--cursor-y`), and progressive `document.startViewTransition` view morphing.

## 5. Exclusive File Ownership Matrix

| Specialist | Owned Files |
| :--- | :--- |
| `marcus-vance` | `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`, `.agents/agents/*.md` |
| `soren-lindqvist` | `scripts/build-snapshot.mjs`, `data/foundry-snapshot.json` |
| `nadia-khoury` | `src/telemetry/sync-engine.js`, `src/telemetry/idb-cache.js`, `src/telemetry/manifest-probe.js`, `src/telemetry/classifier.js` |
| `viktor-kuznetsov` | `src/vault/cookie-vault.js`, `src/vault/pat-vault.js`, `src/vault/config-io.js` |
| `elena-rodriguez` | `src/graphics/chrono-pulse.js`, `src/graphics/sparkline.js`, `src/graphics/swiss-emblem.js`, `src/graphics/qr-svg.js`, `src/graphics/film-grain.js` |
| `kenji-takahashi` | `src/audio/micro-foley.js` |
| `claire-beaumont` | `src/styles/tokens.css`, `src/styles/chassis.css`, `src/styles/components.css`, `src/styles/views.css` |
| `devon-okafor` | `index.html`, `src/app.js`, `src/ui/top-bar.js`, `src/ui/hero-forge.js`, `src/ui/bento-deck.js`, `src/ui/inspector-drawer.js`, `src/ui/foundry-matrix.js`, `src/ui/command-palette.js`, `src/ui/modals.js` |
| `tomas-novak` | `manifest.json`, `sw.js`, `assets/icons/icon-192.png`, `assets/icons/icon-512.png`, `assets/icons/apple-touch-icon.png`, `assets/icons/favicon.svg`, `.gitignore`, `.github/workflows/deploy-pages.yml`, `.github/workflows/sync-foundry.yml` |
| `hana-lindholm` | `tests/verify-suite.mjs` |
