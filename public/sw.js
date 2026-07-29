// The production build replaces this token with a deterministic fingerprint
// of the compiled entry bundle. That makes sw.js change with every application
// release, so installed desktop PWAs cannot keep running an incompatible API
// client after the backend is upgraded.
const RELEASE = '__CE_ERP_RELEASE__'
const SHELL_CACHE_PREFIX = 'ce-erp-shell-'
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${RELEASE}`
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-192-v2.png',
  './pwa-512-v2.png',
  './apple-touch-icon-v2.png',
  './favicon-32-v2.png',
  './favicon-64-v2.png',
  './logo.avif',
]

function isPrivateApplicationRequest(request, url) {
  if (request.method !== 'GET') return true
  if (request.headers.has('authorization')) return true
  return /\/(?:api(?:\/|$)|attachments?(?:\/|$)|uploads?(?:\/|$)|storage(?:\/|$))/i.test(url.pathname)
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  // A waiting release is activated only after the user accepts the in-app
  // reload prompt. This keeps long-running desktop installations current
  // without discarding an opportunity form that is still being edited.
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isPrivateApplicationRequest(request, url)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request).catch(() => caches.match('./index.html')),
    )
    return
  }

  if (['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(networkFirst(request))
  }
})
