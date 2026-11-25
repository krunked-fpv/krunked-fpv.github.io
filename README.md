# KRUNKED // FORGE DECK V2

Zero-backend personal app launcher, sub-app portal, and real-time GitHub telemetry deck for [`krunked-fpv`](https://github.com/krunked-fpv), built with Vite, React 19, TypeScript (strict), Tailwind CSS v4, Framer Motion, and Zustand.

## V2 Highlights

- **Dual Hardware Themes (Zero FOUC)**: Switch live between **Anodized Obsidian** (`#08090B`) and **Braun Daylight** (`#ECEAE4`) with WCAG AA contrast across every surface, pointer-tracked specular bezels, 140ms View Transitions morphing, and synchronous pre-paint `index.html` theme bootstrap.
- **3-Tier Telemetry & 90-Day Chrono-Pulse**:
  - **Tier 1 (`scripts/build-snapshot.mjs`)**: Zero-dependency Node baker generating `SnapshotV2` (`public/snapshot.json`) with HTTP/soft-404 GitHub Pages verification, sanitized HTML/manifest metadata, language byte maps, and bot/cron-excluded 30d/90d commit velocity.
  - **Tier 2 (`src/data/*`)**: `<50ms` cache + IndexedDB (`krunked_deck_telemetry_v2`) + `SnapshotV2` hydration, conditional `If-None-Match` (`304 Not Modified`) zero-quota polling, `403`/`429` backoff, and an interactive 90-day UTC **Chrono-Pulse** scrubber filtering projects and ship logs.
- **Procedural Cover Art, Swiss Emblems & ISO-18004 QR Handoff**: Dual-theme OKLCH canvas covers (strictly non-purple), Fritsch-Carlson monotone 30-day sparklines, deterministic FNV-1a Swiss emblems, and a zero-dependency ISO/IEC 18004 byte-mode QR SVG encoder (GF(256) Reed-Solomon ECC, 8-mask scoring) with SVG download.
- **4-Tab Peek Inspector & Local Curation**: Live **Sandbox** (runtime self-iframe recursion guard + `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` + Desktop/Mobile viewport toggle), **Brief & README** (language bar, CI Actions link, DOMPurify README), **QR Handoff**, and **Curate** (local per-project display name, tagline, category, art style, hue, and visibility overrides).
- **Procedural WebAudio Micro-Foley**: Muted by default with zero `AudioContext` allocation until unmuted via user gesture; synthesizes 5 Braun/TE tactile hardware cues (`tick`, `click`, `latch`, `relay`, `sync`) through a hard-limited compressor chain (`<= 0.12` master gain).
- **Triple-Redundant Self-Healing Vault & PAT Firewall**: Bidirectional auto-healing across `localStorage`, IndexedDB (`krunked_vault_v1`), and a `<3800B` `SameSite=Lax` shadow cookie (`krunked-cookie-vault-v1`) reconciled by monotonic `rev`; portable PAT-free `KrunkedDeckConfigV2` JSON export/import; optional read-only GitHub PAT (`krunked-local-pat-v1`) strictly firewalled to `https://api.github.com`.
- **Keyboard & Command Palette**: `Cmd/Ctrl+K` or `/` for fuzzy project & system command search, `1`/`2`/`3` view switching (Bento, Telemetry Grid, Ship Matrix), `T` theme toggle, `M` audio mute, `R` force sync, `G` settings, plus 2D arrow-key grid navigation (`I` Peek, `Q` QR, `P` Pin).

## Configuration

- **Branding, theme colors & constants**: [`src/config/site.ts`](src/config/site.ts)
- **Static baseline curation**: [`src/config/projectOverrides.ts`](src/config/projectOverrides.ts)
- **Full contracts & architecture**: [`SPEC.md`](SPEC.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`HANDOFF.md`](HANDOFF.md)

## Development & Verification

```bash
npm install
npm run icons     # regenerate 4x4 supersampled PNG & SVG PWA icons
npm run snapshot  # bake SnapshotV2 into public/snapshot.json (uses GITHUB_TOKEN if set)
npm run dev       # start local Vite dev server
npm run verify    # run typecheck + Vitest suite + production Vite build
```

Append `?sync=off` in the browser to preview deterministically from cached/snapshot data with zero outbound GitHub API requests.

## GitHub Pages Deployment

In repository **Settings -> Pages**, set **Source** to **GitHub Actions**. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs a two-job `build -> deploy` pipeline (`typecheck`, `test`, ephemeral `npm run snapshot`, `build`, and `dist/` integrity verification) on push to `main`, manual dispatch, and every 3 hours without polluting git history. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) gates pull requests with the same checks.
