import { renderCover, type RenderOpts } from './renderCover';

const cache = new Map<string, HTMLCanvasElement>();
const MAX = 80;

export const coverKey = (o: RenderOpts) => `${o.seed}|${o.style}|${Math.round(o.hue)}|${o.w}x${o.h}@${o.dpr ?? 1}`;

/** Memoised static cover (t = 0). Returns an offscreen canvas to blit from. */
export function getCover(o: Omit<RenderOpts, 't'>): HTMLCanvasElement {
  const key = coverKey(o);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = document.createElement('canvas');
  renderCover(c, o);
  cache.set(key, c);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  return c;
}
