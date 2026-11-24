import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { BRAND, FULL_BRAND, THEME_COLOR } from '../src/config/site.ts';

function buildManifest() {
  return JSON.stringify(
    {
      name: FULL_BRAND,
      short_name: BRAND.shortName,
      description: BRAND.tagline,
      id: './',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: THEME_COLOR,
      theme_color: THEME_COLOR,
      categories: ['utilities', 'developer', 'games'],
      icons: [
        { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        {
          name: 'Search Apps',
          short_name: 'Search',
          description: 'Open command launcher',
          url: './#palette',
          icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
        },
      ],
    },
    null,
    2,
  );
}

function buildServiceWorker(precache: string[], version: string) {
  const list = JSON.stringify(precache);
  // Scope-safe: on user-site root (/), sibling apps live under /<repo>/ on the same origin.
  // Only handle the deck's own navigation path and its own precached /assets/ files.
  return `const CACHE = 'forge-deck-${version}';
const PRECACHE = ${list};

function scopePath() {
  return new URL(self.registration.scope).pathname;
}

function shouldHandle(url, mode, scope, origin, precached) {
  if (url.origin !== origin) return false;
  const p = url.pathname;
  if (mode === 'navigate') return p === scope || p === scope + 'index.html';
  if (p.startsWith(scope + 'assets/')) return true;
  return precached.includes(p);
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      const scope = scopePath();
      return c.addAll(PRECACHE.map((p) => scope + p.replace(/^\\.\\//, '')));
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('forge-deck-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = scopePath();
  const precachedAbs = PRECACHE.map((p) => scope + p.replace(/^\\.\\//, ''));
  if (!shouldHandle(url, req.mode, scope, self.location.origin, precachedAbs)) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(scope + 'index.html').then((r) => r || caches.match(scope))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
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
      const assets = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') || f === 'index.html')
        .map((f) => `./${f}`);
      const precache = Array.from(
        new Set([
          './',
          './index.html',
          './manifest.webmanifest',
          './favicon.svg',
          './icons/icon-192.png',
          './icons/icon-512.png',
          ...assets,
        ]),
      );
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker(precache, version) });
    },
  };
}
