import type { FileAttachment, Subcontractor } from '../types'

type SourcingQuoteSource = Pick<
  Subcontractor,
  'id' | 'quoteFile' | 'quoteFiles' | 'createdAt' | 'createdBy'
>

function attachmentKey(file: FileAttachment): string {
  return file.storagePath || file.url || file.dataUrl || file.id || `${file.name}|${file.attachedAt}`
}

/**
 * Returns quote attachments from both the current multi-file field and the
 * legacy single-filename field used by older sourcing records.
 */
export function getSourcingQuoteAttachments(entry: SourcingQuoteSource): FileAttachment[] {
  const modernFiles = (entry.quoteFiles || []).filter(file => Boolean(file?.name?.trim()))
  if (modernFiles.length > 0) {
    return Array.from(new Map(modernFiles.map(file => [attachmentKey(file), file])).values())
  }

  const legacyName = entry.quoteFile?.trim()
  if (!legacyName) return []

  return [{
    id: `legacy-sourcing-quote-${entry.id}`,
    name: legacyName,
    attachedAt: entry.createdAt || '',
    uploadedBy: entry.createdBy || 'Sourcing',
  }]
}

export function hasSourcingQuote(entry: SourcingQuoteSource): boolean {
  return getSourcingQuoteAttachments(entry).length > 0
}

export function collectSourcingQuoteAttachments(entries: SourcingQuoteSource[]): FileAttachment[] {
  const bySource = new Map<string, FileAttachment>()
  entries.flatMap(getSourcingQuoteAttachments).forEach(file => {
    const key = attachmentKey(file)
    if (!bySource.has(key)) bySource.set(key, file)
  })
  return Array.from(bySource.values())
}
