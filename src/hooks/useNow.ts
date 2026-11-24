import { useSyncExternalStore } from 'react';

let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  current = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, 1000);
    document.addEventListener('visibilitychange', tick);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

/** Shared 1s ticker. Returns epoch ms floored to `granularity`, so consumers only re-render on bucket change. */
export function useNow(granularity = 1000): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(current / granularity) * granularity,
    () => Math.floor(Date.now() / granularity) * granularity,
  );
}
