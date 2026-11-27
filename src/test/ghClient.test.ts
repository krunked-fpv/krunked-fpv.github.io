import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichCommits, fetchReadme, sanitizeReadme } from '../data/enrich';
import {
  AuthError,
  fetchRateLimit,
  ghFetch,
  OfflineError,
  RateLimitedError,
  syncDisabled,
  SyncDisabledError,
} from '../data/ghClient';
import { _resetForTests, clearAll } from '../data/httpCache';
import { _resetProbesForTests, canClientProbe, getProbeBySlug, isFreshProbe, seedProbes } from '../data/probe';
import { _resetRateForTests, parseRetryAfterMs, setRate } from '../data/rateLimit';
import { collectProbeTargets } from '../data/syncEngine';
import type { GhRepo } from '../types/github';
import { clearPat, setPat } from '../vault/patStore';

const mkRepo = (): GhRepo => ({
  id: 1,
  name: 'maul-forge',
  full_name: 'krunked-fpv/maul-forge',
  html_url: 'https://github.com/krunked-fpv/maul-forge',
  description: null,
  homepage: null,
  has_pages: true,
  language: 'JavaScript',
  topics: [],
  stargazers_count: 0,
  forks_count: 0,
  size: 100,
  default_branch: 'main',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-24T00:00:00Z',
  pushed_at: '2026-11-24T00:00:00Z',
  fork: false,
  archived: false,
});

