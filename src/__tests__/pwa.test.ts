import { existsSync, readFileSync } from 'node:fs'
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

    expect(serviceWorker).toContain("const SHELL_CACHE = 'ce-erp-shell-v2'")
    expect(serviceWorker).toContain('./pwa-192-v2.png')
    expect(serviceWorker).toContain('./pwa-512-v2.png')
    expect(serviceWorker).toContain("request.method !== 'GET'")
    expect(serviceWorker).toContain("request.headers.has('authorization')")
    expect(serviceWorker).toContain('attachments?')
    expect(serviceWorker).toContain('uploads?')
    expect(serviceWorker).toContain('storage')
    expect(serviceWorker).toContain('url.origin !== self.location.origin')
  })
})
