import { describe, expect, it } from 'vitest';
import { parseProbeHtml } from '../data/probe';
import {
  buildChronoPulse,
  heatStrip,
  sparkline,
  utcDateKey,
  utcDayStart,
  velocity,
} from '../domain/activity';
import { buildProjects } from '../domain/buildProjects';
import { classify } from '../domain/classify';
import { badgeLabel, formatDelta, freshnessOf } from '../domain/freshness';
import { fuzzyFields, fuzzyMatch } from '../domain/fuzzy';
import { humanizeName } from '../domain/humanize';
import { isSelfHostedPeekTarget, pagesCandidateUrl, resolveLaunch } from '../domain/resolveLaunch';
import {
  decodeHtmlEntities,
  isBotCommit,
  isSelfDeckRepo,
  sanitizeCurationPatch,
  sanitizeHttpUrl,
  sanitizeThemeColor,
  stripHtmlAndEmojis,
} from '../domain/sanitize';
import { toShipLogs } from '../domain/shiplog';
import { shouldHandle, swRouteStrategy } from '../domain/swScope';
import {
  filterProjects,
  searchActions,
  searchProjects,
  spotlightOf,
} from '../store/selectors';
import type { CommitLite, GhEvent, GhRepo, SnapshotProbe } from '../types/github';

const mkRepo = (over: Partial<GhRepo> = {}): GhRepo => ({
  id: 1,
  name: 'demo',
  full_name: 'krunked-fpv/demo',
  html_url: 'https://github.com/krunked-fpv/demo',
  description: null,
  homepage: null,
  has_pages: false,
  language: 'TypeScript',
  topics: [],
  stargazers_count: 0,
  forks_count: 0,
  size: 120,
  default_branch: 'main',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-11-24T00:00:00Z',
  pushed_at: '2026-11-24T00:00:00Z',
  fork: false,
  archived: false,
  ...over,
});

