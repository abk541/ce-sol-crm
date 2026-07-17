import { describe, expect, it } from 'vitest'
import type { FileAttachment, Subcontractor } from '../types'
import {
  collectSourcingQuoteAttachments,
  getSourcingQuoteAttachments,
  hasSourcingQuote,
} from '../lib/subcontractorQuotes'

function makeSubcontractor(overrides: Partial<Subcontractor> = {}): Subcontractor {
  return {
    id: 'sub-1',
    opportunityId: 'opp-1',
    companyName: 'Quoted Vendor',
    contactName: 'Primary Contact',
    email: 'contact@example.test',
    phone: '',
    naicsCode: '',
    setAside: '',
    notes: '',
    createdAt: '2026-07-16T12:00:00.000Z',
    createdBy: 'capture-manager',
    ...overrides,
  }
}

function makeAttachment(overrides: Partial<FileAttachment> = {}): FileAttachment {
  return {
    id: 'quote-1',
    name: 'vendor-quote.xlsx',
    attachedAt: '2026-07-16T12:00:00.000Z',
    uploadedBy: 'capture-manager',
    storagePath: 'quotes/quote-1-vendor-quote.xlsx',
    ...overrides,
  }
}

describe('sourcing quote compatibility', () => {
  it('recognizes a quote saved in the current multi-file field', () => {
    const quote = makeAttachment()
    const subcontractor = makeSubcontractor({ quoteFile: '', quoteFiles: [quote] })

    expect(hasSourcingQuote(subcontractor)).toBe(true)
    expect(getSourcingQuoteAttachments(subcontractor)).toEqual([quote])
  })

  it('keeps legacy single-filename quotes eligible for locking', () => {
    const subcontractor = makeSubcontractor({ quoteFile: 'legacy-quote.pdf' })

    expect(hasSourcingQuote(subcontractor)).toBe(true)
    expect(getSourcingQuoteAttachments(subcontractor)).toMatchObject([
      { name: 'legacy-quote.pdf', uploadedBy: 'capture-manager' },
    ])
  })

  it('does not treat a sourcing record without a quote as quote-backed', () => {
    expect(hasSourcingQuote(makeSubcontractor())).toBe(false)
  })

  it('deduplicates the same uploaded quote when sourcing entries are merged', () => {
    const quote = makeAttachment()
    const entries = [
      makeSubcontractor({ id: 'sub-1', quoteFiles: [quote] }),
      makeSubcontractor({ id: 'sub-2', quoteFiles: [quote] }),
    ]

    expect(collectSourcingQuoteAttachments(entries)).toEqual([quote])
  })
})
