import type { FileAttachment } from '../types'
import { apiRequest, envelopeData } from './api'

const MAX_AWARD_DOCUMENT_NAME_LENGTH = 180

function sourceExtension(filename: string): string {
  return filename.trim().match(/(\.[A-Za-z0-9]{1,16})$/)?.[1] ?? ''
}

/**
 * Builds a safe, human-readable filename while retaining the uploaded file's
 * real extension. The resulting name is stored by the private attachment API,
 * so downloads keep the custom award-document name on every device.
 */
export function awardDocumentFilename(customName: string, originalFilename: string): string {
  const normalized = customName
    .replace(/[\u0000-\u001f\u007f/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) throw new Error('Enter a document name before uploading.')

  const extension = sourceExtension(originalFilename)
  const matchingExtension = extension
    ? normalized.toLowerCase().endsWith(extension.toLowerCase())
    : false
  const suffix = matchingExtension ? normalized.slice(-extension.length) : extension
  const baseName = matchingExtension
    ? normalized.slice(0, -extension.length).trim()
    : normalized
  const maxBaseLength = Math.max(1, MAX_AWARD_DOCUMENT_NAME_LENGTH - suffix.length)
  const base = (baseName || 'Award document').slice(0, maxBaseLength).trim()

  return `${base}${suffix}`
}

export function createAwardDocumentUploadFile(file: File, customName: string): File {
  return new File(
    [file],
    awardDocumentFilename(customName, file.name),
    { type: file.type, lastModified: file.lastModified },
  )
}

export function appendAwardDocument(
  documents: readonly FileAttachment[],
  attachment: FileAttachment,
): FileAttachment[] {
  return [...documents, attachment]
}

export function removeAwardDocument(
  documents: readonly FileAttachment[],
  attachmentId: string,
): FileAttachment[] {
  return documents.filter(document => document.id !== attachmentId)
}

function attachmentIdentity(attachment: FileAttachment): string {
  return attachment.storagePath || attachment.id
}

export function detachedAwardDocuments(
  before: readonly FileAttachment[],
  after: readonly FileAttachment[],
): FileAttachment[] {
  const retained = new Set(after.map(attachmentIdentity))
  return before.filter(document => !retained.has(attachmentIdentity(document)))
}

export type AwardDocumentCleanupStatus =
  | 'deleted'
  | 'queued'
  | 'missing'
  | 'referenced'
  | 'skipped'

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code : ''
}

export async function cleanupContractAwardDocument(
  attachment: FileAttachment,
): Promise<AwardDocumentCleanupStatus> {
  const storagePath = attachment.storagePath
  if (!storagePath?.startsWith('contract_awards/')) return 'skipped'

  try {
    const response = await apiRequest<{
      data: {
        cleanupPending?: boolean
        status?: 'deleted' | 'queued'
      }
    }>(
      `/files/contract-awards/${encodeURIComponent(storagePath)}`,
      { method: 'DELETE' },
    )
    const result = envelopeData<{
      cleanupPending?: boolean
      status?: 'deleted' | 'queued'
    }>(response)
    return result.cleanupPending || result.status === 'queued'
      ? 'queued'
      : 'deleted'
  } catch (error) {
    if (errorCode(error) === 'file_not_found') return 'missing'
    if (errorCode(error) === 'file_still_referenced') return 'referenced'
    throw error
  }
}

export interface AwardDocumentCleanupSummary {
  deleted: FileAttachment[]
  queued: FileAttachment[]
  missing: FileAttachment[]
  referenced: FileAttachment[]
  skipped: FileAttachment[]
  failed: Array<{ attachment: FileAttachment; error: unknown }>
}

export async function cleanupContractAwardDocuments(
  attachments: readonly FileAttachment[],
  cleanup: (attachment: FileAttachment) => Promise<AwardDocumentCleanupStatus> = cleanupContractAwardDocument,
): Promise<AwardDocumentCleanupSummary> {
  const unique = Array.from(new Map(
    attachments.map(attachment => [attachmentIdentity(attachment), attachment]),
  ).values())
  const summary: AwardDocumentCleanupSummary = {
    deleted: [],
    queued: [],
    missing: [],
    referenced: [],
    skipped: [],
    failed: [],
  }

  await Promise.all(unique.map(async attachment => {
    try {
      const status = await cleanup(attachment)
      summary[status].push(attachment)
    } catch (error) {
      summary.failed.push({ attachment, error })
    }
  }))
  return summary
}
