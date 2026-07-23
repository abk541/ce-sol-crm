const SHELL_CACHE = 'ce-erp-shell-v1'
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-192.png',
  './pwa-512.png',
  './apple-touch-icon.png',
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
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
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
