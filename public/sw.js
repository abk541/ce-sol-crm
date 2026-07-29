// GitHub deployments replace this token with the pushed commit SHA. Local
// builds fall back to the compiled entry fingerprint. The unique production
// value makes every push install a new shell and refresh existing app windows.
const RELEASE = '__CE_ERP_RELEASE__'
const SHELL_CACHE_PREFIX = 'ce-erp-shell-'
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${RELEASE}`
const REFRESH_STATE_CACHE = 'ce-erp-refresh-state'
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

function refreshStateUrl() {
  return new URL('./.ce-erp-refresh-state', self.registration.scope).href
}

async function readRefreshState() {
  const cache = await caches.open(REFRESH_STATE_CACHE)
  const response = await cache.match(refreshStateUrl())
  if (!response) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function writeRefreshState(status) {
  const cache = await caches.open(REFRESH_STATE_CACHE)
  await cache.put(
    refreshStateUrl(),
    new Response(JSON.stringify({ release: RELEASE, status }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
    // The active worker is present only for an upgrade. Persist this before
    // skipWaiting so activation can distinguish an existing installation from
    // a first install even if the worker process is restarted between events.
    if (self.registration.active) {
      await writeRefreshState('pending')
    }
    await self.skipWaiting()
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

    const refreshState = await readRefreshState()
    if (
      refreshState?.release !== RELEASE
      || refreshState?.status !== 'pending'
    ) return
    // Commit the at-most-once state before navigating any window. If state
    // persistence fails, activation fails without risking a reload loop.
    await writeRefreshState('applied')
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
