/**
 * Mirror of the predicate embedded in the generated service worker (vite/pwaPlugin.ts).
 * The deck's SW scope may cover sibling apps on the same origin; it must only ever
 * answer for the deck's own navigation URL and its own /assets/ + precached files.
 */
export function shouldHandle(
  url: { origin: string; pathname: string },
  mode: string,
  scopePath: string,
  selfOrigin: string,
  precached: readonly string[] = [],
): boolean {
  if (url.origin !== selfOrigin) return false;
  const p = url.pathname;
  if (mode === 'navigate') return p === scopePath || p === `${scopePath}index.html`;
  if (p.startsWith(`${scopePath}assets/`)) return true;
  return precached.includes(p);
}