describe('XSS, HTML entity, emoji & URL sanitization', () => {
  it('strips raw & double-encoded HTML, script/style tags, Unicode emojis, and raw stars', () => {
    expect(stripHtmlAndEmojis('<script>alert(1)</script>Hello &amp; <b>Forge</b> 🚀🔥★☆')).toBe('Hello & Forge');
    expect(stripHtmlAndEmojis('&lt;img src=x onerror=alert(1)&gt;Clean &mdash; Deck 1️⃣ 🇺🇸')).toBe('Clean — Deck');
    expect(stripHtmlAndEmojis('<style>body{display:none}</style>Dojo &#39;26')).toBe("Dojo '26");
    expect(decodeHtmlEntities('A &amp; B &ndash; &#x2014;')).toBe('A & B – —');
    expect(sanitizeThemeColor('#FF4F00')).toBe('#FF4F00');
    expect(sanitizeThemeColor('rgb(255,0,0)')).toBeNull();
    expect(sanitizeThemeColor('#fff"><script>')).toBeNull();
  });

  it('blocks dangerous URL schemes, control chars, and embedded credentials in sanitizeHttpUrl', () => {
    const attacks = [
      'javascript:alert(1)',
      '  JaVa\tScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://krunked-fpv.github.io/123',
      'https://admin:secret@evil.com/phish',
      'https://krunked-fpv.github.io/\r\nX-Injected: 1',
      'mailto:test@example.com',
      '',
    ];
    for (const bad of attacks) {
      expect(sanitizeHttpUrl(bad, 'https://krunked-fpv.github.io/')).toBeNull();
    }
    expect(sanitizeHttpUrl('https://krunked-fpv.github.io/dojo/')).toBe('https://krunked-fpv.github.io/dojo/');
    expect(sanitizeHttpUrl('./icons/app.png', 'https://krunked-fpv.github.io/dojo/')).toBe(
      'https://krunked-fpv.github.io/dojo/icons/app.png',
    );
    expect(sanitizeHttpUrl('example.com/app', undefined, { allowBareDomain: true })).toBe('https://example.com/app');
    expect(sanitizeHttpUrl('example.com/app')).toBeNull();
  });

  it('identifies bot commits and sanitizes user curation patches', () => {
    expect(isBotCommit({ author: 'github-actions[bot]', message: 'update' })).toBe(true);
    expect(isBotCommit({ author: 'dependabot[bot]', message: 'bump vite' })).toBe(true);
    expect(isBotCommit({ author: 'krunked-fpv', message: 'chore: bake [skip ci]' })).toBe(true);
    expect(isBotCommit({ author: 'krunked-fpv', message: 'feat: launchpad V2' })).toBe(false);

    const patch = sanitizeCurationPatch({
      displayName: '<b>My App</b> 🚀 ★',
      tagline: '<script>x()</script>Fast &amp; sharp',
      category: 'Game',
      artStyle: 'orbital',
      launchUrl: 'javascript:alert(1)',
      accent: 410,
      hidden: true,
    });
    expect(patch.displayName).toBe('My App');
    expect(patch.tagline).toBe('Fast & sharp');
    expect(patch.category).toBe('Game');
    expect(patch.artStyle).toBe('orbital');
    expect(patch.launchUrl).toBeUndefined();
    expect(patch.accent).toBe(50);
    expect(patch.hidden).toBe(true);
  });

  it('parses sub-app HTML without DOMParser, catches soft-404s, and rejects malicious og:image', () => {
    const soft404 = parseProbeHtml(
      '<html><head><title>Site not found &middot; GitHub Pages</title></head><body>There isn’t a GitHub Pages site here.</body></html>',
      'https://krunked-fpv.github.io/dead-repo/',
    );
    expect(soft404.isNotFound).toBe(true);
    expect(soft404.title).toBeNull();

    const liveHtml = parseProbeHtml(
      `<html><head>
        <title>Dojo 🚀 — Tactical Arena &amp; Lab</title>
        <meta name="description" content="<script>bad()</script>Train &amp; battle ★" />
        <meta name="theme-color" content="#FF4F00" />
        <meta property="og:image" content="javascript:alert(1)" />
        <link rel="manifest" href="./manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="./icons/apple.png" />
      </head></html>`,
      'https://krunked-fpv.github.io/dojo/',
    );
    expect(liveHtml.isNotFound).toBe(false);
    expect(liveHtml.isPwa).toBe(true);
    expect(liveHtml.title).toBe('Dojo');
    expect(liveHtml.subtitle).toBe('Tactical Arena & Lab');
    expect(liveHtml.description).toBe('Train & battle');
    expect(liveHtml.themeColor).toBe('#FF4F00');
    expect(liveHtml.ogImage).toBeNull();
    expect(liveHtml.manifestUrl).toBe('https://krunked-fpv.github.io/dojo/manifest.webmanifest');
    expect(liveHtml.iconUrl).toBe('https://krunked-fpv.github.io/dojo/icons/apple.png');
  });
});