describe('ghClient V2: ETag, 304 recovery, PAT firewall, backoff & ?sync=off silence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearPat();
    _resetForTests();
    _resetRateForTests();
    _resetProbesForTests();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPat();
    clearAll();
    window.history.replaceState(null, '', '/');
  });

  it('stores ETag on 200, sends If-None-Match on next call, and returns cached data on 304', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1, name: 'maul-forge' }]), {
          status: 200,
          headers: {
            ETag: 'W/"abc"',
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await ghFetch<{ id: number; name: string }[]>('/users/krunked-fpv/repos');
    expect(first.source).toBe('network');
    expect(first.data[0]?.name).toBe('maul-forge');

    const second = await ghFetch<{ id: number; name: string }[]>('/users/krunked-fpv/repos');
    expect(second.source).toBe('etag');
    expect(second.data[0]?.name).toBe('maul-forge');

    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((secondInit.headers as Record<string, string>)['If-None-Match']).toBe('W/"abc"');
    expect(secondInit.cache).toBe('no-store');
  });

  it('recovers from an unexpected 304 cache miss with a single unconditional retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 7, name: 'dojo' }]), {
          status: 200,
          headers: { ETag: 'W/"retry-ok"' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await ghFetch<{ id: number; name: string }[]>('/users/krunked-fpv/repos');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.source).toBe('network');
    expect(res.data[0]?.name).toBe('dojo');
  });

  it('enforces assertGitHubApiOrigin PAT firewall and rejects non-api.github.com origins before fetch', async () => {
    setPat('ghp_1234567890abcdef1234567890abcdef', 'session');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const forbidden = [
      'https://evil.example.com/users/krunked-fpv',
      'http://api.github.com/users/krunked-fpv',
      'https://api.github.com.evil.com/users/krunked-fpv',
      'https://attacker:pass@api.github.com/users/krunked-fpv',
      'https://api.github.com:8443/users/krunked-fpv',
    ];
    for (const bad of forbidden) {
      await expect(ghFetch(bad)).rejects.toThrow(/Blocked credential leak/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // Legitimate api.github.com request attaches Bearer token
    await ghFetch('/users/krunked-fpv');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ghp_1234567890abcdef1234567890abcdef');
  });

  it('handles primary 403, secondary 403, numeric Retry-After, HTTP-date Retry-After, and 401 AuthError', async () => {
    const now = Date.now();
    expect(parseRetryAfterMs('90', now)).toBe(90_000);
    const futureDate = new Date(now + 120_000).toUTCString();
    const parsedDateMs = parseRetryAfterMs(futureDate, now);
    expect(parsedDateMs).not.toBeNull();
    expect(parsedDateMs!).toBeGreaterThan(100_000);
    expect(parseRetryAfterMs('not-a-date', now)).toBeNull();

    // Primary 403 quota=0
    const resetSec = Math.floor(now / 1000) + 1800;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(resetSec),
          },
        }),
      ),
    );
    await expect(ghFetch('/users/krunked-fpv/repos')).rejects.toBeInstanceOf(RateLimitedError);

    // Secondary 403 (remaining > 0, abuse/secondary body)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), {
          status: 403,
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '42',
            'x-ratelimit-reset': String(resetSec),
          },
        }),
      ),
    );
    await expect(ghFetch('/users/krunked-fpv/events')).rejects.toBeInstanceOf(RateLimitedError);

    // 429 with HTTP-date Retry-After -> finite resetAt (never NaN)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('Slow down', {
          status: 429,
          headers: { 'retry-after': futureDate },
        }),
      ),
    );
    try {
      await ghFetch('/users/krunked-fpv/events');
      expect.fail('Expected RateLimitedError');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitedError);
      expect(Number.isFinite((e as RateLimitedError).resetAt)).toBe(true);
      expect((e as RateLimitedError).resetAt).toBeGreaterThan(now);
    }

    // 401 with configured PAT throws AuthError
    setPat('ghp_invalidtoken1234567890', 'session');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Bad credentials', { status: 401 })));
    await expect(ghFetch('/users/krunked-fpv')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws OfflineError on fetch rejection and skips enrichment when quota is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    await expect(ghFetch('/users/krunked-fpv/repos')).rejects.toBeInstanceOf(OfflineError);

    setRate({
      limit: 60,
      remaining: 3,
      reset: Math.floor(Date.now() / 1000) + 1800,
      used: 57,
      pollInterval: 60,
      updatedAt: Date.now(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await enrichCommits(mkRepo())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces total network silence under ?sync=off and skips cross-origin localhost probes', async () => {
    window.history.replaceState(null, '', '/?sync=off');
    expect(syncDisabled()).toBe(true);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(ghFetch('/users/krunked-fpv/repos')).rejects.toBeInstanceOf(SyncDisabledError);
    expect(await fetchRateLimit()).toBeNull();
    expect(await enrichCommits(mkRepo())).toBe(false);
    expect(await fetchReadme(mkRepo())).toBeNull();
    expect(canClientProbe('https://krunked-fpv.github.io/dojo/')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    // Even without ?sync=off, localhost/non-PAGES_ORIGIN skips cross-origin probes (zero CORS spam)
    window.history.replaceState(null, '', '/');
    expect(canClientProbe('https://krunked-fpv.github.io/dojo/')).toBe(false);

    // README sanitization strips scripts, iframes, and javascript: links
    const clean = sanitizeReadme(
      '<script>alert(1)</script><iframe src="https://evil.com"></iframe><a href="javascript:alert(1)">bad</a><a href="./docs/guide.md">Guide</a><img src="javascript:x" /><img src="./shot.png" />',
      'dojo',
      'main',
    );
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('https://github.com/krunked-fpv/dojo/blob/main/docs/guide.md');
    expect(clean).toContain('https://raw.githubusercontent.com/krunked-fpv/dojo/main/shot.png');
  });

  it('ignores empty snapshot placeholder probes and mismatched URL probes in seedProbes / getProbeBySlug', () => {
    seedProbes({
      'krunked-n-fred': {
        candidateUrl: null,
        resolvedUrl: null,
        liveVerified: false,
        httpStatus: null,
        isNotFound: false,
        isPwa: false,
        title: null,
        subtitle: null,
        description: null,
        themeColor: null,
        ogImage: null,
        iconUrl: null,
        manifest: null,
        probedAt: '2026-11-26T23:52:47.964Z',
      },
      'moved-app': {
        candidateUrl: 'https://old.example.dev/app/',
        resolvedUrl: null,
        liveVerified: false,
        httpStatus: 404,
        isNotFound: true,
        isPwa: false,
        title: null,
        subtitle: null,
        description: null,
        themeColor: null,
        ogImage: null,
        iconUrl: null,
        manifest: null,
        probedAt: '2026-11-26T23:52:47.964Z',
      },
    });

    expect(getProbeBySlug('krunked-n-fred', 'https://krunked-fpv.github.io/krunked-n-fred/')).toBeUndefined();
    expect(getProbeBySlug('moved-app', 'https://new.example.dev/app/')).toBeUndefined();
    expect(getProbeBySlug('moved-app', 'https://old.example.dev/app/')?.isNotFound).toBe(true);
  });

  it('invalidates 404 probes on newer pushes, after 30m negative TTL, or on force sync, and collects raw candidate targets', () => {
    const probedAt = '2026-11-26T23:52:47.000Z';
    const baseMs = Date.parse(probedAt);
    const deadProbe = {
      candidateUrl: 'https://krunked-fpv.github.io/new-world/',
      resolvedUrl: null,
      liveVerified: false,
      httpStatus: 404,
      isNotFound: true,
      isPwa: false,
      title: null,
      subtitle: null,
      description: null,
      themeColor: null,
      ogImage: null,
      iconUrl: null,
      manifest: null,
      probedAt,
    };
    const liveProbe = {
      ...deadProbe,
      resolvedUrl: deadProbe.candidateUrl,
      liveVerified: true,
      httpStatus: 200,
      isNotFound: false,
    };

    // Negative 404 probe stays fresh for <30m when untouched, expires after 30m (not 12h),
    // and immediately invalidates on a newer push or force sync.
    expect(isFreshProbe(deadProbe, baseMs + 10 * 60_000, deadProbe.candidateUrl, '2026-11-26T23:50:00Z')).toBe(true);
    expect(isFreshProbe(deadProbe, baseMs + 31 * 60_000, deadProbe.candidateUrl, '2026-11-26T23:50:00Z')).toBe(false);
    expect(isFreshProbe(deadProbe, baseMs + 5 * 60_000, deadProbe.candidateUrl, '2026-11-26T23:55:00Z')).toBe(false);
    expect(isFreshProbe(deadProbe, baseMs + 5 * 60_000, deadProbe.candidateUrl, '2026-11-26T23:50:00Z', true)).toBe(false);

    // Verified live probe stays fresh even on newer push and force sync within 12h TTL.
    expect(isFreshProbe(liveProbe, baseMs + 60 * 60_000, liveProbe.candidateUrl, '2026-11-27T00:30:00Z', true)).toBe(true);

    // collectProbeTargets keeps previously-404 Pages repos eligible for re-probing while skipping self-deck/hidden/code-only repos
    seedProbes({ 'new-world': deadProbe });
    const targets = collectProbeTargets([
      { ...mkRepo(), name: 'new-world', has_pages: true, pushed_at: '2026-11-26T23:55:00Z' },
      { ...mkRepo(), name: 'code-only', has_pages: false, homepage: null },
      { ...mkRepo(), name: 'krunked-fpv.github.io', has_pages: true },
    ]);
    expect(targets).toEqual([
      {
        slug: 'new-world',
        url: 'https://krunked-fpv.github.io/new-world/',
        pushedAt: '2026-11-26T23:55:00Z',
      },
    ]);
  });
});
