import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
