import { useCallback, useEffect, useRef } from 'react';

/** Pointer-tracked specular highlight: writes --mx/--my only (never React state). */
export function useSpecular<T extends HTMLElement = HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener('pointermove', move, { passive: true });
    cleanup.current = () => {
      el.removeEventListener('pointermove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

export function useStableCallback<A extends unknown[], R>(fn: (...a: A) => R) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...a: A) => ref.current(...a), []);
}
