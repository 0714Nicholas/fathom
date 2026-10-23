/* Fathom service worker
 * - 画面（ナビゲーション）は network-first。オフライン時は最後に開いたページを返す
 * - ハッシュ付きの静的ファイル・フォント・HDR は cache-first
 * - /api/* と外部オリジン（Supabase など）は一切キャッシュしない
 */

const VERSION = 'v1'
const SHELL_CACHE = `fathom-shell-${VERSION}`
const ASSET_CACHE = `fathom-assets-${VERSION}`
const MAX_ASSET_ENTRIES = 120

const SHELL_URLS = ['/', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fathom-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isCacheFirstAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/hdri/') ||
    url.pathname.startsWith('/audio/')
  )
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)))
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE)
    await cache.put(request, response.clone())
    void trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES)
  }
  return response
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put('/', response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match('/')
    if (cached) return cached
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
    return
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})
