import { useEffect, useRef, useState } from 'react';
import { getCover } from '../../art/coverCache';
import { renderCover } from '../../art/renderCover';
import { hueOf } from '../../domain/buildProjects';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme, Project } from '../../types/project';

export type CoverScrim = 'none' | 'subtle' | 'stage';

export interface CoverArtProps {
  project: Project;
  className?: string;
  animated?: boolean;
  fill?: boolean;
  theme?: ArtTheme;
  /**
   * Contextual readability veil over the procedural print:
   * - 'none': unobstructed museum print
   * - 'subtle' (default): delicate bottom edge feather for gallery cards & glyphs
   * - 'stage': sculpted dual-axis editorial veil for Hero Stage typography
   */
  scrim?: CoverScrim;
}

const quantize = (n: number) => Math.max(32, Math.ceil(n / 24) * 24);

function scrimBackground(scrim: CoverScrim, theme: ArtTheme): string | null {
  if (scrim === 'none') return null;

  if (scrim === 'stage') {
    return theme === 'daylight'
      ? [
          'radial-gradient(ellipse 96% 68% at 20% 96%, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.64) 48%, transparent 80%)',
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0.48) 44%, rgba(255,255,255,0.9) 68%, rgba(255,255,255,0.97) 90%, rgba(255,255,255,0.99) 100%)',
        ].join(', ')
      : [
          'radial-gradient(ellipse 96% 68% at 20% 96%, rgba(6,7,9,0.9) 0%, rgba(6,7,9,0.56) 48%, transparent 80%)',
          'linear-gradient(180deg, rgba(6,7,9,0.12) 0%, rgba(6,7,9,0.06) 22%, rgba(6,7,9,0.48) 44%, rgba(6,7,9,0.88) 68%, rgba(6,7,9,0.97) 90%, rgba(6,7,9,0.99) 100%)',
        ].join(', ');
  }

  // 'subtle': preserves full artwork vibrancy across upper 70%, gentle feather at bottom edge
  return theme === 'daylight'
    ? 'linear-gradient(180deg, transparent 58%, rgba(255,255,255,0.22) 82%, rgba(255,255,255,0.52) 100%)'
    : 'linear-gradient(180deg, transparent 56%, rgba(6,7,9,0.26) 80%, rgba(6,7,9,0.56) 100%)';
}

/**
 * Dual-theme procedural cover art renderer.
 * Image precedence: override screenshot > probed og:image > procedural canvas (always drawn underneath).
 */
export function CoverArt({
  project,
  className = '',
  animated = false,
  fill = false,
  theme: themeProp,
  scrim = 'subtle',
}: CoverArtProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [imgOk, setImgOk] = useState(false);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '480px' });
  const reduced = useReducedMotion();
  const storeTheme = useDeck((s) => s.vault.prefs.theme);
  const theme: ArtTheme = themeProp ?? storeTheme ?? 'obsidian';

  const img = project.screenshot ?? project.ogImage;
  const hue = hueOf(project);
  const scrimBg = scrimBackground(scrim, theme);

  // Reset loaded flag when image URL changes
  useEffect(() => {
    setImgOk(false);
  }, [img]);

  // Measure immediately + track resize (quantized to 24px increments for high cache hit rate)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    const measure = (rectWidth: number, rectHeight: number) => {
      if (rectWidth <= 0 || rectHeight <= 0) return;
      const w = quantize(rectWidth);
      const h = quantize(rectHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };

    const initial = el.getBoundingClientRect();
    measure(initial.width, initial.height);

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      measure(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Static render: immediate when in-view, idle-scheduled when off-screen so zero cards remain blank
  useEffect(() => {
    if (!size.w || !size.h || (animated && !reduced && inView)) return;
    const c = canvas.current;
    if (!c) return;
    let cancelled = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const paint = () => {
      if (cancelled) return;
      const src = getCover({
        seed: project.art.seed,
        style: project.art.style,
        hue,
        w: size.w,
        h: size.h,
        dpr,
        theme,
      });
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
    };

    if (inView) {
      paint();
      return () => {
        cancelled = true;
      };
    }

    const id =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(paint, { timeout: 150 })
        : (setTimeout(paint, 16) as unknown as number);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [inView, size, project.art.seed, project.art.style, hue, theme, animated, reduced]);

  // Smooth rAF loop (featured exhibition stage): active only when in view + visible + motion allowed
  useEffect(() => {
    if (!animated || reduced || !size.w || !size.h || !inView) return;
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const minDt = project.art.style === 'topo' ? 33 : 16;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible' || now - last < minDt) return;
      last = now;
      renderCover(c, {
        seed: project.art.seed,
        style: project.art.style,
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
  }, [animated, reduced, size, inView, project.art.seed, project.art.style, hue, theme]);

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        inViewRef.current = el;
      }}
      className={`${fill ? 'absolute inset-0' : 'relative'} overflow-hidden bg-surface ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {img && (
        <img
          src={img}
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
