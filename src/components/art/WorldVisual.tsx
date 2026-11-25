import { useEffect, useRef, useState } from 'react';
import { renderWorldScene } from '../../art/worldScenes';
import { hueOf } from '../../domain/buildProjects';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme, Project } from '../../types/project';

export type WorldScrim = 'none' | 'subtle' | 'stage' | 'blade';

export interface WorldVisualProps {
  project: Project;
  className?: string;
  animated?: boolean;
  fill?: boolean;
  scrim?: WorldScrim;
  theme?: ArtTheme;
}

const MAX_CACHE = 96;
const staticCache = new Map<string, HTMLCanvasElement>();

const quantize = (n: number) => Math.max(32, Math.ceil(n / 24) * 24);

function buildCacheKey(
  slug: string,
  theme: ArtTheme,
  w: number,
  h: number,
  dpr: number,
  seed: number,
  hue: number,
): string {
  return `${slug}|${theme}|${w}x${h}@${dpr}|${seed}|${Math.round(hue)}`;
}

function getCachedStaticScene(opts: {
  slug: string;
  seed: number;
  hue: number;
  w: number;
  h: number;
  dpr: number;
  theme: ArtTheme;
}): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = buildCacheKey(opts.slug, opts.theme, opts.w, opts.h, opts.dpr, opts.seed, opts.hue);
  const hit = staticCache.get(key);
  if (hit) {
    staticCache.delete(key);
    staticCache.set(key, hit);
    return hit;
  }

  const off = document.createElement('canvas');
  renderWorldScene(off, { ...opts, t: 0 });
  staticCache.set(key, off);
  if (staticCache.size > MAX_CACHE) {
    const oldest = staticCache.keys().next().value;
    if (oldest !== undefined) staticCache.delete(oldest);
  }
  return off;
}

export function clearWorldVisualCache(): void {
  staticCache.clear();
}

function scrimBackground(scrim: WorldScrim, theme: ArtTheme): string | null {
  if (scrim === 'none') return null;

  if (scrim === 'stage') {
    return theme === 'daylight'
      ? [
          'radial-gradient(ellipse 90% 72% at 14% 96%, rgba(245,243,236,0.98) 0%, rgba(245,243,236,0.88) 44%, rgba(245,243,236,0.22) 72%, transparent 90%)',
          'linear-gradient(180deg, rgba(245,243,236,0.26) 0%, transparent 18%, transparent 50%, rgba(245,243,236,0.74) 75%, rgba(245,243,236,0.95) 93%, rgba(245,243,236,0.99) 100%)',
        ].join(', ')
      : [
          'radial-gradient(ellipse 90% 72% at 14% 96%, rgba(3,3,4,0.98) 0%, rgba(3,3,4,0.86) 44%, rgba(3,3,4,0.24) 72%, transparent 90%)',
          'linear-gradient(180deg, rgba(3,3,4,0.34) 0%, transparent 20%, transparent 48%, rgba(3,3,4,0.74) 74%, rgba(3,3,4,0.96) 93%, rgba(3,3,4,0.99) 100%)',
        ].join(', ');
  }

  if (scrim === 'blade') {
    return theme === 'daylight'
      ? [
          'linear-gradient(180deg, rgba(245,243,236,0.62) 0%, rgba(245,243,236,0.08) 24%, rgba(245,243,236,0.08) 56%, rgba(245,243,236,0.8) 82%, rgba(245,243,236,0.96) 100%)',
          'linear-gradient(90deg, rgba(10,10,11,0.08) 0%, transparent 18%, transparent 82%, rgba(10,10,11,0.1) 100%)',
        ].join(', ')
      : [
          'linear-gradient(180deg, rgba(3,3,4,0.68) 0%, rgba(3,3,4,0.1) 24%, rgba(3,3,4,0.14) 54%, rgba(3,3,4,0.84) 80%, rgba(3,3,4,0.97) 100%)',
          'linear-gradient(90deg, rgba(3,3,4,0.34) 0%, transparent 18%, transparent 82%, rgba(3,3,4,0.4) 100%)',
        ].join(', ');
  }

  // 'subtle': preserves upper 72% full-vivid, clean edge feather along bottom 28%
  return theme === 'daylight'
    ? 'linear-gradient(180deg, transparent 70%, rgba(245,243,236,0.26) 86%, rgba(245,243,236,0.58) 100%)'
    : 'linear-gradient(180deg, transparent 70%, rgba(3,3,4,0.32) 86%, rgba(3,3,4,0.66) 100%)';
}

