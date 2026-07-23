import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PWA installability', () => {
  it('publishes a standalone manifest with existing install icons', () => {
    const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string
      short_name: string
      start_url: string
      scope: string
      display: string
      icons: Array<{ src: string; sizes: string; type: string }>
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
      expect(existsSync(resolve(process.cwd(), 'public', icon.src.replace(/^\.\//, '')))).toBe(true)
    })
  })

  it('never caches API, attachment, upload, storage, authenticated, or non-GET requests', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("request.method !== 'GET'")
    expect(serviceWorker).toContain("request.headers.has('authorization')")
    expect(serviceWorker).toContain('attachments?')
    expect(serviceWorker).toContain('uploads?')
    expect(serviceWorker).toContain('storage')
    expect(serviceWorker).toContain('url.origin !== self.location.origin')
  })
})
