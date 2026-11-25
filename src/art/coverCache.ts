import { renderCover, type RenderOpts } from './renderCover';

const cache = new Map<string, HTMLCanvasElement>();
const MAX = 96;

export const coverKey = (o: RenderOpts) =>
  `${o.seed}|${o.style}|${o.theme ?? 'obsidian'}|${Math.round(o.hue)}|${o.w}x${o.h}@${o.dpr ?? 1}`;

/** Memoised static cover (t = 0) keyed by seed, style, theme, hue, dimensions & DPR. */
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
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return c;
}

/** Evicts all cached procedural cover canvases. */
export function clearCoverCache() {
  cache.clear();
}
