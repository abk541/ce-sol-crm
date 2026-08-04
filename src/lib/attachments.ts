import type { FileAttachment } from '../types'
import { apiRequest, envelopeData } from './api'

export interface UploadAttachmentOptions {
  /** Logical category used by the private file service. */
  folder?: string
  /** Username recorded on the attachment. */
  uploadedBy?: string
  /** ISO timestamp; defaults to now. */
  attachedAt?: string
  /** Pre-generated id; defaults to a random UUID. */
  id?: string
}

/**
 * Uploads a file to the authenticated private file API. New uploads never fall
 * back to browser-local base64, so every durable attachment has one source of
 * truth and remains available to authorized users on every device.
 */
export async function uploadAttachment(
  file: File,
  opts: UploadAttachmentOptions = {},
): Promise<FileAttachment> {
  const id = opts.id ?? crypto.randomUUID()
  const attachedAt = opts.attachedAt
    ? new Date(opts.attachedAt).toISOString()
    : new Date().toISOString()
  const form = new FormData()
  form.set('file', file, file.name)
  form.set('id', id)
  form.set('attachedAt', attachedAt)
  if (opts.folder) form.set('folder', opts.folder)

  const response = await apiRequest<unknown>('/files', {
    method: 'POST',
    body: form,
  })
  const attachment = envelopeData<FileAttachment>(response)
  if (!attachment?.id || !attachment.storagePath) {
    throw new Error('The file service returned an invalid upload response.')
  }
  return attachment
}

export interface AttachmentBatchUploadResult {
  uploadedCount: number
  error?: unknown
}

/**
 * Uploads in sequence and exposes each successful result immediately. If a
 * later file fails, earlier uploads remain visible to the form and can still
 * be attached on a retry instead of silently becoming orphaned objects.
 */
export async function uploadAttachmentsSequentially(
  files: readonly File[],
  opts: UploadAttachmentOptions,
  onUploaded: (attachment: FileAttachment) => void,
  uploader: typeof uploadAttachment = uploadAttachment,
): Promise<AttachmentBatchUploadResult> {
  let uploadedCount = 0
  try {
    for (const file of files) {
      const attachment = await uploader(file, opts)
      onUploaded(attachment)
      uploadedCount += 1
    }
    return { uploadedCount }
  } catch (error) {
    return { uploadedCount, error }
  }
}

function resolveLegacyAttachmentSource(file: Pick<FileAttachment, 'url' | 'dataUrl'>): string {
  return file.dataUrl ?? file.url ?? ''
}

/** True when the attachment has any retrievable content. */
export function hasAttachmentSource(file: Pick<FileAttachment, 'storagePath' | 'url' | 'dataUrl'>): boolean {
  return !!(file.storagePath || file.dataUrl || file.url)
}

export type AttachmentAvailabilityReason = 'available' | 'not_found' | 'content_unavailable'

export interface AttachmentAvailability {
  storagePath: string
  available: boolean
  reason: AttachmentAvailabilityReason
}

const attachmentFields = [
  'id',
  'name',
  'attachedAt',
  'uploadedBy',
  'mimeType',
  'size',
  'storagePath',
  'url',
  'dataUrl',
] as const satisfies readonly (keyof FileAttachment)[]

/**
 * Compares the persisted attachment list, including order and metadata. This
 * lets edit forms omit an unchanged legacy list so an unrelated field edit is
 * never blocked merely because an old file predates private storage.
 */
export function sameAttachmentList(
  left: readonly FileAttachment[],
  right: readonly FileAttachment[],
): boolean {
  return left.length === right.length && left.every((attachment, index) => {
    const other = right[index]
    return !!other && attachmentFields.every(field => attachment[field] === other[field])
  })
}

export function normalizeAttachmentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function normalizedAttachmentName(attachment: FileAttachment): string {
  return normalizeAttachmentName(attachment.name)
}

function strongAttachmentIdentity(attachment: FileAttachment): string {
  const storagePath = attachment.storagePath?.trim()
  if (storagePath) return `path:${storagePath}`
  const id = attachment.id?.trim()
  return id ? `id:${id}` : ''
}

