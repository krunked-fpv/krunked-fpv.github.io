import { useEffect, useRef, useState } from 'react';
import { getCover } from '../../art/coverCache';
import { renderCover } from '../../art/renderCover';
import { hueOf } from '../../domain/buildProjects';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import type { Project } from '../../types/project';

interface Props {
  project: Project;
  className?: string;
  animated?: boolean;
  fill?: boolean;
}

/** Image precedence: override screenshot > probed og:image > procedural canvas (always drawn underneath). */
export function CoverArt({ project, className = '', animated = false, fill = false }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [imgOk, setImgOk] = useState(false);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '240px' });
  const reduced = useReducedMotion();
  const img = project.screenshot ?? project.ogImage;
  const hue = hueOf(project);

  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const q = (n: number) => Math.max(32, Math.ceil(n / 24) * 24);
      const w = q(e.contentRect.width);
      const h = q(e.contentRect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // static render (memoised, scheduled on idle to keep scroll silky)
  useEffect(() => {
    if (!seen || !size.w || (animated && !reduced)) return;
    const c = canvas.current;
    if (!c) return;
    let cancelled = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const paint = () => {
      if (cancelled) return;
      const src = getCover({ seed: project.art.seed, style: project.art.style, hue, w: size.w, h: size.h, dpr });
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
    };
    const id =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(paint, { timeout: 120 })
        : (setTimeout(paint, 0) as unknown as number);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [seen, size, project.art.seed, project.art.style, hue, animated, reduced]);

  // animated loop (lead tile): in view + visible + motion allowed
  useEffect(() => {
    if (!animated || reduced || !seen || !size.w || !inView) return;
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
      renderCover(c, { seed: project.art.seed, style: project.art.style, hue, w: size.w, h: size.h, dpr, t: (now - t0) / 1000 });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animated, reduced, seen, size, inView, project.art.seed, project.art.style, hue]);

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        inViewRef.current = el;
      }}
      className={`${fill ? 'absolute inset-0' : 'relative'} overflow-hidden bg-ob-900 ${className}`}
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
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,8,10,0) 40%, rgba(13,16,21,0.85) 100%)' }} />
    </div>
  );
}
