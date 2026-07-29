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

type ServiceWorkerCacheContents = Map<string, Map<string, unknown>>

function createServiceWorkerHarness(options: {
  cacheContents?: ServiceWorkerCacheContents
  release?: string
  withActiveWorker?: boolean
  withPreviousShell?: boolean
} = {}) {
  type WorkerEvent = {
    data?: unknown
    waitUntil: (task: Promise<unknown>) => void
  }
  type WorkerHandler = (event: WorkerEvent) => void

  const template = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const source = options.release
    ? template.split('__CE_ERP_RELEASE__').join(options.release)
    : template
  const handlers = new Map<string, WorkerHandler>()
  const cacheContents = options.cacheContents ?? new Map<string, Map<string, unknown>>()
  if (!options.cacheContents && options.withPreviousShell !== false) {
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
          if (name === 'ce-erp-refresh-state') {
            const state = JSON.parse(await (response as Response).clone().text()) as {
              status?: unknown
            }
            lifecycleEvents.push(String(state.status ?? 'unknown'))
          }
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
    registration: {
      scope: 'https://crm.example.test/',
      active: options.withActiveWorker === false ? null : { scriptURL: 'sw.js' },
    },
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

  it('automatically activates and refreshes every stamped release', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE")
    expect(serviceWorker).toContain('await self.skipWaiting()')
    expect(serviceWorker).toContain('self.clients.claim()')
    expect(serviceWorker).toContain("type: 'window'")
    expect(serviceWorker).toContain('includeUncontrolled: true')
    expect(serviceWorker).toContain('client.navigate(client.url)')
    expect(serviceWorker).toContain("const REFRESH_STATE_CACHE = 'ce-erp-refresh-state'")
    expect(serviceWorker).toContain("await writeRefreshState('pending')")
    expect(serviceWorker).toContain("await writeRefreshState('applied')")
    expect(serviceWorker).not.toContain("event.data?.type === 'SKIP_WAITING'")
  })

  it('refreshes an existing client once during one release activation', async () => {
    const worker = createServiceWorkerHarness()

    await worker.dispatch('install')
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1)

    await worker.dispatch('activate')
    expect(worker.claim).toHaveBeenCalledTimes(1)
    expect(worker.navigate).toHaveBeenCalledTimes(1)
    expect(worker.foreignNavigate).not.toHaveBeenCalled()
    expect(worker.deletedCaches).toContain('ce-erp-shell-previous-release')
    expect(worker.lifecycleEvents).toEqual(['pending', 'applied', 'navigate'])

    worker.navigate.mockClear()
    await worker.dispatch('activate')

    expect(worker.navigate).not.toHaveBeenCalled()
  })

  it('does not force-reload a brand-new profile with no older CE shell', async () => {
    const worker = createServiceWorkerHarness({
      withActiveWorker: false,
      withPreviousShell: false,
    })

    await worker.dispatch('install')
    await worker.dispatch('activate')

    expect(worker.skipWaiting).toHaveBeenCalledTimes(1)
    expect(worker.navigate).not.toHaveBeenCalled()
    expect(worker.lifecycleEvents).toEqual([])
  })

  it('still refreshes an active installation whose old shell cache was cleared', async () => {
    const worker = createServiceWorkerHarness({ withPreviousShell: false })

    await worker.dispatch('install')
    await worker.dispatch('activate')

    expect(worker.navigate).toHaveBeenCalledTimes(1)
    expect(worker.lifecycleEvents).toEqual(['pending', 'applied', 'navigate'])
  })

  it('refreshes again when a later pushed release replaces the prior shell', async () => {
    const caches: ServiceWorkerCacheContents = new Map([
      ['ce-erp-shell-before-policy', new Map()],
    ])
    const first = createServiceWorkerHarness({
      cacheContents: caches,
      release: '1111111111111111',
    })

    await first.dispatch('install')
    await first.dispatch('activate')
    expect(first.navigate).toHaveBeenCalledTimes(1)
    expect(caches.has('ce-erp-shell-1111111111111111')).toBe(true)

    const second = createServiceWorkerHarness({
      cacheContents: caches,
      release: '2222222222222222',
    })
    await second.dispatch('install')
    await second.dispatch('activate')

    expect(second.navigate).toHaveBeenCalledTimes(1)
    expect(second.deletedCaches).toContain('ce-erp-shell-1111111111111111')
    expect(caches.has('ce-erp-shell-2222222222222222')).toBe(true)
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

      execFileSync(process.execPath, [script, fixture], {
        env: { ...process.env, CE_ERP_RELEASE_ID: '', GITHUB_SHA: '' },
      })
      const first = readFileSync(resolve(fixture, 'sw.js'), 'utf8')
      expect(first).toContain(`const RELEASE = '${expectedRelease}'`)
      expect(first).not.toContain('__CE_ERP_RELEASE__')

      writeFileSync(resolve(fixture, 'sw.js'), serviceWorkerTemplate)
      execFileSync(process.execPath, [script, fixture], {
        env: { ...process.env, CE_ERP_RELEASE_ID: '', GITHUB_SHA: '' },
      })
      expect(readFileSync(resolve(fixture, 'sw.js'), 'utf8')).toBe(first)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('uses the pushed Git commit as a unique production release stamp', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'ce-erp-github-release-'))
    const assets = resolve(fixture, 'assets')
    const script = resolve(process.cwd(), 'scripts/stamp-release.mjs')
    const githubSha = 'abcdef0123456789abcdef0123456789abcdef01'
    const nextGithubSha = '1234567890abcdef1234567890abcdef12345678'
    const entry = Buffer.from('same compiled application')
    const expectedFirst = createHash('sha256')
      .update(githubSha)
      .update('\0')
      .update(entry)
      .digest('hex')
      .slice(0, 16)
    const expectedSecond = createHash('sha256')
      .update(nextGithubSha)
      .update('\0')
      .update(entry)
      .digest('hex')
      .slice(0, 16)

    try {
      mkdirSync(assets)
      writeFileSync(
        resolve(fixture, 'index.html'),
        '<script type="module" src="./assets/index-Fixture123.js"></script>',
      )
      writeFileSync(resolve(assets, 'index-Fixture123.js'), entry)
      writeFileSync(
        resolve(fixture, 'sw.js'),
        "const RELEASE = '__CE_ERP_RELEASE__'\n",
      )

      execFileSync(process.execPath, [script, fixture], {
        env: { ...process.env, CE_ERP_RELEASE_ID: '', GITHUB_SHA: githubSha },
      })

      const first = readFileSync(resolve(fixture, 'sw.js'), 'utf8')
      expect(first).toContain(`const RELEASE = '${expectedFirst}'`)

      writeFileSync(
        resolve(fixture, 'sw.js'),
        "const RELEASE = '__CE_ERP_RELEASE__'\n",
      )
      execFileSync(process.execPath, [script, fixture], {
        env: { ...process.env, CE_ERP_RELEASE_ID: '', GITHUB_SHA: nextGithubSha },
      })
      const second = readFileSync(resolve(fixture, 'sw.js'), 'utf8')
      expect(second).toContain(`const RELEASE = '${expectedSecond}'`)
      expect(second).not.toBe(first)
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
    expect(main).not.toContain('window.confirm(')
    expect(main).not.toContain("worker.postMessage({ type: 'SKIP_WAITING' })")
  })
})