describe('resolveLaunch, 404 Pages demotion & self-iframe guard', () => {
  it('prefers override, then homepage, then verified Pages, and demotes confirmed 404/unverified Pages to code', () => {
    expect(resolveLaunch({ name: 'a', homepage: 'https://x.dev', has_pages: true }, 'https://override.dev/')).toBe(
      'https://override.dev/',
    );
    expect(resolveLaunch({ name: 'a', homepage: 'example.com/app', has_pages: true })).toBe('https://example.com/app');
    expect(resolveLaunch({ name: 'maul-forge', homepage: '', has_pages: true })).toBe('https://krunked-fpv.github.io/maul-forge/');
    expect(resolveLaunch({ name: 'krunked-fpv.github.io', homepage: null, has_pages: true })).toBe('https://krunked-fpv.github.io/');
    expect(resolveLaunch({ name: 'KRUNKED-FPV.GITHUB.IO', homepage: null, has_pages: true })).toBe('https://krunked-fpv.github.io/');
    expect(resolveLaunch({ name: 'chroma-cosmos', homepage: null, has_pages: false })).toBeNull();
    expect(pagesCandidateUrl({ name: 'dojo', has_pages: true })).toBe('https://krunked-fpv.github.io/dojo/');

    // Dead Pages demotion
    expect(
      resolveLaunch(
        { name: 'broken-pages', homepage: null, has_pages: true },
        undefined,
        'krunked-fpv',
        'https://krunked-fpv.github.io',
        { isNotFound: true, liveVerified: false },
      ),
    ).toBeNull();
    expect(
      resolveLaunch(
        { name: 'unverified-pages', homepage: null, has_pages: true },
        undefined,
        'krunked-fpv',
        'https://krunked-fpv.github.io',
        { isNotFound: false, liveVerified: false },
      ),
    ).toBeNull();
    // Explicit override survives even when probe reports 404
    expect(
      resolveLaunch(
        { name: 'broken-pages', homepage: null, has_pages: true },
        'https://custom.example.dev/app',
        'krunked-fpv',
        'https://krunked-fpv.github.io',
        { isNotFound: true, liveVerified: false },
      ),
    ).toBe('https://custom.example.dev/app');
  });

  it('blocks recursive self-iframe targets across http/https root, index.html, and current origin+pathname', () => {
    expect(isSelfDeckRepo('krunked-fpv.github.io')).toBe(true);
    expect(isSelfDeckRepo('KRUNKED-FPV.GITHUB.IO')).toBe(true);
    expect(isSelfDeckRepo('dojo')).toBe(false);

    expect(isSelfHostedPeekTarget('https://krunked-fpv.github.io/', null)).toBe(true);
    expect(isSelfHostedPeekTarget('http://krunked-fpv.github.io/', null)).toBe(true);
    expect(isSelfHostedPeekTarget('https://KRUNKED-FPV.GITHUB.IO/index.html', null)).toBe(true);
    expect(isSelfHostedPeekTarget('https://krunked-fpv.github.io///', null)).toBe(true);
    expect(
      isSelfHostedPeekTarget('http://127.0.0.1:4173/index.html', { origin: 'http://127.0.0.1:4173', pathname: '/' }),
    ).toBe(true);
    expect(
      isSelfHostedPeekTarget('https://preview.example.com/forge-deck/', 'https://preview.example.com/forge-deck/index.html'),
    ).toBe(true);

    // Sibling sub-apps on the same host MUST remain embeddable
    expect(
      isSelfHostedPeekTarget('https://krunked-fpv.github.io/dojo/', {
        origin: 'https://krunked-fpv.github.io',
        pathname: '/',
      }),
    ).toBe(false);
    expect(isSelfHostedPeekTarget('https://krunked-fpv.github.io/maul-forge/', null)).toBe(false);
    expect(isSelfHostedPeekTarget('javascript:alert(1)', null)).toBe(false);
  });

  it('demotes 404 Pages repos in buildProjects and excludes empty sizeKb===0 code repos from beating live apps in spotlightOf', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');
    const repos: GhRepo[] = [
      mkRepo({ id: 1, name: 'dead-pages', has_pages: true, size: 150, pushed_at: '2026-11-24T11:55:00Z' }),
      mkRepo({ id: 2, name: 'chroma-cosmos', has_pages: false, size: 0, pushed_at: '2026-11-24T11:59:00Z' }),
      mkRepo({ id: 3, name: 'dojo', has_pages: true, size: 4200, pushed_at: '2026-11-24T10:00:00Z', description: '<b>Arena</b> 🚀' }),
      mkRepo({ id: 4, name: 'maul-forge', has_pages: true, size: 312, pushed_at: '2026-11-24T11:00:00Z' }),
    ];
    const probes: Record<string, Partial<SnapshotProbe>> = {
      'dead-pages': { liveVerified: false, isNotFound: true, httpStatus: 404, isPwa: false },
      dojo: { liveVerified: true, isNotFound: false, httpStatus: 200, isPwa: true },
      'maul-forge': { liveVerified: true, isNotFound: false, httpStatus: 200, isPwa: true },
    };

    const projects = buildProjects({
      repos,
      events: [],
      pins: [],
      now,
      overrides: {},
      commitsFor: () => undefined,
      languagesFor: () => ({ TypeScript: 1000 }),
      probeFor: (slug) => probes[slug],
    });

    const dead = projects.find((p) => p.name === 'dead-pages')!;
    expect(dead.kind).toBe('code');
    expect(dead.launchUrl).toBeNull();
    expect(dead.liveVerified).toBe(false);
    expect(dead.isPwa).toBe(false);

    const dojo = projects.find((p) => p.name === 'dojo')!;
    expect(dojo.tagline).toBe('Arena');
    expect(dojo.kind).toBe('live');
    expect(dojo.liveVerified).toBe(true);

    const spot = spotlightOf(projects);
    // Live apps rank ahead of non-empty code repos, and empty sizeKb===0 repo ranks strictly last
    expect(spot[0]!.name).toBe('maul-forge');
    expect(spot[1]!.name).toBe('dojo');
    expect(spot[2]!.name).toBe('dead-pages');
    expect(spot[3]!.name).toBe('chroma-cosmos');
  });
});

