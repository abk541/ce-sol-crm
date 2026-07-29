import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function pngDimensions(path: string) {
  const image = readFileSync(path)
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

function createServiceWorkerHarness(options: { withPreviousShell?: boolean } = {}) {
  type WorkerEvent = {
    data?: unknown
    waitUntil: (task: Promise<unknown>) => void
  }
  type WorkerHandler = (event: WorkerEvent) => void

  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const handlers = new Map<string, WorkerHandler>()
  const cacheContents = new Map<string, Map<string, unknown>>()
  if (options.withPreviousShell !== false) {
    cacheContents.set('ce-erp-shell-previous-release', new Map())
  }
  const deletedCaches: string[] = []
  const lifecycleEvents: string[] = []
  const navigate = vi.fn(async () => {
    lifecycleEvents.push('navigate')
  })
  const foreignNavigate = vi.fn(async () => undefined)
  const skipWaiting = vi.fn(async () => undefined)
  const claim = vi.fn(async () => undefined)
  const normalizeCacheKey = (key: unknown) => (
    typeof key === 'string'
      ? key
      : String((key as { url?: unknown })?.url ?? key)
  )
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!cacheContents.has(name)) cacheContents.set(name, new Map())
      const entries = cacheContents.get(name)!
      return {
        addAll: vi.fn(async () => undefined),
        match: vi.fn(async (key: unknown) => entries.get(normalizeCacheKey(key))),
        put: vi.fn(async (key: unknown, response: unknown) => {
          if (name === 'ce-erp-rollout-markers') lifecycleEvents.push('marker')
          entries.set(normalizeCacheKey(key), response)
        }),
      }
    }),
    keys: vi.fn(async () => [...cacheContents.keys()]),
    delete: vi.fn(async (name: string) => {
      deletedCaches.push(name)
      return cacheContents.delete(name)
    }),
    match: vi.fn(async () => undefined),
  }
  const workerScope = {
    registration: { scope: 'https://crm.example.test/' },
    location: { origin: 'https://crm.example.test' },
    addEventListener: (type: string, handler: WorkerHandler) => {
      handlers.set(type, handler)
    },
    skipWaiting,
    clients: {
      claim,
      matchAll: vi.fn(async () => [
        { url: 'https://crm.example.test/#/pipeline', navigate },
        { url: 'https://other.example.test/', navigate: foreignNavigate },
      ]),
    },
  }

  runInNewContext(source, {
    self: workerScope,
    caches,
    URL,
    Response,
    fetch: vi.fn(),
    console,
  })

  const dispatch = async (type: string, data?: unknown) => {
    const handler = handlers.get(type)
    if (!handler) throw new Error(`Missing ${type} service-worker handler.`)
    let lifetime: Promise<unknown> = Promise.resolve()
    handler({
      data,
      waitUntil: task => {
        lifetime = Promise.resolve(task)
      },
    })
    await lifetime
  }

  return {
    cacheContents,
    claim,
    deletedCaches,
    dispatch,
    foreignNavigate,
    lifecycleEvents,
    navigate,
    skipWaiting,
  }
}

