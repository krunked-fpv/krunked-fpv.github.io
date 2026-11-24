import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichCommits } from '../data/enrich';
import { ghFetch, OfflineError, RateLimitedError } from '../data/ghClient';
import { _resetForTests, clearAll } from '../data/httpCache';
import { _resetRateForTests, setRate } from '../data/rateLimit';
import type { GhRepo } from '../types/github';

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

describe('ghClient ETag, rate-limit, offline & budget guard', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetForTests();
    _resetRateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAll();
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

  it('throws RateLimitedError on 403 when quota is 0', async () => {
    const resetSec = Math.floor(Date.now() / 1000) + 1800;
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
  });

  it('throws OfflineError on fetch network rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    await expect(ghFetch('/users/krunked-fpv/repos')).rejects.toBeInstanceOf(OfflineError);
  });

  it('skips enrichment network calls when budget is exhausted', async () => {
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

    const ran = await enrichCommits(mkRepo());
    expect(ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
