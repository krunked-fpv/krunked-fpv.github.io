# HANDOFF — KRUNKED // DECK (Sprint 1 Closeout)

## 1. Completed & Verified Features
- **Zero-Backend Static Deck (`index.html`, `src/app.js`, `src/ui/*.js`)**: Pure HTML5/CSS/ES Modules runnable with zero build steps at both root (`/`) and subpath (`/<repo-slug>/`) via `./` relative imports.
- **3-Tier Telemetry (`scripts/build-snapshot.mjs`, `data/foundry-snapshot.json`, `src/telemetry/*.js`)**: Tier-1 Node baker harvested 16 `krunked-fpv` repos (`15` verified `WEB_APP`, `maul-forge` 404 classified `CLI_REPO`, bot commits excluded). Tier-2 concurrent boot (`./data/foundry-snapshot.json` + IndexedDB `krunked_deck_telemetry_v1`), conditional `If-None-Match` ETag (`304`/`200`/`403` fallback), live HTML/manifest probe, XSS neutralization, emoji stripping, and 6-tag classification.
- **Triple-Redundant Vault & PAT Security (`src/vault/*.js`)**: `krunked-cookie-vault-v1` bidirectional reconciliation across `localStorage`, IndexedDB (`krunked_vault_v1`), and `<3800B` `SameSite=Lax` shadow cookie; portable `KrunkedDeckConfigV1` JSON export/import; `krunked-local-pat-v1` firewall strictly asserting `https://api.github.com`.
- **Graphics & Micro-Foley (`src/graphics/*.js`, `src/audio/micro-foley.js`)**: ISO/IEC 18004 QR SVG encoder (GF(256) Reed-Solomon, 8-mask scoring), FNV-1a Swiss emblems, 30d sparklines, interactive 90d Chrono-Pulse scrubber, 2.5% monochrome SVG grain, and muted-by-default 2ms WebAudio clicks.
- **Industrial UI & WebAPK PWA (`src/styles/*.css`, `manifest.json`, `sw.js`, `assets/icons/*`, `.github/workflows/*`)**: Obsidian/Daylight themes, 60fps pointer sheen, `tabular-nums` stopwatch, Hero `[ LIVE PEEK ]` + recursive self-iframe hostname guard, Bento spatial grid, Slide-Over Inspector/Curation, Matrix/Split views, `⌘K` palette, verified PNG icons (`192x192`, `512x512`, `180x180`), scope-allowlisted SW (`KRUNKED_SW_CACHE_V1`), and two-job (`build` -> `deploy`) GitHub Pages + 20m snapshot-sync workflows staging `_site/`.
- **Verification**: `node ./tests/verify-suite.mjs` (`15/15` checks) plus live local HTTP browser QA across `/` and `/krunked-fpv.github.io/` at `1440x900` and `375x812`.

## 2. Active Technical Debt & Edge Cases
- Live `browser` subagent sandbox disallows `page.evaluate` / `page.route`; mocked `403`, programmatic primary-storage deletion, and in-page `requestAnimationFrame` FPS intervals were verified via Node DOM/mock tests in `verify-suite.mjs`, while real UI ETag `304`, reload persistence, and `VAULT // PAT` reconciliation passed in the live browser.
- Seven internal UI hook classes (`bento-deck`, `bento-card__spark`, `foundry-matrix-host`, `bezel-status-text`, `bezel-url-text`, `hero-forge__spark`) remain unstyled hook identifiers; harmless and tidyable in Sprint 2.

## 3. Environment & Dependency Shifts
- Zero runtime or test dependencies; Node.js `v22.14.0` built-in APIs only. GitHub Pages uses two-job Actions artifact deployment (`build` -> `deploy`) staging `_site/`.

## 4. Next Immediate Priorities
1. Verify scheduled 20-minute `sync-foundry.yml` runs cleanly commit updated `foundry-snapshot.json` and redeploy `_site/`.
2. Add Playwright browser harness in Sprint 2 for automated `beforeinstallprompt` and storage-wipe E2E coverage.