/**
 * Keeps every distinct canonical opportunity file. Contract snapshots are
 * fallback-only: a same-name snapshot is suppressed when the opportunity has
 * a live replacement, but two genuine canonical versions with the same name
 * remain visible and downloadable.
 */
export function mergeCanonicalProposalAttachments(
  canonical: readonly FileAttachment[],
  fallbacks: readonly FileAttachment[],
): FileAttachment[] {
  const merged: FileAttachment[] = []
  const seenStrongIdentities = new Set<string>()
  const canonicalNames = new Set<string>()
  const seenNameOnlyFallbacks = new Set<string>()

  for (const attachment of canonical) {
    const identity = strongAttachmentIdentity(attachment)
    if (identity && seenStrongIdentities.has(identity)) continue
    if (identity) seenStrongIdentities.add(identity)
    const name = normalizedAttachmentName(attachment)
    if (name) canonicalNames.add(name)
    merged.push(attachment)
  }

  for (const attachment of fallbacks) {
    const identity = strongAttachmentIdentity(attachment)
    if (identity && seenStrongIdentities.has(identity)) continue
    const name = normalizedAttachmentName(attachment)
    if (name && canonicalNames.has(name)) continue
    if (!identity && name && seenNameOnlyFallbacks.has(name)) continue
    if (identity) seenStrongIdentities.add(identity)
    else if (name) seenNameOnlyFallbacks.add(name)
    merged.push(attachment)
  }

  return merged
}

/**
 * Checks private file references in one authenticated request. Availability is
 * authoritative only for the returned moment; workflow writes repeat the same
 * check on the server before proposal references are committed.
 */
export async function checkAttachmentAvailability(
  storagePaths: readonly string[],
): Promise<AttachmentAvailability[]> {
  const response = await apiRequest<unknown>('/files/availability', {
    method: 'POST',
    body: JSON.stringify({ paths: storagePaths }),
  })
  return envelopeData<AttachmentAvailability[]>(response)
}

/**
 * Gives users an actionable explanation when a saved file reference remains
 * but its original bytes are unavailable. Other failures retain the
 * page-specific fallback so network and permission details are not leaked.
 */
export function attachmentAccessErrorMessage(error: unknown, fallback: string): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : null
  if (code === 'file_not_found' || code === 'file_content_unavailable') {
    return 'This saved file is no longer available. Re-upload the original file to restore downloads.'
  }
  return fallback
}

/**
 * Loads attachment bytes, preferring the authenticated private file API.
 * Legacy public URLs and inline data URLs remain read-only fallbacks for old
 * records created before the private-bucket migration.
 */
