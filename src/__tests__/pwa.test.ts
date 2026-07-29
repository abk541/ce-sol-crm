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
import { describe, expect, it } from 'vitest'

function pngDimensions(path: string) {
  const image = readFileSync(path)
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
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
      expect(icon.src).toMatch(/-v2\.png$/)
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
    expect(serviceWorker).toContain('./pwa-192-v2.png')
    expect(serviceWorker).toContain('./pwa-512-v2.png')
    expect(serviceWorker).toContain("request.method !== 'GET'")
    expect(serviceWorker).toContain("request.headers.has('authorization')")
    expect(serviceWorker).toContain('attachments?')
    expect(serviceWorker).toContain('uploads?')
    expect(serviceWorker).toContain('storage')
    expect(serviceWorker).toContain('url.origin !== self.location.origin')
  })

  it('activates a waiting release only after the app explicitly approves it', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE")
    expect(serviceWorker).toContain('self.clients.claim()')
    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(serviceWorker).toContain('event.waitUntil(self.skipWaiting())')
    expect(serviceWorker).not.toContain('client.navigate(')
    expect(serviceWorker).not.toContain('self.skipWaiting()\n})')
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
