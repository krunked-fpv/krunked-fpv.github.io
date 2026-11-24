# KRUNKED // FORGE DECK

Personal App Launcher & Live Project Telemetry Dashboard for [`krunked-fpv`](https://github.com/krunked-fpv), built with Vite, React, TypeScript, Tailwind CSS v4, Framer Motion, and Zustand.

## Configuration

- **Brand & target GitHub user:** edit `GITHUB_USER` and `BRAND` in [`src/config/site.ts`](src/config/site.ts).
- **Per-project curation & overrides:** edit [`src/config/projectOverrides.ts`](src/config/projectOverrides.ts) to set custom `displayName`, `tagline`, `category`, `accent` hue, `artStyle`, `glyph`, `screenshot`, `launchUrl`, `hidden`, or `featured`.

## Development

```bash
npm install
npm run icons     # regenerate PNG & SVG PWA icons
npm run snapshot  # optional: seed public/snapshot.json (uses GITHUB_TOKEN if set)
npm run dev
```

## Verification & Build

```bash
npm run typecheck
npm test
npm run build
```

Append `?sync=off` in the browser to preview from cached/snapshot data without making GitHub API calls.

## GitHub Token Note

Unauthenticated GitHub API requests share a 60 req/hr quota, protected by conditional `If-None-Match` (`304 Not Modified`) caching. You can optionally enter a **fine-grained, read-only public PAT** inside **Settings** (stored locally in `sessionStorage` or `localStorage` and sent only to `api.github.com`). Because GitHub Pages user sites share origin storage across `/<repo>/` subpaths, keep any token strictly read-only.

## Deployment (GitHub Pages)

In your repository **Settings → Pages**, set **Source** to **GitHub Actions**. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) automatically builds a fresh snapshot and deploys `dist/` on push to `main` and every 6 hours.