export async function loadAttachmentBlob(
  file: Pick<FileAttachment, 'storagePath' | 'url' | 'dataUrl'>,
): Promise<Blob> {
  if (file.storagePath) {
    // Use the query route so long original filenames never become one router
    // parameter. The path route remains supported by the API for cached
    // clients, but routers commonly cap a single parameter near 100 bytes.
    return apiRequest<Blob>(`/files?path=${encodeURIComponent(file.storagePath)}`, {}, {
      responseType: 'blob',
    })
  }

  const source = resolveLegacyAttachmentSource(file)
  if (source) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Download failed (${response.status}).`)
    return response.blob()
  }

  throw new Error('This attachment has no downloadable content.')
}

type AttachmentPreviewFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'bmp' | 'pdf'

const PREVIEW_EXTENSION_FORMAT: Record<string, AttachmentPreviewFormat> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.avif': 'avif',
  '.bmp': 'bmp',
  '.pdf': 'pdf',
}

const PREVIEW_MIME_FORMAT: Record<string, AttachmentPreviewFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
}

const PREVIEW_CANONICAL_MIME: Record<AttachmentPreviewFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
}

const GENERIC_BINARY_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

function attachmentExtension(name: string): string {
  const match = name.trim().toLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ''
}

function previewFormatFromMime(value: string | undefined): AttachmentPreviewFormat | null {
  const mime = (value ?? '').split(';', 1)[0].trim().toLowerCase()
  return PREVIEW_MIME_FORMAT[mime] ?? null
}

/**
 * Returns a preview candidate only for inert raster formats and PDF. Active
 * formats such as SVG, HTML, XML, and mismatched filename/MIME combinations
 * are download-only.
 */
export function getAttachmentPreviewFormat(
  file: Pick<FileAttachment, 'name' | 'mimeType'>,
): AttachmentPreviewFormat | null {
  const format = PREVIEW_EXTENSION_FORMAT[attachmentExtension(file.name)] ?? null
  if (!format) return null

  const declaredMime = (file.mimeType ?? '').split(';', 1)[0].trim().toLowerCase()
  if (GENERIC_BINARY_MIME_TYPES.has(declaredMime)) return format
  return previewFormatFromMime(declaredMime) === format ? format : null
}

function startsWithBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

async function hasExpectedFileSignature(blob: Blob, format: AttachmentPreviewFormat): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer())
  switch (format) {
    case 'png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
    case 'gif':
      return ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a'
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
    case 'avif': {
      if (ascii(bytes, 4, 4) !== 'ftyp') return false
      const brands = ascii(bytes, 8, Math.min(Math.max(bytes.length - 8, 0), 64))
      return brands.includes('avif') || brands.includes('avis')
    }
    case 'bmp':
      return ascii(bytes, 0, 2) === 'BM'
    case 'pdf':
      return ascii(bytes, 0, Math.min(bytes.length, 1024)).includes('%PDF-')
  }
}

/**
 * Returns a canonically typed Blob only after metadata and magic-byte checks.
 * Returning null means the object must be downloaded and never blob-previewed.
 */
export async function createSafeAttachmentPreviewBlob(
  file: Pick<FileAttachment, 'name' | 'mimeType'>,
  blob: Blob,
): Promise<Blob | null> {
  const format = getAttachmentPreviewFormat(file)
  if (!format) return null

  const actualMime = blob.type.split(';', 1)[0].trim().toLowerCase()
  if (
    !GENERIC_BINARY_MIME_TYPES.has(actualMime) &&
    previewFormatFromMime(actualMime) !== format
  ) {
    return null
  }
  if (!(await hasExpectedFileSignature(blob, format))) return null

  return blob.slice(0, blob.size, PREVIEW_CANONICAL_MIME[format])
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  // Strip any active Content-Type from the download URL. The download
  // attribute is the primary disposition control; octet-stream is defense in
  // depth if a browser or extension attempts to navigate to the Blob URL.
  const downloadBlob = blob.slice(0, blob.size, 'application/octet-stream')
  const objectUrl = URL.createObjectURL(downloadBlob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || 'download'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

/** Fetches the attachment and forces a browser download with the original filename. */
export async function downloadAttachment(file: FileAttachment): Promise<void> {
  triggerBlobDownload(await loadAttachmentBlob(file), file.name)
}

/**
 * Previews only validated inert raster/PDF bytes. Active or spoofed content is
 * forced through the hardened download path without creating a preview URL.
 */
export async function previewAttachment(file: FileAttachment): Promise<'previewed' | 'downloaded'> {
  const candidateFormat = getAttachmentPreviewFormat(file)
  if (!candidateFormat) {
    await downloadAttachment(file)
    return 'downloaded'
  }

  // Open synchronously from the user gesture so popup blockers do not reject
  // the tab while authenticated private bytes are loading.
  const previewWindow = window.open('about:blank', '_blank')
  if (!previewWindow) throw new Error('Popup was blocked. Allow popups to preview attachments.')
  previewWindow.opener = null

  try {
    const blob = await loadAttachmentBlob(file)
    const safeBlob = await createSafeAttachmentPreviewBlob(file, blob)
    if (!safeBlob) {
      previewWindow.close()
      triggerBlobDownload(blob, file.name)
      return 'downloaded'
    }

    const objectUrl = URL.createObjectURL(safeBlob)
    previewWindow.location.href = objectUrl
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10 * 60 * 1000)
    return 'previewed'
  } catch (error) {
    previewWindow.close()
    throw error
  }
}
