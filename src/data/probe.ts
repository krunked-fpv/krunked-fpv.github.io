import { STORAGE_NS } from '../config/site';

export interface ProbeResult {
  isPwa: boolean;
  themeColor: string | null;
  ogImage: string | null;
  description: string | null;
  at: number;
}

const KEY = `${STORAGE_NS}:probe:v1`;
const TTL = 12 * 3_600_000;
let store: Record<string, ProbeResult> | null = null;

function load() {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, ProbeResult>;
  } catch {
    store = {};
  }
  return store;
}

export function getProbe(url: string): ProbeResult | undefined {
  return load()[url];
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function parseProbe(html: string, base: string): Omit<ProbeResult, 'at'> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const abs = (u: string | null | undefined) => {
    if (!u) return null;
    try {
      return new URL(u, base).toString();
    } catch {
      return null;
    }
  };
  return {
    isPwa: !!doc.querySelector('link[rel~="manifest"]'),
    themeColor: doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    ogImage: abs(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')),
    description: doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  };
}

async function probeOne(url: string): Promise<ProbeResult | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    return { ...parseProbe(html, url), at: Date.now() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe live app pages for PWA manifest / theme colour / og:image. Zero API quota. */
export function probeAll(urls: string[], onResult: () => void) {
  const s = load();
  const pending = urls.filter((u) => !s[u] || Date.now() - s[u].at > TTL);
  if (!pending.length) return;
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300);
  idle(async () => {
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const url = pending[i++] as string;
        const r = await probeOne(url);
        // Cache failures briefly as an empty result so we don't hammer dead hosts
        s[url] = r ?? { isPwa: false, themeColor: null, ogImage: null, description: null, at: Date.now() - TTL + 30 * 60_000 };
        onResult();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    save();
  });
}
