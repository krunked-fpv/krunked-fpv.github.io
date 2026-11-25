import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildManifest, buildServiceWorker, isPrecachedAsset } from '../../vite/pwaPlugin';
import type { SnapshotFile } from '../types/github';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (...parts: string[]) => path.join(ROOT, ...parts);

const EMOJI_RE =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|\uFE0F|[\u{1F1E6}-\u{1F1FF}]|\u2605|\u2606)/gu;
const PLACEHOLDER_RE = new RegExp(`\\b(?:${['TO', 'DO'].join('')}|${['FIX', 'ME'].join('')}|${['XX', 'X'].join('')})\\b`);
const PURPLE_HEX_RE = /#(?:a855f7|9333ea|8b5cf6|7c3aed|6366f1|c084fc|d946ef|ec4899|6d28d9|5b21b6|4f46e5)\b/i;
const PURPLE_TW_RE = /\b(?:bg|text|border|from|via|to|ring|fill|stroke)-(?:purple|violet|indigo|fuchsia|magenta)-\d{2,3}\b/i;

function walkFiles(dir: string, exts: Set<string>, skipDirs = new Set(['node_modules', '.git', 'dist'])): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      out.push(...walkFiles(full, exts, skipDirs));
    } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('SnapshotV2 integrity & Tier-1 baker audit', () => {
  it('verifies public/snapshot.json conforms strictly to SnapshotV2 with bot exclusion, zero emojis, and valid probes', () => {
    const snapshotPath = rel('public', 'snapshot.json');
    expect(
      fs.existsSync(snapshotPath),
      'public/snapshot.json is missing — run "npm run snapshot" before running tests',
    ).toBe(true);
    const rawText = fs.readFileSync(snapshotPath, 'utf8');
    expect(rawText.match(EMOJI_RE)).toBeNull();
    expect(rawText.toLowerCase()).not.toContain('<script');

    const snap = JSON.parse(rawText) as SnapshotFile;
    expect(snap.schemaVersion).toBe('SnapshotV2');
    expect(snap.owner).toBe('krunked-fpv');
    expect(['live-github-bake', 'preserved-cache', 'offline-fallback']).toContain(snap.sourceMode);
    expect(Array.isArray(snap.repos)).toBe(true);
    expect(snap.repos.length).toBeGreaterThan(0);

    // Exact 90 chronological UTC days
    expect(snap.chronoPulse90d).toHaveLength(90);
    for (let i = 0; i < snap.chronoPulse90d!.length; i++) {
      const d = snap.chronoPulse90d![i]!;
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(d.count) && d.count >= 0).toBe(true);
      expect(Array.isArray(d.repos)).toBe(true);
      if (i > 0) {
        expect(d.date > snap.chronoPulse90d![i - 1]!.date).toBe(true);
      }
    }

    // Zero bot/skip-ci commits in baked commit feeds
    const botAuthorRe = /(?:github-actions|dependabot|renovate)(?:\[bot\])?/i;
    const skipCiRe = /\[(?:skip ci|ci skip)\]/i;
    for (const entry of Object.values(snap.commits ?? {})) {
      if (entry.commits30d) expect(entry.commits30d).toHaveLength(30);
      for (const c of entry.commits) {
        expect(botAuthorRe.test(c.author)).toBe(false);
        expect(skipCiRe.test(c.message)).toBe(false);
        expect(c.message.match(EMOJI_RE)).toBeNull();
      }
    }

    // Verified probes integrity: every 404/isNotFound probe has liveVerified=false and isPwa=false
    expect(snap.probes).toBeDefined();
    for (const probe of Object.values(snap.probes ?? {})) {
      if (probe.isNotFound) {
        expect(probe.liveVerified).toBe(false);
        expect(probe.isPwa).toBe(false);
      }
      if (probe.liveVerified && probe.resolvedUrl) {
        expect(probe.resolvedUrl).toMatch(/^https?:\/\//);
      }
    }

    expect(snap.totals).toBeDefined();
    if (snap.sourceMode === 'offline-fallback') {
      expect(snap.totals!.liveApps).toBeGreaterThanOrEqual(0);
    } else {
      expect(snap.totals!.liveApps).toBeGreaterThan(0);
    }
    expect(snap.totals!.deadPages).toBeGreaterThanOrEqual(0);
  });

  it('validates exported pure Tier-1 baker helpers and offline resilience without touching network', async () => {
    const bakerUrl = pathToFileURL(rel('scripts', 'build-snapshot.mjs')).href;
    const baker = (await import(bakerUrl)) as {
      isAutomatedBakeCommit: (c: unknown) => boolean;
      sanitizeText: (s: unknown) => string;
      sanitizeHttpUrl: (u: unknown, base?: string) => string | null;
      parseSubAppHtml: (html: string, base: string) => { isNotFound: boolean; title: string | null; isPwa: boolean };
      createOfflineBaselineSnapshot: (opts?: { owner?: string }) => SnapshotFile;
      buildSnapshot: (opts: { writeOutput: boolean; fetchImpl: () => Promise<never> }) => Promise<{ snapshot: SnapshotFile }>;
    };

    expect(
      baker.isAutomatedBakeCommit({
        author: { login: 'github-actions[bot]' },
        commit: { message: 'chore: sync [skip ci]' },
      }),
    ).toBe(true);
    expect(
      baker.isAutomatedBakeCommit({
        author: { login: 'krunked-fpv' },
        commit: { message: 'feat: launchpad telemetry' },
      }),
    ).toBe(false);

    expect(baker.sanitizeText('<script>alert(1)</script>Krunked &amp; Forge 🚀 ★')).toBe('Krunked & Forge');
    expect(baker.sanitizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(baker.sanitizeHttpUrl('https://krunked-fpv.github.io/dojo/')).toBe('https://krunked-fpv.github.io/dojo/');

    const soft404 = baker.parseSubAppHtml(
      '<title>Site not found · GitHub Pages</title><body>There isn’t a GitHub Pages site here.</body>',
      'https://krunked-fpv.github.io/dead/',
    );
    expect(soft404.isNotFound).toBe(true);

    const baseline = baker.createOfflineBaselineSnapshot({ owner: 'krunked-fpv' });
    expect(baseline.schemaVersion).toBe('SnapshotV2');
    expect(baseline.chronoPulse90d).toHaveLength(90);

    const offline = await baker.buildSnapshot({
      writeOutput: false,
      fetchImpl: async () => {
        throw new Error('Network disabled in audit test');
      },
    });
    expect(offline.snapshot.schemaVersion).toBe('SnapshotV2');
    expect(['preserved-cache', 'offline-fallback']).toContain(offline.snapshot.sourceMode);
    expect(offline.snapshot.chronoPulse90d).toHaveLength(90);
  });
});

describe('PWA raster PNG icons, manifest, SW generator & dist artifacts', () => {
  it('verifies all 6 public/icons/*.png magic signatures (89504e470d0a1a0a) and exact IHDR dimensions', () => {
    const expected: Array<[string, number]> = [
      ['favicon-32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['icon-maskable-192.png', 192],
      ['icon-maskable-512.png', 512],
    ];
    for (const [file, size] of expected) {
      const buf = fs.readFileSync(rel('public', 'icons', file));
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    }

    expect(fs.readFileSync(rel('public', 'favicon.svg'), 'utf8')).toContain('<svg');
    expect(fs.existsSync(rel('public', '.nojekyll'))).toBe(true);
  });

  it('verifies vite/pwaPlugin manifest & SW output contracts and dist/ relative URLs when built', () => {
    const manifest = JSON.parse(buildManifest()) as {
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
      shortcuts: Array<{ url: string }>;
    };
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect(icon.src.startsWith('./')).toBe(true);
    for (const sc of manifest.shortcuts) expect(sc.url.startsWith('./#')).toBe(true);

    expect(isPrecachedAsset('assets/index-abc.js')).toBe(true);
    expect(isPrecachedAsset('assets/geist-latin-wght-normal-abc.woff2')).toBe(true);
    expect(isPrecachedAsset('assets/geist-cyrillic-wght-normal-abc.woff2')).toBe(false);

    const sw = buildServiceWorker(['./', './index.html', './snapshot.json'], 'testver123');
    expect(sw).toContain("const CACHE = 'forge-deck-v2-testver123'");
    expect(sw).toContain("k.startsWith('krunked-sw-cache-')");
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).toContain("rel === 'snapshot.json'");

    // When dist/ is built, verify emitted bundle uses strictly relative ./ URLs and required PWA files
    const distHtmlPath = rel('dist', 'index.html');
    if (fs.existsSync(distHtmlPath)) {
      const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
      expect(/(?:src|href)="\/(?!\/)/.test(distHtml)).toBe(false);
      expect(distHtml).toContain('id="meta-theme-color"');
      expect(distHtml).toContain('./manifest.webmanifest');
      expect(fs.existsSync(rel('dist', 'manifest.webmanifest'))).toBe(true);
      expect(fs.existsSync(rel('dist', 'sw.js'))).toBe(true);
      expect(fs.existsSync(rel('dist', '.nojekyll'))).toBe(true);
      expect(fs.existsSync(rel('dist', 'snapshot.json'))).toBe(true);
    }
  });
});

describe('Repo-wide V2 static security & craft hygiene audit', () => {
  it('enforces zero Unicode emojis/stars, zero placeholders, zero clipboard-write, and zero purple classes across src/', () => {
    const srcFiles = walkFiles(rel('src'), new Set(['.ts', '.tsx', '.css']), new Set(['test']));
    expect(srcFiles.length).toBeGreaterThan(20);

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const short = path.relative(ROOT, file);
      expect(content.match(EMOJI_RE), `Emoji/pictograph leak in ${short}`).toBeNull();
      expect(content.match(PLACEHOLDER_RE), `Placeholder marker in ${short}`).toBeNull();
      expect(content, `Forbidden clipboard-write permission in ${short}`).not.toContain('clipboard-write');
      expect(content.match(PURPLE_HEX_RE), `Forbidden purple hex in ${short}`).toBeNull();
      expect(content.match(PURPLE_TW_RE), `Forbidden purple Tailwind utility in ${short}`).toBeNull();
    }
  });

  it('verifies SandboxFrame security attributes, index.html zero-FOUC bootstrap, and 2-job Pages CI', () => {
    const sandboxSrc = fs.readFileSync(rel('src', 'components', 'peek', 'SandboxFrame.tsx'), 'utf8');
    expect(sandboxSrc).toContain('isSelfHostedPeekTarget');
    expect(sandboxSrc).toContain('sandbox="allow-scripts allow-same-origin allow-forms allow-popups"');
    expect(sandboxSrc).not.toContain('clipboard-write');

    const indexHtml = fs.readFileSync(rel('index.html'), 'utf8');
    expect(indexHtml).toContain('id="meta-theme-color"');
    expect(indexHtml).toContain('krunked-cookie-vault-v1');
    expect(indexHtml).toContain('root.dataset.theme');
    expect(indexHtml).toContain('./manifest.webmanifest');
    expect(indexHtml).toContain('./icons/favicon-32.png');

    const deployYml = fs.readFileSync(rel('.github', 'workflows', 'deploy.yml'), 'utf8');
    expect(deployYml).toContain('group: pages');
    expect(deployYml).toContain('deploy-pages@v5');
    expect(deployYml).toContain('npm run snapshot');
    expect(deployYml).not.toContain('git push');
    expect(deployYml.indexOf('npm run snapshot')).toBeGreaterThan(-1);
    expect(deployYml.indexOf('npm test')).toBeGreaterThan(-1);
    expect(deployYml.indexOf('npm run snapshot')).toBeLessThan(deployYml.indexOf('npm test'));

    const ciYml = fs.readFileSync(rel('.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ciYml).toContain('npm run snapshot');
    expect(ciYml.indexOf('npm run snapshot')).toBeGreaterThan(-1);
    expect(ciYml.indexOf('npm run verify')).toBeGreaterThan(-1);
    expect(ciYml.indexOf('npm run snapshot')).toBeLessThan(ciYml.indexOf('npm run verify'));
  });
});
