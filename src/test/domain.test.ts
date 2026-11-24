import { describe, expect, it } from 'vitest';
import { heatStrip, sparkline, velocity } from '../domain/activity';
import { classify } from '../domain/classify';
import { badgeLabel, formatDelta, freshnessOf } from '../domain/freshness';
import { fuzzyFields, fuzzyMatch } from '../domain/fuzzy';
import { humanizeName } from '../domain/humanize';
import { resolveLaunch } from '../domain/resolveLaunch';
import { toShipLogs } from '../domain/shiplog';
import { shouldHandle } from '../domain/swScope';
import type { CommitLite, GhEvent, GhRepo } from '../types/github';

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

describe('resolveLaunch', () => {
  it('prefers override, then homepage, then Pages, and maps user site to root', () => {
    expect(resolveLaunch({ name: 'a', homepage: 'https://x.dev', has_pages: true }, 'https://override.dev/')).toBe(
      'https://override.dev/',
    );
    expect(resolveLaunch({ name: 'a', homepage: 'example.com/app', has_pages: true })).toBe('https://example.com/app');
    expect(resolveLaunch({ name: 'maul-forge', homepage: '', has_pages: true })).toBe('https://krunked-fpv.github.io/maul-forge/');
    expect(resolveLaunch({ name: 'krunked-fpv.github.io', homepage: null, has_pages: true })).toBe('https://krunked-fpv.github.io/');
    expect(resolveLaunch({ name: 'KRUNKED-FPV.GITHUB.IO', homepage: null, has_pages: true })).toBe('https://krunked-fpv.github.io/');
    expect(resolveLaunch({ name: 'chroma-cosmos', homepage: null, has_pages: false })).toBeNull();
  });
});

describe('classify & humanize', () => {
  it('classifies keywords and sizes accurately', () => {
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
  });

  it('humanizes names and preserves acronyms', () => {
    expect(humanizeName('discogs_sniper')).toBe('Discogs Sniper');
    expect(humanizeName('bitforge-80')).toBe('Bitforge 80');
    expect(humanizeName('clausehound-ai')).toBe('Clausehound AI');
    expect(humanizeName('chaosdeck-sre')).toBe('Chaosdeck SRE');
  });
});

describe('freshness & delta formatting', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('computes tiers and beacons properly', () => {
    const f1 = freshnessOf('2026-11-24T11:48:00Z', now);
    expect(f1.tier).toBe('fresh');
    expect(f1.pulse).toBe(true);
    expect(badgeLabel('2026-11-24T11:48:00Z', now)).toBe('SHIPPED 12m AGO');

    const f2 = freshnessOf('2026-11-22T12:00:00Z', now);
    expect(f2.tier).toBe('active');
    expect(f2.pulse).toBe(true);
    expect(badgeLabel('2026-11-22T12:00:00Z', now)).toBe('UPDATED 2d AGO');

    const f3 = freshnessOf('2026-11-19T12:00:00Z', now);
    expect(f3.tier).toBe('active');
    expect(f3.pulse).toBe(false);

    const f4 = freshnessOf('2026-10-01T12:00:00Z', now);
    expect(f4.tier).toBe('idle');
    expect(f4.pulse).toBe(false);
  });

  it('formats deltas across units', () => {
    expect(formatDelta(45_000)).toBe('45s');
    expect(formatDelta(12 * 60_000)).toBe('12m');
    expect(formatDelta(3 * 3_600_000)).toBe('3h');
    expect(formatDelta(5 * 86_400_000)).toBe('5d');
    expect(formatDelta(35 * 86_400_000)).toBe('5w');
    expect(formatDelta(95 * 86_400_000)).toBe('3mo');
  });
});

describe('fuzzy matching', () => {
  it('ranks prefix/exact matches above sparse subsequences and returns highlight indices', () => {
    const exact = fuzzyMatch('sky', 'krunked_skymap');
    const sparse = fuzzyMatch('sky', 'solar_kernel_yard');
    expect(exact).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(exact!.score).toBeGreaterThan(sparse!.score);
    expect(exact!.indices).toEqual([8, 9, 10]);
  });

  it('weights fields accurately', () => {
    const res = fuzzyFields('audio', [
      { text: 'discogs_sniper', weight: 1 },
      { text: 'Audio/Vinyl', weight: 0.7 },
    ]);
    expect(res?.field).toBe(1);
  });
});

describe('activity & shiplog', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('buckets commits and push dates into sparklines & 90-day heatstrip', () => {
    const commits: CommitLite[] = [
      { sha: 'aaa', message: 'one', date: '2026-11-24T09:00:00Z', author: 'k' },
      { sha: 'bbb', message: 'two', date: '2026-11-24T10:00:00Z', author: 'k' },
      { sha: 'ccc', message: 'prev', date: '2026-11-23T10:00:00Z', author: 'k' },
    ];
    const s = sparkline(commits, [], now, 14);
    expect(s).toHaveLength(14);
    expect(s[13]).toBe(2);
    expect(s[12]).toBe(1);
    expect(velocity(3, 1, 100)).toBe(7);

    const events: GhEvent[] = [
      { id: '1', type: 'PushEvent', repo: { name: 'krunked-fpv/dojo' }, payload: { ref: 'refs/heads/main', head: '1234567abcdef' }, created_at: '2026-11-24T08:00:00Z' },
    ];
    const strip = heatStrip(events, [mkRepo({ name: 'maul-forge', pushed_at: '2026-11-24T05:00:00Z' })], now, 90);
    expect(strip).toHaveLength(90);
    expect(strip[89]!.count).toBe(2);
  });

  it('translates trimmed PushEvents, groups pushes within 30m, and skips WatchEvent', () => {
    const commitIdx = new Map<string, CommitLite>([
      ['abcdef1234567', { sha: 'abcdef1234567', message: 'Ship shader fix', date: '2026-11-24T11:50:00Z', author: 'k' }],
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
    expect(logs[3]!.detail).toBe('v1.2.0');
  });
});

describe('swScope predicate', () => {
  it('handles deck navigation and assets while ignoring sibling apps and API', () => {
    const origin = 'https://krunked-fpv.github.io';
    const scope = '/';
    const precache = ['/index.html', '/manifest.webmanifest'];
    expect(shouldHandle({ origin, pathname: '/' }, 'navigate', scope, origin, precache)).toBe(true);
    expect(shouldHandle({ origin, pathname: '/index.html' }, 'navigate', scope, origin, precache)).toBe(true);
    expect(shouldHandle({ origin, pathname: '/assets/app-123.js' }, 'no-cors', scope, origin, precache)).toBe(true);
    expect(shouldHandle({ origin, pathname: '/maul-forge/' }, 'navigate', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin, pathname: '/maul-forge/assets/app.js' }, 'cors', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin, pathname: '/snapshot.json' }, 'cors', scope, origin, precache)).toBe(false);
    expect(shouldHandle({ origin: 'https://api.github.com', pathname: '/users/krunked-fpv' }, 'cors', scope, origin, precache)).toBe(false);
  });
});
