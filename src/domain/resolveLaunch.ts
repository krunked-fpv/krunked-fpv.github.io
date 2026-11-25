import { GITHUB_USER, PAGES_ORIGIN } from '../config/site';
import type { GhRepo, SnapshotProbe } from '../types/github';
import { isSelfDeckRepo, sanitizeHttpUrl } from './sanitize';

/** Canonical GitHub Pages candidate URL for a repository (null if has_pages is false). */
export function pagesCandidateUrl(
  repo: Pick<GhRepo, 'name' | 'has_pages'>,
  user: string = GITHUB_USER,
  origin: string = PAGES_ORIGIN,
): string | null {
  if (!repo.has_pages) return null;
  const cleanOrigin = origin.replace(/\/+$/, '');
  if (isSelfDeckRepo(repo.name, user)) return `${cleanOrigin}/`;
  return `${cleanOrigin}/${repo.name}/`;
}

/**
 * Precedence: Override/Curation URL -> homepage -> verified GitHub Pages -> null (code-only).
 * Dead Pages Demotion: if no explicit overrideUrl was set and probe reports
 * isNotFound === true or liveVerified === false, demote to null (code).
 */
export function resolveLaunch(
  repo: Pick<GhRepo, 'name' | 'homepage' | 'has_pages'>,
  overrideUrl?: string,
  user: string = GITHUB_USER,
  origin: string = PAGES_ORIGIN,
  probe?: Partial<Pick<SnapshotProbe, 'liveVerified' | 'isNotFound' | 'resolvedUrl'>> | null,
): string | null {
  const override = sanitizeHttpUrl(overrideUrl, undefined, { allowBareDomain: true });
  if (override) return override;

  if (probe && (probe.isNotFound === true || probe.liveVerified === false)) {
    return null;
  }

  const home = sanitizeHttpUrl(repo.homepage, undefined, { allowBareDomain: true });
  if (home) return home;

  const pages = pagesCandidateUrl(repo, user, origin);
  if (pages) return pages;

  return null;
}

function normalizeRoutePath(pathname: string): string {
  let p = pathname.replace(/\/{2,}/g, '/');
  p = p.replace(/\/index\.html?$/i, '/');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p.toLowerCase();
}

export interface LocationLike {
  origin: string;
  pathname: string;
}

/**
 * Guard against recursive deck-in-deck iframe embedding.
 * Blocks http(s)://<owner>.github.io/ root (and /index.html) AND the current origin+pathname,
 * while permitting sibling sub-apps under /<repo>/.
 */
export function isSelfHostedPeekTarget(
  url: string | null | undefined,
  currentLocation?: LocationLike | string | null,
  owner: string = GITHUB_USER,
): boolean {
  const safe = sanitizeHttpUrl(url);
  if (!safe) return false;

  let target: URL;
  try {
    target = new URL(safe);
  } catch {
    return false;
  }

  const targetPath = normalizeRoutePath(target.pathname);
  const canonicalHost = `${owner.trim().toLowerCase()}.github.io`;
  if (target.hostname.toLowerCase() === canonicalHost && targetPath === '/') {
    return true;
  }

  let curOrigin: string | null = null;
  let curPath: string | null = null;

  if (typeof currentLocation === 'string' && currentLocation) {
    try {
      const u = new URL(currentLocation);
      curOrigin = u.origin;
      curPath = u.pathname;
    } catch {
      /* ignore malformed currentLocation */
    }
  } else if (currentLocation && typeof currentLocation === 'object') {
    curOrigin = currentLocation.origin;
    curPath = currentLocation.pathname;
  } else if (currentLocation === undefined && typeof window !== 'undefined' && window.location) {
    curOrigin = window.location.origin;
    curPath = window.location.pathname;
  }

  if (curOrigin && curPath !== null) {
    if (
      target.origin.toLowerCase() === curOrigin.toLowerCase() &&
      targetPath === normalizeRoutePath(curPath)
    ) {
      return true;
    }
  }

  return false;
}