describe('PWA installability', () => {
  it('publishes a standalone manifest with existing install icons', () => {
    const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string
      short_name: string
      start_url: string
      scope: string
      display: string
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>
    }

    expect(manifest.name).toBe('CE Solution Plus ERP')
    expect(manifest.short_name).toBe('CE ERP')
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.map(icon => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
    manifest.icons.forEach(icon => {
      expect(icon.type).toBe('image/png')
      expect(icon.src).toMatch(/-v3\.png$/)
      const iconPath = resolve(process.cwd(), 'public', icon.src.replace(/^\.\//, ''))
      expect(existsSync(iconPath)).toBe(true)
      const [width, height] = icon.sizes.split('x').map(Number)
      expect(pngDimensions(iconPath)).toEqual({ width, height })
    })
    expect(manifest.icons.find(icon => icon.sizes === '512x512')?.purpose).toContain('maskable')
  })

  it('never caches API, attachment, upload, storage, authenticated, or non-GET requests', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("const RELEASE = '__CE_ERP_RELEASE__'")
    expect(serviceWorker).toContain("const SHELL_CACHE_PREFIX = 'ce-erp-shell-'")
    expect(serviceWorker).toContain('./pwa-192-v3.png')
    expect(serviceWorker).toContain('./pwa-512-v3.png')
    expect(serviceWorker).toContain("request.method !== 'GET'")
    expect(serviceWorker).toContain("request.headers.has('authorization')")
    expect(serviceWorker).toContain('attachments?')
    expect(serviceWorker).toContain('uploads?')
    expect(serviceWorker).toContain('storage')
    expect(serviceWorker).toContain('url.origin !== self.location.origin')
  })

  it('forces the premium-icon rollout once, then preserves safe future updates', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE")
    expect(serviceWorker).toContain("const ROLLOUT_MARKER_CACHE = 'ce-erp-rollout-markers'")
    expect(serviceWorker).toContain("const FORCED_REFRESH_TOKEN = '2026-07-29-premium-icon-v3'")
    expect(serviceWorker).toContain('forcedRefreshAlreadyApplied()')
    expect(serviceWorker).toContain('markForcedRefreshApplied()')
    expect(serviceWorker).toContain('await self.skipWaiting()')
    expect(serviceWorker).toContain('self.clients.claim()')
    expect(serviceWorker).toContain("type: 'window'")
    expect(serviceWorker).toContain('includeUncontrolled: true')
    expect(serviceWorker).toContain('client.navigate(client.url)')
    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(serviceWorker).toContain('event.waitUntil(self.skipWaiting())')
  })

  it('executes the forced rollout once per browser profile without a reload loop', async () => {
    const worker = createServiceWorkerHarness()

    await worker.dispatch('install')
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1)

    await worker.dispatch('activate')
    expect(worker.claim).toHaveBeenCalledTimes(1)
    expect(worker.navigate).toHaveBeenCalledTimes(1)
    expect(worker.foreignNavigate).not.toHaveBeenCalled()
    expect(worker.deletedCaches).toContain('ce-erp-shell-previous-release')
    expect(worker.cacheContents.has('ce-erp-rollout-markers')).toBe(true)
    expect(worker.lifecycleEvents).toEqual(['marker', 'navigate'])

    worker.skipWaiting.mockClear()
    worker.navigate.mockClear()
    await worker.dispatch('install')
    await worker.dispatch('activate')

    expect(worker.skipWaiting).not.toHaveBeenCalled()
    expect(worker.navigate).not.toHaveBeenCalled()
  })

  it('does not force-reload a brand-new profile with no older CE shell', async () => {
    const worker = createServiceWorkerHarness({ withPreviousShell: false })

    await worker.dispatch('install')
    await worker.dispatch('activate')

    expect(worker.cacheContents.has('ce-erp-rollout-markers')).toBe(true)
    expect(worker.navigate).not.toHaveBeenCalled()
    expect(worker.lifecycleEvents).toEqual(['marker'])
  })

  it('version-busts browser, Apple, and installed-app icon URLs together', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    for (const icon of [
      'favicon-32-v3.png',
      'favicon-64-v3.png',
      'apple-touch-icon-v3.png',
      'pwa-192-v3.png',
      'pwa-512-v3.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), 'public', icon))).toBe(true)
      expect(`${html}\n${serviceWorker}`).toContain(icon)
    }
  })

  it('stamps the service worker deterministically from the compiled entry asset', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'ce-erp-release-'))
    const assets = resolve(fixture, 'assets')
    const script = resolve(process.cwd(), 'scripts/stamp-release.mjs')
    const serviceWorkerTemplate = "const RELEASE = '__CE_ERP_RELEASE__'\n"
    const entry = Buffer.from('deterministic compiled entry')
    const expectedRelease = createHash('sha256').update(entry).digest('hex').slice(0, 16)

    try {
      mkdirSync(assets)
      writeFileSync(
        resolve(fixture, 'index.html'),
        '<script type="module" src="./assets/index-Fixture123.js"></script>',
      )
      writeFileSync(resolve(assets, 'index-Fixture123.js'), entry)
      writeFileSync(resolve(fixture, 'sw.js'), serviceWorkerTemplate)

      execFileSync(process.execPath, [script, fixture])
      const first = readFileSync(resolve(fixture, 'sw.js'), 'utf8')
      expect(first).toContain(`const RELEASE = '${expectedRelease}'`)
      expect(first).not.toContain('__CE_ERP_RELEASE__')

      writeFileSync(resolve(fixture, 'sw.js'), serviceWorkerTemplate)
      execFileSync(process.execPath, [script, fixture])
      expect(readFileSync(resolve(fixture, 'sw.js'), 'utf8')).toBe(first)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('registers without HTTP cache reuse and checks long-running apps for updates', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')

    expect(main).toContain("updateViaCache: 'none'")
    expect(main).toContain('registration.update()')
    expect(main).toContain("window.addEventListener('focus'")
    expect(main).toContain('5 * 60 * 1000')
    expect(main).toContain('window.confirm(')
    expect(main).toContain("worker.postMessage({ type: 'SKIP_WAITING' })")
    expect(main).toContain("navigator.serviceWorker.addEventListener('controllerchange'")
    expect(main).toContain('if (!reloadApproved) return')
  })
})
