import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { BRAND, FULL_BRAND, THEME_COLORS } from '../src/config/site.ts';

export const SHELL_PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './snapshot.json',
] as const;

export const ICON_PRECACHE = [
  './favicon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
] as const;

/**
 * Filter emitted Vite assets for SW install precaching:
 * - Always precache hashed JS & CSS bundles and emitted SVG/PNG assets.
 * - Precache ONLY Latin .woff2 font subsets so install never downloads
 *   unused cyrillic/greek/vietnamese/latin-ext/legacy .woff font files.
 *   (Other subsets remain runtime cache-first if a user's content needs them.)
 */
export function isPrecachedAsset(fileName: string): boolean {
  if (!fileName.startsWith('assets/')) return false;
  if (/\.(?:js|css|svg|png)$/i.test(fileName)) return true;
  if (/\.woff2$/i.test(fileName)) {
    return /-latin-(?!ext-)/i.test(fileName) || !/-(?:cyrillic|greek|vietnamese|latin-ext)-/i.test(fileName);
  }
  return false;
}

export function buildManifest(): string {
  return JSON.stringify(
    {
      name: FULL_BRAND,
      short_name: BRAND.shortName,
      description: BRAND.tagline,
      id: './',
      start_url: './',
      scope: './',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone'],
      orientation: 'any',
      background_color: THEME_COLORS.obsidian,
      theme_color: THEME_COLORS.obsidian,
      categories: ['utilities', 'developer', 'games'],
      icons: [
        { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: './icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        {
          name: 'Command Launcher',
          short_name: 'Search',
          description: 'Open fuzzy command launcher',
          url: './#palette',
          icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
        },
        {
          name: 'Vault & Diagnostics',
          short_name: 'Settings',
          description: 'Open preferences, vault health, and API diagnostics',
          url: './#settings',
          icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
        },
      ],
    },
    null,
    2,
  );
}

