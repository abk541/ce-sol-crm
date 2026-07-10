import type { FileAttachment } from '../types'
import { supabase, isSupabaseConnected } from './supabase'

// Name of the Supabase Storage bucket that holds uploaded files (proposals,
// quotes, COIs, W9s, etc.). Create it once via the migration in
// supabase/migrations (see 20260710120000_create_attachments_bucket.sql).
export const ATTACHMENTS_BUCKET = 'attachments'

// Files at or below this size may fall back to inline base64 (data URL) when
// Supabase Storage is unavailable. Larger files MUST go to Storage because the
// persisted Zustand store lives in localStorage (~5MB per-origin cap) and
// base64 inflates payloads ~33%.
const INLINE_FALLBACK_LIMIT = 1_500_000 // ~1.5 MB

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, '_')
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('File could not be read.'))
    reader.readAsDataURL(file)
  })
}

export interface UploadAttachmentOptions {
  /** Logical folder inside the bucket, e.g. 'proposals' or 'quotes'. */
  folder?: string
  /** Username recorded on the attachment. */
  uploadedBy?: string
  /** ISO timestamp; defaults to now. */
  attachedAt?: string
  /** Pre-generated id; defaults to a random UUID. */
  id?: string
}

/**
 * Uploads a file to Supabase Storage and returns a lightweight FileAttachment
 * referencing the stored object by URL (no base64 payload). Falls back to inline
 * base64 for small files when Storage is unavailable so offline/dev still works.
 */
export async function uploadAttachment(
  file: File,
  opts: UploadAttachmentOptions = {},
): Promise<FileAttachment> {
  const id = opts.id ?? crypto.randomUUID()
  const attachedAt = opts.attachedAt
    ? new Date(opts.attachedAt).toISOString()
    : new Date().toISOString()
  const base: FileAttachment = {
    id,
    name: file.name,
    attachedAt,
    uploadedBy: opts.uploadedBy ?? '',
    mimeType: file.type || undefined,
    size: file.size,
  }

  if (isSupabaseConnected && supabase) {
    const folder = (opts.folder ?? 'misc').replace(/[^\w\-]+/g, '_')
    const path = `${folder}/${id}-${sanitizeName(file.name)}`
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    })
    if (!error) {
      const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path)
      return { ...base, url: data.publicUrl, storagePath: path }
    }
    // Storage upload failed. Only small files can safely fall back to inline base64.
    if (file.size > INLINE_FALLBACK_LIMIT) {
      throw new Error(
        `Upload failed: ${error.message}. Make sure the "${ATTACHMENTS_BUCKET}" storage bucket exists and allows uploads.`,
      )
    }
  } else if (file.size > INLINE_FALLBACK_LIMIT) {
    throw new Error(
      'This file is too large to store offline. Connect to Supabase (with the "attachments" bucket) to upload it.',
    )
  }

  // Inline fallback for small files / offline mode.
  const dataUrl = await readAsDataUrl(file)
  return { ...base, dataUrl }
}

/** Preferred downloadable source for an attachment (Storage URL, else inline data URL). */
export function resolveAttachmentSource(file: Pick<FileAttachment, 'url' | 'dataUrl'>): string {
  return file.url ?? file.dataUrl ?? ''
}

/** True when the attachment has any retrievable content. */
export function hasAttachmentSource(file: Pick<FileAttachment, 'url' | 'dataUrl'>): boolean {
  return !!(file.url || file.dataUrl)
}

/** Fetches the attachment and triggers a browser download with the original filename. */
export async function downloadAttachment(file: FileAttachment): Promise<void> {
  const source = resolveAttachmentSource(file)
  if (!source) throw new Error('This attachment has no downloadable content.')
  const res = await fetch(source)
  if (!res.ok) throw new Error(`Download failed (${res.status}).`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = file.name || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