const HEAVIER_SCENES = new Set(['alchemists_ledger', 'learning_languages']);

/**
 * Gallery-grade bespoke generative artwork renderer for each KRUNKED world.
 * Uses quantized ResizeObserver sizing + LRU static cache + smooth visibility-aware rAF animation.
 */
export function WorldVisual({
  project,
  className = '',
  animated = false,
  fill = false,
  scrim = 'subtle',
  theme: themeProp,
}: WorldVisualProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [imgOk, setImgOk] = useState(false);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '480px' });
  const reduced = useReducedMotion();
  const storeTheme = useDeck((s) => s.vault.prefs.theme);
  const theme: ArtTheme = themeProp ?? storeTheme ?? 'obsidian';

  const slug = project.name;
  const hue = hueOf(project);
  const screenshot = project.screenshot;
  const scrimBg = scrimBackground(scrim, theme);

  useEffect(() => {
    setImgOk(false);
  }, [screenshot]);

  // Measure immediately + observe container size quantized to 24px increments
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = (rw: number, rh: number) => {
      if (rw <= 0 || rh <= 0) return;
      const w = quantize(rw);
      const h = quantize(rh);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      measure(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Static LRU-cached render (immediate when in view, idle-scheduled when off-screen)
  useEffect(() => {
    if (!size.w || !size.h || (animated && !reduced && inView)) return;
    const c = canvasRef.current;
    if (!c) return;
    let cancelled = false;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

    const paint = () => {
      if (cancelled) return;
      const src = getCachedStaticScene({
        slug,
        seed: project.art.seed,
        hue,
        w: size.w,
        h: size.h,
        dpr,
        theme,
      });
      if (!src) return;
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext('2d');
      if (ctx) ctx.drawImage(src, 0, 0);
    };

    if (inView) {
      paint();
      return () => {
        cancelled = true;
      };
    }

    const hasIdle = typeof requestIdleCallback === 'function';
    const id = hasIdle
      ? requestIdleCallback(paint, { timeout: 150 })
      : (setTimeout(paint, 16) as unknown as number);
    return () => {
      cancelled = true;
      if (hasIdle && typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [inView, size, slug, project.art.seed, hue, theme, animated, reduced]);

  // Smooth 30-60fps animation loop when active, in view, visible & motion allowed
  useEffect(() => {
    if (!animated || reduced || !size.w || !size.h || !inView) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    const c = canvasRef.current;
    if (!c) return;

    let raf = 0;
    let last = 0;
    const nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = nowFn();
    const dpr = typeof window !== 'undefined' ? Math.min(1.5, window.devicePixelRatio || 1) : 1;
    const minDt = HEAVIER_SCENES.has(slug) ? 28 : 16;

    // Immediate first frame so active stage never flashes blank
    renderWorldScene(c, {
      slug,
      seed: project.art.seed,
      hue,
      w: size.w,
      h: size.h,
      dpr,
      theme,
      t: 0,
    });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (now - last < minDt) return;
      last = now;
      renderWorldScene(c, {
        slug,
        seed: project.art.seed,
        hue,
        w: size.w,
        h: size.h,
        dpr,
        theme,
        t: (now - t0) / 1000,
      });
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animated, reduced, size, inView, slug, project.art.seed, hue, theme]);

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        inViewRef.current = el;
      }}
      className={`${fill ? 'absolute inset-0' : 'relative'} overflow-hidden bg-surface ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full block" />
      {screenshot && (
        <img
          src={screenshot}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setImgOk(true)}
          onError={() => setImgOk(false)}
          className="absolute inset-0 size-full object-cover transition-opacity duration-500"
          style={{ opacity: imgOk ? 1 : 0 }}
        />
      )}
      {scrimBg && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: scrimBg }}
        />
      )}
    </div>
  );
}