export function buildServiceWorker(precache: readonly string[], version: string): string {
  const list = JSON.stringify(precache);
  const noCacheSet = JSON.stringify(SHELL_PRECACHE);
  // Scope-safe SW for user-site root (/): sibling apps live at /<repo>/ on the same origin.
  // Mirrors src/domain/swScope.ts: NEVER intercepts cross-origin (api.github.com) or sibling /<repo>/*.
  return `const CACHE = 'forge-deck-v2-${version}';
const PRECACHE = ${list};
const NO_CACHE_SHELL = new Set(${noCacheSet});

function normalizeScope(scope) {
  const s = scope.startsWith('/') ? scope : '/' + scope;
  return s.endsWith('/') ? s : s + '/';
}

function scopePath() {
  const raw = (self.registration && self.registration.scope) || self.location.href;
  return normalizeScope(new URL(raw).pathname);
}

function toAbsolute(rel, scope) {
  return scope + rel.replace(/^\\.\\//, '');
}

function swRouteStrategy(url, mode, scope, origin, precachedAbs) {
  if (url.origin !== origin) return null;
  const norm = normalizeScope(scope);
  const p = url.pathname;
  if (!p.startsWith(norm)) return null;
  const rel = p.slice(norm.length);

  if (mode === 'navigate') {
    return rel === '' || rel === 'index.html' ? 'network-first' : null;
  }
  if (rel === '' || rel === 'index.html' || rel === 'snapshot.json' || rel === 'manifest.webmanifest') {
    return 'network-first';
  }
  if (rel.startsWith('assets/')) {
    return 'cache-first';
  }
  if (rel === 'favicon.svg' || rel.startsWith('icons/')) {
    return 'swr';
  }
  if (precachedAbs.includes(p)) {
    return 'cache-first';
  }
  return null;
}

function isCacheable(res) {
  return Boolean(res && res.status === 200 && res.type === 'basic');
}

function offlineResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function networkFirst(event, req, scope, rel) {
  const cache = await caches.open(CACHE);
  const fetchReq =
    rel === 'snapshot.json' || rel === 'manifest.webmanifest'
      ? new Request(req.url, { cache: 'no-cache' })
      : req;

  try {
    const res = await fetch(fetchReq);
    if (isCacheable(res)) {
      const copy = res.clone();
      const writes = [cache.put(req, copy)];
      if (rel === '' || rel === 'index.html') {
        writes.push(cache.put(scope + 'index.html', res.clone()));
      }
      event.waitUntil(Promise.all(writes).catch(() => {}));
      return res;
    }
    if (res && res.status < 500) {
      return res;
    }
    const fallback =
      (await cache.match(req)) ||
      (rel === '' || rel === 'index.html'
        ? (await cache.match(scope + 'index.html')) || (await cache.match(scope))
        : null);
    return fallback || res;
  } catch {
    const cached =
      (await cache.match(req)) ||
      (rel === '' || rel === 'index.html'
        ? (await cache.match(scope + 'index.html')) || (await cache.match(scope))
        : null);
    return cached || offlineResponse();
  }
}

async function cacheFirst(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;

  try {
    const res = await fetch(req);
    if (isCacheable(res)) {
      const copy = res.clone();
      event.waitUntil(cache.put(req, copy).catch(() => {}));
    }
    return res;
  } catch {
    return offlineResponse();
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);

  const networkPromise = fetch(req)
    .then(async (res) => {
      if (isCacheable(res)) {
        await cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(networkPromise);
    return hit;
  }

  const net = await networkPromise;
  return net || offlineResponse();
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const scope = scopePath();
      await Promise.allSettled(
        PRECACHE.map(async (rel) => {
          const abs = toAbsolute(rel, scope);
          const init = NO_CACHE_SHELL.has(rel) ? { cache: 'no-cache' } : undefined;
          const res = await fetch(new Request(abs, init));
          if (isCacheable(res)) {
            await cache.put(abs, res);
          }
        }),
      );
      if (typeof self.skipWaiting === 'function') {
        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith('forge-deck-') || k.startsWith('krunked-sw-cache-')) && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      if (self.clients && typeof self.clients.claim === 'function') {
        await self.clients.claim();
      }
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING' && typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  const scope = scopePath();
  const precachedAbs = PRECACHE.map((rel) => toAbsolute(rel, scope));
  const strategy = swRouteStrategy(url, req.mode, scope, self.location.origin, precachedAbs);
  if (!strategy) return;

  const rel = url.pathname.slice(scope.length);
  if (strategy === 'network-first') {
    e.respondWith(networkFirst(e, req, scope, rel));
    return;
  }
  if (strategy === 'swr') {
    e.respondWith(staleWhileRevalidate(e, req));
    return;
  }
  e.respondWith(cacheFirst(e, req));
});
`;
}

export function forgeDeckPwa(): Plugin {
  const manifest = buildManifest();
  return {
    name: 'forge-deck-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/manifest.webmanifest' || req.url?.endsWith('/manifest.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.end(manifest);
          return;
        }
        next();
      });
    },
    generateBundle(_options, bundle) {
      const bundleKeys = Object.keys(bundle).sort();
      const emittedAssets = bundleKeys.filter(isPrecachedAsset).map((f) => `./${f}`);
      const precache = Array.from(new Set([...SHELL_PRECACHE, ...ICON_PRECACHE, ...emittedAssets]));

      const hasher = createHash('sha256');
      hasher.update(manifest);
      for (const key of bundleKeys) {
        hasher.update('\0' + key + '\0');
        const entry = bundle[key];
        if (!entry) continue;
        if (entry.type === 'chunk') {
          hasher.update(entry.code);
        } else if (entry.type === 'asset') {
          hasher.update(entry.source);
        }
      }
      const version = hasher.digest('hex').slice(0, 10);

      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker(precache, version) });
    },
  };
}
