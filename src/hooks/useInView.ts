import { useEffect, useRef, useState } from 'react';

/** True while the element intersects the viewport (with margin). Sticky once seen if `once`. */
export function useInView<T extends Element>(opts: { once?: boolean; margin?: string } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        setInView(e.isIntersecting);
        if (e.isIntersecting && opts.once) io.disconnect();
      },
      { rootMargin: opts.margin ?? '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [opts.once, opts.margin]);
  return [ref, inView] as const;
}
