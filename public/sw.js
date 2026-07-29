// The production build replaces this token with a deterministic fingerprint
// of the compiled entry bundle. That makes sw.js change with every application
// release, so installed desktop PWAs cannot keep running an incompatible API
// client after the backend is upgraded.
const RELEASE = '__CE_ERP_RELEASE__'
const SHELL_CACHE_PREFIX = 'ce-erp-shell-'
// Change this token only for a deliberately forced installed-app rollout.
// Its persistent marker makes this refresh happen once per browser profile,
// while later ordinary releases return to the user-confirmed update flow.
const FORCED_REFRESH_TOKEN = '2026-07-29-premium-icon-v3'
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${RELEASE}-${FORCED_REFRESH_TOKEN}`
const ROLLOUT_MARKER_CACHE = 'ce-erp-rollout-markers'
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-192-v3.png',
  './pwa-512-v3.png',
  './apple-touch-icon-v3.png',
  './favicon-32-v3.png',
  './favicon-64-v3.png',
  './logo.avif',
]

function forcedRefreshMarkerUrl() {
  return new URL(
    `./.ce-erp-rollouts/${FORCED_REFRESH_TOKEN}`,
    self.registration.scope,
  ).href
}

async function forcedRefreshAlreadyApplied() {
  const cache = await caches.open(ROLLOUT_MARKER_CACHE)
  return Boolean(await cache.match(forcedRefreshMarkerUrl()))
}

async function markForcedRefreshApplied() {
  const cache = await caches.open(ROLLOUT_MARKER_CACHE)
  await cache.put(
    forcedRefreshMarkerUrl(),
    new Response(RELEASE, {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    }),
  )
}

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
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    await cache.addAll(SHELL_FILES)
    if (!(await forcedRefreshAlreadyApplied())) {
      await self.skipWaiting()
    }
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const staleShellCaches = keys.filter(
      key => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE,
    )
    await Promise.all(
      staleShellCaches.map(key => caches.delete(key)),
    )
    await self.clients.claim()

    if (await forcedRefreshAlreadyApplied()) return
    // Persist the at-most-once marker before navigating clients. If a browser
    // cannot store the marker, activation fails safely without entering a
    // forced-refresh loop that could repeatedly discard in-progress work.
    await markForcedRefreshApplied()
    // A brand-new profile has no older CE shell to replace. Mark the rollout
    // as consumed, but do not surprise a first-time visitor with a reload.
    if (staleShellCaches.length === 0) return
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    await Promise.all(clients.map(client => {
      const url = new URL(client.url)
      if (url.origin !== self.location.origin) return undefined
      return client.navigate(client.url).catch(() => undefined)
    }))
  })())
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