describe('classify, humanize, freshness & fuzzy project/action search', () => {
  it('classifies keywords and sizes accurately and preserves acronyms', () => {
    expect(classify({ name: 'taxquest', topics: [], description: null }, 'live', 50)).toBe('Game');
    expect(classify({ name: 'bitforge-80', topics: [], description: null }, 'live', 50)).toBe('Game');
    expect(classify({ name: 'krunked_skymap', topics: [], description: null }, 'live', 50)).toBe('Hardware/Sky');
    expect(classify({ name: 'discogs_sniper', topics: [], description: null }, 'live', 50)).toBe('Audio/Vinyl');
    expect(classify({ name: 'clausehound-ai', topics: [], description: null }, 'live', 50)).toBe('Automation');
    expect(classify({ name: 'dojo', topics: [], description: null }, 'live', 50)).toBe('Game');
    expect(classify({ name: 'plain-tool', topics: [], description: null }, 'live', 50)).toBe('App');
    expect(classify({ name: 'tiny-script', topics: [], description: null }, 'code', 100)).toBe('Utility');
    expect(classify({ name: 'core-engine', topics: [], description: null }, 'code', 900)).toBe('Engine');
    expect(classify({ name: 'anything', topics: [], description: null }, 'code', 900, 'Audio/Vinyl')).toBe('Audio/Vinyl');

    expect(humanizeName('discogs_sniper')).toBe('Discogs Sniper');
    expect(humanizeName('bitforge-80')).toBe('Bitforge 80');
    expect(humanizeName('clausehound-ai')).toBe('Clausehound AI');
    expect(humanizeName('chaosdeck-sre')).toBe('Chaosdeck SRE');
  });

  it('computes freshness tiers, beacons, and deltas accurately', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');
    const f1 = freshnessOf('2026-11-24T11:48:00Z', now);
    expect(f1.tier).toBe('fresh');
    expect(f1.pulse).toBe(true);
    expect(badgeLabel('2026-11-24T11:48:00Z', now)).toBe('SHIPPED 12m AGO');

    const f2 = freshnessOf('2026-11-22T12:00:00Z', now);
    expect(f2.tier).toBe('active');
    expect(f2.pulse).toBe(true);
    expect(badgeLabel('2026-11-22T12:00:00Z', now)).toBe('UPDATED 2d AGO');

    expect(freshnessOf('2026-11-19T12:00:00Z', now).pulse).toBe(false);
    expect(freshnessOf('2026-10-01T12:00:00Z', now).tier).toBe('idle');

    expect(formatDelta(45_000)).toBe('45s');
    expect(formatDelta(12 * 60_000)).toBe('12m');
    expect(formatDelta(3 * 3_600_000)).toBe('3h');
    expect(formatDelta(5 * 86_400_000)).toBe('5d');
    expect(formatDelta(35 * 86_400_000)).toBe('5w');
    expect(formatDelta(95 * 86_400_000)).toBe('3mo');
  });

  it('ranks fuzzy matches across projects and palette actions cleanly', () => {
    const exact = fuzzyMatch('sky', 'krunked_skymap');
    const sparse = fuzzyMatch('sky', 'solar_kernel_yard');
    expect(exact).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(exact!.score).toBeGreaterThan(sparse!.score);
    expect(exact!.indices).toEqual([8, 9, 10]);

    expect(
      fuzzyFields('audio', [
        { text: 'discogs_sniper', weight: 1 },
        { text: 'Audio/Vinyl', weight: 0.7 },
      ])?.field,
    ).toBe(1);

    const actions = [
      { id: 'theme', label: 'Toggle Theme (Obsidian / Daylight)', keywords: ['braun', 'light', 'dark'] },
      { id: 'sound', label: 'Toggle Audio Foley', keywords: ['mute', 'sfx'] },
      { id: 'sync', label: 'Force Sync', keywords: ['refresh', 'github'] },
    ];
    const hits = searchActions(actions, 'braun');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.action.id).toBe('theme');

    const now = Date.parse('2026-11-24T12:00:00Z');
    const projects = buildProjects({
      repos: [mkRepo({ name: 'krunked_skymap', has_pages: true }), mkRepo({ id: 2, name: 'dojo', has_pages: true })],
      events: [],
      pins: [],
      now,
      overrides: {},
      commitsFor: () => [],
      languagesFor: () => ({}),
      probeFor: () => ({ liveVerified: true, isNotFound: false }),
    });
    const phits = searchProjects(projects, 'sky');
    expect(phits[0]!.project.name).toBe('krunked_skymap');
    const filtered = filterProjects(projects, 'live', {
      startDate: '2026-11-24',
      endDate: '2026-11-24',
      startIdx: 89,
      endIdx: 89,
      totalCount: 1,
      repos: ['dojo'],
    });
    expect(filtered.map((p) => p.name)).toContain('dojo');
  });
});

