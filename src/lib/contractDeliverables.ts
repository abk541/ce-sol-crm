import type { ContractDeliverable, FileAttachment } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeAttachment(value: unknown, index: number): FileAttachment | null {
  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' ? value.name : ''
  if (!name.trim()) return null
  const attachment: FileAttachment = {
    id: typeof value.id === 'string' ? value.id : `attachment-${index}`,
    name,
    attachedAt: typeof value.attachedAt === 'string' ? value.attachedAt : '',
    uploadedBy: typeof value.uploadedBy === 'string' ? value.uploadedBy : '',
  }
  if (typeof value.dataUrl === 'string') attachment.dataUrl = value.dataUrl
  if (typeof value.url === 'string') attachment.url = value.url
  if (typeof value.storagePath === 'string') attachment.storagePath = value.storagePath
  if (typeof value.mimeType === 'string') attachment.mimeType = value.mimeType
  if (typeof value.size === 'number') attachment.size = value.size
  return attachment
}

function legacyDeliverable(title: string, index: number): ContractDeliverable {
  return {
    id: `legacy-deliverable-${index}`,
    title,
    issuanceDate: '',
    deadline: '',
    attachments: [],
    createdAt: '',
    createdBy: 'Legacy',
  }
}

function normalizeDeliverableObject(value: Record<string, unknown>, index: number): ContractDeliverable | null {
  const title = typeof value.title === 'string'
    ? value.title
    : typeof value.name === 'string'
      ? value.name
      : ''

  if (!title.trim()) return null

  return {
    id: typeof value.id === 'string' ? value.id : `deliverable-${index}`,
    title,
    issuanceDate: typeof value.issuanceDate === 'string' ? value.issuanceDate : '',
    deadline: typeof value.deadline === 'string' ? value.deadline : '',
    attachments: Array.isArray(value.attachments)
      ? value.attachments.map(normalizeAttachment).filter(Boolean) as FileAttachment[]
      : [],
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    createdBy: typeof value.createdBy === 'string' ? value.createdBy : '',
  }
}

export function normalizeContractDeliverables(value: unknown): ContractDeliverable[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item) as unknown
          if (isRecord(parsed)) return normalizeDeliverableObject(parsed, index)
        } catch {
          // Legacy deliverables were stored as plain text entries.
        }
        return item.trim() ? legacyDeliverable(item, index) : null
      }

      if (isRecord(item)) return normalizeDeliverableObject(item, index)
      return null
    })
    .filter(Boolean) as ContractDeliverable[]
}

export function serializeContractDeliverables(deliverables?: ContractDeliverable[] | null): string[] | null {
  const normalized = normalizeContractDeliverables(deliverables)
  if (!normalized.length) return null
  return normalized.map(deliverable => JSON.stringify({
    id: deliverable.id,
    title: deliverable.title,
    issuanceDate: deliverable.issuanceDate,
    deadline: deliverable.deadline,
    attachments: deliverable.attachments ?? [],
    createdAt: deliverable.createdAt,
    createdBy: deliverable.createdBy,
  }))
}
