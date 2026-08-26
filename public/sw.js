const CACHE_VERSION = 'zhongfu-v20';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '');
const withBasePath = path => `${BASE_PATH}${path}`;

const APP_SHELL = [
  withBasePath('/'),
  withBasePath('/procurement/'),
  withBasePath('/feeding/'),
  withBasePath('/health/'),
  withBasePath('/expenses/'),
  withBasePath('/offline.html'),
  withBasePath('/manifest.json'),
  withBasePath('/apple-touch-icon.png'),
  withBasePath('/zhongfu-cat-app-icon-192.png'),
  withBasePath('/zhongfu-cat-app-icon.png'),
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('zhongfu-') && ![SHELL_CACHE, PAGE_CACHE, ASSET_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith(`${BASE_PATH}/api/`)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (
    url.pathname.startsWith(`${BASE_PATH}/_next/static/`) ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirstAsset(request));
  }
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      await caches.match(request, { ignoreSearch: true }) ||
      await caches.match(withBasePath('/offline.html'))
    );
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