describe('UTC 30d/90d activity bucketing & shiplog', () => {
  const now = Date.UTC(2026, 10, 24, 12, 0, 0);

  it('uses strict UTC day boundaries, builds 30d sparklines, and excludes bot commits', () => {
    expect(utcDayStart(Date.UTC(2026, 10, 24, 23, 59, 59))).toBe(Date.UTC(2026, 10, 24, 0, 0, 0));
    expect(utcDateKey('2026-11-24T00:01:00Z')).toBe('2026-11-24');
    expect(utcDateKey('2026-11-23T23:59:00Z')).toBe('2026-11-23');
    expect(utcDateKey('not-a-date')).toBeNull();

    const commits: CommitLite[] = [
      { sha: 'aaa', message: 'one', date: '2026-11-24T09:00:00Z', author: 'krunked-fpv' },
      { sha: 'bbb', message: 'two', date: '2026-11-24T10:00:00Z', author: 'krunked-fpv' },
      { sha: 'bot', message: 'chore: sync [skip ci]', date: '2026-11-24T11:00:00Z', author: 'github-actions[bot]' },
      { sha: 'ccc', message: 'prev', date: '2026-11-23T10:00:00Z', author: 'krunked-fpv' },
    ];
    const s = sparkline(commits, [], now);
    expect(s).toHaveLength(30);
    expect(s[29]).toBe(2); // bot excluded
    expect(s[28]).toBe(1);
    expect(velocity(3, 1, 100)).toBe(7);

    const events: GhEvent[] = [
      {
        id: '1',
        type: 'PushEvent',
        repo: { name: 'krunked-fpv/dojo' },
        payload: { ref: 'refs/heads/main', head: '1234567abcdef' },
        created_at: '2026-11-24T08:00:00Z',
      },
    ];
    const strip = heatStrip(events, [mkRepo({ name: 'maul-forge', pushed_at: '2026-11-24T05:00:00Z' })], now, 90);
    expect(strip).toHaveLength(90);
    expect(strip[89]!.count).toBe(2);
    expect(strip[89]!.repos).toEqual(['dojo', 'maul-forge']);

    // Fuse baked 90d pulse with post-snapshot commit without double counting pre-snapshot commits
    const fused = buildChronoPulse({
      baked: [{ date: '2026-11-24', count: 5, repos: ['dojo'] }],
      snapshotAt: '2026-11-24T09:30:00Z',
      events: [],
      repos: [],
      commitsByRepo: new Map([['dojo', commits]]),
      now,
      days: 90,
    });
    expect(fused).toHaveLength(90);
    expect(fused[89]!.count).toBe(6); // 5 baked + 1 post-snapshot human commit ('bbb'); 'aaa' pre-cutoff & 'bot' excluded
  });

  it('translates PushEvents, groups pushes within 30m, strips emojis, and skips WatchEvent', () => {
    const commitIdx = new Map<string, CommitLite>([
      ['abcdef1234567', { sha: 'abcdef1234567', message: 'Ship shader fix 🚀', date: '2026-11-24T11:50:00Z', author: 'k' }],
    ]);
    const events: GhEvent[] = [
      { id: 'w1', type: 'WatchEvent', repo: { name: 'krunked-fpv/dojo' }, payload: {}, created_at: '2026-11-24T11:55:00Z' },
      { id: 'p1', type: 'PushEvent', repo: { name: 'krunked-fpv/dojo' }, payload: { ref: 'refs/heads/main', head: 'abcdef1234567' }, created_at: '2026-11-24T11:50:00Z' },
      { id: 'p2', type: 'PushEvent', repo: { name: 'krunked-fpv/dojo' }, payload: { ref: 'refs/heads/main', head: '9999999000000' }, created_at: '2026-11-24T11:35:00Z' },
      { id: 'c1', type: 'CreateEvent', repo: { name: 'krunked-fpv/bitforge-80' }, payload: { ref_type: 'repository' }, created_at: '2026-11-24T10:00:00Z' },
      { id: 'pr1', type: 'PullRequestEvent', repo: { name: 'krunked-fpv/dojo' }, payload: { number: 4, pull_request: { merged: true, title: 'Add sound' } }, created_at: '2026-11-24T09:00:00Z' },
      { id: 'r1', type: 'ReleaseEvent', repo: { name: 'krunked-fpv/dojo' }, payload: { release: { tag_name: 'v1.2.0' } }, created_at: '2026-11-24T08:00:00Z' },
    ];
    const logs = toShipLogs(events, commitIdx);
    expect(logs).toHaveLength(4);
    expect(logs[0]!.label).toBe('PUSH → main ×2');
    expect(logs[0]!.detail).toBe('Ship shader fix');
    expect(logs[1]!.label).toBe('FORGED NEW REPO');
    expect(logs[2]!.label).toBe('PR #4 MERGED');
    expect(logs[3]!.label).toBe('RELEASE');
  });
});

