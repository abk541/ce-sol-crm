import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileAttachment } from '../types'

const mocks = vi.hoisted(() => ({
  downloadAttachment: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../lib/attachments', () => ({
  hasAttachmentSource: (attachment: FileAttachment) => Boolean(
    attachment.storagePath || attachment.url || attachment.dataUrl,
  ),
  downloadAttachment: mocks.downloadAttachment,
  attachmentAccessErrorMessage: (error: unknown, fallback: string) => (
    (error as { code?: string })?.code === 'file_content_unavailable'
      ? 'This saved file is no longer available. Re-upload the original file to restore downloads.'
      : fallback
  ),
}))

vi.mock('react-hot-toast', () => ({
  default: { error: mocks.toastError },
}))

import {
  AttachmentDownloadAction,
  AttachmentDownloadRow,
} from '../components/shared/AttachmentDownloadAction'

const storedAttachment: FileAttachment = {
  id: 'proposal-1',
  name: 'proposal.pdf',
  attachedAt: '2026-07-31T12:00:00.000Z',
  uploadedBy: 'Associate',
  storagePath: 'proposals/proposal-1-proposal.pdf',
}

describe('visible attachment download controls', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.downloadAttachment.mockReset().mockResolvedValue(undefined)
    mocks.toastError.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('shows a visible Download action and downloads the selected file', async () => {
    await act(async () => {
      root.render(<AttachmentDownloadAction attachment={storedAttachment} />)
    })

    const button = container.querySelector('button')
    expect(button?.textContent).toContain('Download')
    expect(button?.disabled).toBe(false)

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(mocks.downloadAttachment).toHaveBeenCalledWith(storedAttachment)
  })

  it('keeps metadata-only files visible with a disabled re-upload instruction', async () => {
    const legacyAttachment = { ...storedAttachment, storagePath: undefined }
    await act(async () => {
      root.render(<AttachmentDownloadRow attachment={legacyAttachment} />)
    })

    expect(container.textContent).toContain('proposal.pdf')
    expect(container.textContent).toContain('Re-upload required')
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(mocks.downloadAttachment).not.toHaveBeenCalled()
  })

  it('uses the actionable unavailable-file message when stored bytes are missing', async () => {
    mocks.downloadAttachment.mockRejectedValue({ code: 'file_content_unavailable' })
    await act(async () => {
      root.render(<AttachmentDownloadAction attachment={storedAttachment} />)
    })

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(mocks.toastError).toHaveBeenCalledWith(
      'This saved file is no longer available. Re-upload the original file to restore downloads.',
    )
  })
})
