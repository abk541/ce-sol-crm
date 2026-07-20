import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('../lib/api', () => ({
  isApiConnected: true,
  apiRequest,
  envelopeData: (payload: unknown) => (
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload
  ),
}))

import {
  createSafeAttachmentPreviewBlob,
  downloadAttachment,
  getAttachmentPreviewFormat,
  hasAttachmentSource,
  loadAttachmentBlob,
  previewAttachment,
  uploadAttachment,
} from '../lib/attachments'

describe('private attachment storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    apiRequest.mockReset()
  })

  it('treats a private storagePath as downloadable content', () => {
    expect(hasAttachmentSource({ storagePath: 'proposals/example.pdf' })).toBe(true)
  })

  it('uploads through the authenticated file API and persists only its private path', async () => {
    const file = new File(['proposal'], 'client proposal.pdf', { type: 'application/pdf' })
    apiRequest.mockResolvedValue({
      data: {
        id: 'fixed-id',
        name: 'client proposal.pdf',
        attachedAt: '2026-07-20T12:00:00.000Z',
        uploadedBy: 'tester',
        mimeType: 'application/pdf',
        size: file.size,
        storagePath: 'client_proposals/fixed-id-client_proposal.pdf',
      },
    })

    const attachment = await uploadAttachment(file, {
      folder: 'client proposals',
      uploadedBy: 'tester',
      id: 'fixed-id',
      attachedAt: '2026-07-20T12:00:00.000Z',
    })

    expect(apiRequest).toHaveBeenCalledWith('/files', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }))
    const form = (apiRequest.mock.calls[0][1] as RequestInit).body as FormData
    expect(form.get('file')).toBe(file)
    expect(form.get('folder')).toBe('client proposals')
    expect(form.get('id')).toBe('fixed-id')
    expect(attachment.storagePath).toBe('client_proposals/fixed-id-client_proposal.pdf')
    expect(attachment.url).toBeUndefined()
  })

  it('uses authenticated file download before any legacy URL fallback', async () => {
    const privateBlob = new Blob(['private bytes'], { type: 'application/pdf' })
    apiRequest.mockResolvedValue(privateBlob)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await loadAttachmentBlob({
      storagePath: 'contracts/private.pdf',
      url: 'https://legacy.example/private.pdf',
    })

    expect(apiRequest).toHaveBeenCalledWith('/files/contracts%2Fprivate.pdf', {}, {
      responseType: 'blob',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toBe(privateBlob)
  })

  it('never falls back to a stale legacy URL when storagePath is present', async () => {
    apiRequest.mockRejectedValue(new Error('Object not found'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(loadAttachmentBlob({
      storagePath: 'contracts/missing.pdf',
      url: 'https://legacy.example/missing.pdf',
      dataUrl: 'data:application/pdf;base64,bGVnYWN5',
    })).rejects.toThrow('Object not found')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['script.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['page.xhtml', 'application/xhtml+xml'],
    ['feed.xml', 'application/xml'],
    ['vector.svg', 'image/png'],
    ['mismatch.png', 'application/pdf'],
  ])('marks active or mismatched content as download-only: %s', (name, mimeType) => {
    expect(getAttachmentPreviewFormat({ name, mimeType })).toBeNull()
  })

  it('accepts a correctly signed safe raster and gives it a canonical MIME type', async () => {
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], { type: 'application/octet-stream' })

    const safe = await createSafeAttachmentPreviewBlob(
      { name: 'evidence.png', mimeType: 'image/png' },
      png,
    )

    expect(safe).not.toBeNull()
    expect(safe?.type).toBe('image/png')
  })

  it('rejects SVG bytes disguised with a safe PNG name and MIME type', async () => {
    const disguisedSvg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], {
      type: 'image/png',
    })

    await expect(createSafeAttachmentPreviewBlob(
      { name: 'evidence.png', mimeType: 'image/png' },
      disguisedSvg,
    )).resolves.toBeNull()
  })

  it('never opens an active attachment preview and downloads it as octet-stream', async () => {
    apiRequest.mockResolvedValue(
      new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }),
    )
    const openSpy = vi.spyOn(window, 'open')
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-only')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await expect(previewAttachment({
      id: 'svg-id',
      name: 'payload.svg',
      attachedAt: '2026-07-20T12:00:00.000Z',
      uploadedBy: 'attacker',
      mimeType: 'image/svg+xml',
      storagePath: 'contracts/payload.svg',
    })).resolves.toBe('downloaded')

    expect(openSpy).not.toHaveBeenCalled()
    expect(objectUrlSpy).toHaveBeenCalledTimes(1)
    expect((objectUrlSpy.mock.calls[0][0] as Blob).type).toBe('application/octet-stream')
  })

  it('forces the explicit download helper to strip active MIME types', async () => {
    apiRequest.mockResolvedValue(
      new Blob(['<html><script>alert(1)</script></html>'], { type: 'text/html' }),
    )
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:forced-download')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await downloadAttachment({
      id: 'html-id',
      name: 'payload.html',
      attachedAt: '2026-07-20T12:00:00.000Z',
      uploadedBy: 'attacker',
      mimeType: 'text/html',
      storagePath: 'contracts/payload.html',
    })

    expect((objectUrlSpy.mock.calls[0][0] as Blob).type).toBe('application/octet-stream')
  })
})
