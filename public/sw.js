/* Chess Unlimited service worker.
 *
 * - App shell and engine files are cached so the app opens and analyses offline.
 * - Navigation: network first (always the newest build when online), cached index.html as the offline fallback.
 * - /assets, /engine, /icons: cache first (Vite fingerprints /assets, so a changed file has a new URL).
 * - A new version waits until the person accepts the update (message {type:'SKIP_WAITING'}).
 * Bump VERSION on every release so old caches are removed.
 */
const VERSION = 'v1.1.1'
const SHELL_CACHE = `chess-unlimited-shell-${VERSION}`
const RUNTIME_CACHE = `chess-unlimited-runtime-${VERSION}`

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/engine/stockfish.js',
  '/engine/stockfish.wasm',
  '/engine/stockfish-single.js',
  '/engine/stockfish-single.wasm',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // One by one: a missing optional file (e.g. the single-thread build) must not abort the install.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
      // Also precache the fingerprinted JS/CSS that index.html references.
      try {
        const response = await fetch('/', { cache: 'no-store' })
        const html = await response.text()
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
        await Promise.all(assets.map((url) => cache.add(url).catch(() => {})))
      } catch {
        // offline during install: runtime caching will fill the gaps
      }
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE])
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('chess-unlimited-') && !keep.has(name)).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

const cacheable = (response) => response && response.status === 200 && response.type === 'basic'

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (cacheable(response)) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put('/', response.clone())
    }
    return response
  } catch {
    const cached = (await caches.match('/')) || (await caches.match('/index.html'))
    if (cached) return cached
    return new Response('Chess Unlimited sedang offline dan belum tersimpan di perangkat ini. Buka sekali saat online.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (cacheable(response)) {
    const cache = await caches.open(RUNTIME_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  return cached || (await refresh) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/sw.js') return // always fetch the worker itself from the network

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }
  if (/^\/(assets|engine|icons)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})
