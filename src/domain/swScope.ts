export type SwStrategy = 'network-first' | 'cache-first' | 'swr';

function normalizeScope(scopePath: string): string {
  const s = scopePath.startsWith('/') ? scopePath : `/${scopePath}`;
  return s.endsWith('/') ? s : `${s}/`;
}

/**
 * Exact mirror of the routing predicate embedded in the generated service worker (vite/pwaPlugin.ts).
 * The deck's SW scope may cover sibling apps on the same origin; it must ONLY handle
 * the deck's own navigation shell, snapshot.json, manifest.webmanifest, assets/*, favicon.svg,
 * icons/*, and explicitly precached paths — never api.github.com or sibling /<repo>/* apps.
 */
export function swRouteStrategy(
  url: { origin: string; pathname: string },
  mode: string,
  scopePath: string,
  selfOrigin: string,
  precached: readonly string[] = [],
): SwStrategy | null {
  if (url.origin !== selfOrigin) return null;
  const norm = normalizeScope(scopePath);
  const p = url.pathname;
  if (!p.startsWith(norm)) return null;
  const rel = p.slice(norm.length);

  if (mode === 'navigate') {
    return rel === '' || rel === 'index.html' ? 'network-first' : null;
  }

  if (rel === '' || rel === 'index.html' || rel === 'snapshot.json' || rel === 'manifest.webmanifest') {
    return 'network-first';
  }

  if (rel.startsWith('assets/')) {
    return 'cache-first';
  }

  if (rel === 'favicon.svg' || rel.startsWith('icons/')) {
    return 'swr';
  }

  if (precached.includes(p)) {
    return 'cache-first';
  }

  return null;
}

export function shouldHandle(
  url: { origin: string; pathname: string },
  mode: string,
  scopePath: string,
  selfOrigin: string,
  precached: readonly string[] = [],
): boolean {
  return swRouteStrategy(url, mode, scopePath, selfOrigin, precached) !== null;
}