describe('V2 swScope routing predicate', () => {
  it('assigns exact V2 strategies for deck shell/snapshot/manifest/assets/icons while passing through siblings & API', () => {
    const origin = 'https://krunked-fpv.github.io';
    const scope = '/';
    const precache = ['/index.html', '/manifest.webmanifest', '/snapshot.json'];

    expect(swRouteStrategy({ origin, pathname: '/' }, 'navigate', scope, origin, precache)).toBe('network-first');
    expect(swRouteStrategy({ origin, pathname: '/index.html' }, 'navigate', scope, origin, precache)).toBe('network-first');
    expect(swRouteStrategy({ origin, pathname: '/snapshot.json' }, 'cors', scope, origin, precache)).toBe('network-first');
    expect(swRouteStrategy({ origin, pathname: '/manifest.webmanifest' }, 'cors', scope, origin, precache)).toBe('network-first');
    expect(swRouteStrategy({ origin, pathname: '/assets/app-123.js' }, 'no-cors', scope, origin, precache)).toBe('cache-first');
    expect(swRouteStrategy({ origin, pathname: '/favicon.svg' }, 'no-cors', scope, origin, precache)).toBe('swr');
    expect(swRouteStrategy({ origin, pathname: '/icons/icon-192.png' }, 'no-cors', scope, origin, precache)).toBe('swr');

    // Sibling sub-apps & cross-origin API MUST pass through untouched
    expect(shouldHandle({ origin, pathname: '/maul-forge/' }, 'navigate', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin, pathname: '/maul-forge/index.html' }, 'navigate', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin, pathname: '/maul-forge/assets/app.js' }, 'cors', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin, pathname: '/dojo/snapshot.json' }, 'cors', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin: 'https://api.github.com', pathname: '/users/krunked-fpv' }, 'cors', scope, origin, precache)).toBe(false);

    // Subpath deployment safety (e.g., /forge-deck/)
    expect(swRouteStrategy({ origin, pathname: '/forge-deck/' }, 'navigate', '/forge-deck', origin)).toBe('network-first');
    expect(swRouteStrategy({ origin, pathname: '/forge-deck/snapshot.json' }, 'cors', '/forge-deck/', origin)).toBe('network-first');
    expect(shouldHandle({ origin, pathname: '/other-app/' }, 'navigate', '/forge-deck/', origin)).toBe(false);
  });
});
