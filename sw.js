const KRUNKED_SW_CACHE_V1 = 'krunked-sw-cache-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './data/foundry-snapshot.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.svg',
  './src/app.js',
  './src/styles/tokens.css',
  './src/styles/chassis.css',
  './src/styles/components.css',
  './src/styles/views.css',
  './src/telemetry/classifier.js',
  './src/telemetry/idb-cache.js',
  './src/telemetry/manifest-probe.js',
  './src/telemetry/sync-engine.js',
  './src/vault/cookie-vault.js',
  './src/vault/pat-vault.js',
  './src/vault/config-io.js',
  './src/graphics/chrono-pulse.js',
  './src/graphics/sparkline.js',
  './src/graphics/swiss-emblem.js',
  './src/graphics/qr-svg.js',
  './src/graphics/film-grain.js',
  './src/audio/micro-foley.js',
  './src/ui/top-bar.js',
  './src/ui/hero-forge.js',
  './src/ui/bento-deck.js',
  './src/ui/inspector-drawer.js',
  './src/ui/foundry-matrix.js',
  './src/ui/command-palette.js',
  './src/ui/modals.js'
];

const EXACT_SHELL_PATHS = new Set(['', 'index.html', 'manifest.json', 'sw.js']);
const PREFIX_SHELL_PATHS = ['src/', 'data/', 'assets/'];

function getScopeUrl() {
  const scope = (self.registration && self.registration.scope) || self.location.href;
  return new URL(scope);
}

function getRelativeShellPath(requestUrl, scopeUrl) {
  if (requestUrl.origin !== scopeUrl.origin) {
    return null;
  }
  const scopePath = scopeUrl.pathname.endsWith('/')
    ? scopeUrl.pathname
    : `${scopeUrl.pathname}/`;
  if (!requestUrl.pathname.startsWith(scopePath)) {
    return null;
  }
  return requestUrl.pathname.slice(scopePath.length);
}

function isAllowedShellPath(relPath) {
  if (relPath === null) {
    return false;
  }
  if (EXACT_SHELL_PATHS.has(relPath)) {
    return true;
  }
  return PREFIX_SHELL_PATHS.some((prefix) => relPath.startsWith(prefix));
}

function isStaleWhileRevalidatePath(relPath) {
  return relPath === 'data/foundry-snapshot.json' || relPath.startsWith('assets/icons/');
}

async function networkFirst(request, scopeUrl, relPath) {
  const cache = await caches.open(KRUNKED_SW_CACHE_V1);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type !== 'opaque') {
      await cache.put(request, response.clone());
      return response;
    }
    if (response && response.status < 500) {
      return response;
    }
    const fallback = await cache.match(request);
    return fallback || response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (relPath === '' || relPath === 'index.html') {
      const indexFallback =
        (await cache.match(new URL('./index.html', scopeUrl).href)) ||
        (await cache.match(new URL('./', scopeUrl).href));
      if (indexFallback) {
        return indexFallback;
      }
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(KRUNKED_SW_CACHE_V1);
  const cached = await cache.match(event.request);

  const networkPromise = fetch(event.request)
    .then(async (response) => {
      if (response && response.ok && response.type !== 'opaque') {
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(networkPromise);
    }
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(KRUNKED_SW_CACHE_V1);
      const scopeUrl = getScopeUrl();
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (relAsset) => {
          const assetUrl = new URL(relAsset, scopeUrl);
          const response = await fetch(new Request(assetUrl.href, { cache: 'no-cache' }));
          if (response && response.ok) {
            await cache.put(assetUrl.href, response);
          }
        })
      );
      if (typeof self.skipWaiting === 'function') {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== KRUNKED_SW_CACHE_V1)
          .map((name) => caches.delete(name))
      );
      if (self.clients && typeof self.clients.claim === 'function') {
        await self.clients.claim();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING' && typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') {
    return;
  }

  let requestUrl;
  let scopeUrl;
  try {
    requestUrl = new URL(request.url);
    scopeUrl = getScopeUrl();
  } catch {
    return;
  }

  const relPath = getRelativeShellPath(requestUrl, scopeUrl);
  if (!isAllowedShellPath(relPath)) {
    return;
  }

  if (isStaleWhileRevalidatePath(relPath)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  event.respondWith(networkFirst(request, scopeUrl, relPath));
});
