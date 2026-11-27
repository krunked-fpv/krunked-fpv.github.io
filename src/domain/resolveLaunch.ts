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

function normalizeComparableUrl(raw: string | null | undefined): string | null {
  const safe = sanitizeHttpUrl(raw, undefined, { allowBareDomain: true });
  if (!safe) return null;
  try {
    const u = new URL(safe);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Returns true when a probe actually evaluated candidateUrl (or is a minimal partial probe
 * without a candidateUrl property). Empty snapshot placeholders (candidateUrl: null) and probes
 * recorded for a different previous URL return false so newly published Pages or updated
 * homepages are never demoted by stale probe state.
 */
export function probeAppliesToCandidate(
  probe: Partial<Pick<SnapshotProbe, 'candidateUrl' | 'resolvedUrl'>> | null | undefined,
  candidateUrl: string | null | undefined,
): boolean {
  if (!probe) return false;
  const target = normalizeComparableUrl(candidateUrl);
  if (!target) return false;
  if (!('candidateUrl' in probe) || probe.candidateUrl === undefined) return true;
  const probedCandidate = normalizeComparableUrl(probe.candidateUrl);
  const probedResolved = normalizeComparableUrl(probe.resolvedUrl);
  if (!probedCandidate && !probedResolved) return false;
  return probedCandidate === target || probedResolved === target;
}

/**
 * Precedence: Override/Curation URL -> homepage -> verified GitHub Pages -> null (code-only).
 * Dead Pages Demotion: if no explicit overrideUrl was set and a matching probe reports
 * isNotFound === true or liveVerified === false, demote to null (code).
 */
export function resolveLaunch(
  repo: Pick<GhRepo, 'name' | 'homepage' | 'has_pages'>,
  overrideUrl?: string,
  user: string = GITHUB_USER,
  origin: string = PAGES_ORIGIN,
  probe?: Partial<Pick<SnapshotProbe, 'candidateUrl' | 'liveVerified' | 'isNotFound' | 'resolvedUrl'>> | null,
): string | null {
  const override = sanitizeHttpUrl(overrideUrl, undefined, { allowBareDomain: true });
  if (override) return override;

  const home = sanitizeHttpUrl(repo.homepage, undefined, { allowBareDomain: true });
  const candidate = home ?? pagesCandidateUrl(repo, user, origin);
  if (!candidate) return null;

  if (probe && probeAppliesToCandidate(probe, candidate) && (probe.isNotFound === true || probe.liveVerified === false)) {
    return null;
  }

  return candidate;
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
