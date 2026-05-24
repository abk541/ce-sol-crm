import { describe, expect, it } from 'vitest'
import type { Contract } from '../types'
import {
  canGenerateContractInvoice,
  invoiceAmountForContract,
  subkMonthlyBillingRowsForContract,
  subkQuoteSummaryForContract,
} from '../lib/invoicePdf'

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    contractId: 'W912-TEST',
    title: 'Test Contract',
    type: 'OTJ',
    naicsCode: '238220',
    status: 'KICK_OFF',
    location: 'Rabat, MA',
    popStart: '2026-05-01',
    popEnd: '2026-12-31',
    value: 250_000,
    spm: '',
    pm: '',
    ...overrides,
  }
}

describe('contract invoice helpers', () => {
  it('returns total contract value for OTJ invoices', () => {
    expect(invoiceAmountForContract(makeContract({ type: 'OTJ', value: 450_000 }))).toBe(450_000)
  })

  it('returns monthly value for recurring invoices', () => {
    expect(invoiceAmountForContract(makeContract({ type: 'RECURRING', value: 450_000, monthlyPayment: 37_500 }))).toBe(37_500)
  })

  it('allows recurring invoices before pending payment but gates OTJ until pending payment', () => {
    expect(canGenerateContractInvoice(makeContract({ type: 'RECURRING', status: 'PERFORMING' }))).toBe(true)
    expect(canGenerateContractInvoice(makeContract({ type: 'OTJ', status: 'PERFORMING' }))).toBe(false)
    expect(canGenerateContractInvoice(makeContract({ type: 'OTJ', status: 'PENDING_PAYMENT' }))).toBe(true)
  })

  it('surfaces subk quote and monthly billing rows', () => {
    const contract = makeContract({
      lockedSubcontractors: [{
        id: 'sub-1',
        contractId: 'contract-1',
        companyName: 'ABC Subk',
        contactName: 'Jane',
        quotes: ['abc-quote.pdf'],
        invoices: ['may-invoice.pdf'],
        createdAt: '2026-05-01',
        createdBy: 'manager',
      }],
    })

    expect(subkQuoteSummaryForContract(contract)).toContain('ABC Subk: abc-quote.pdf')
    expect(subkMonthlyBillingRowsForContract(contract)[0]).toContain('ABC Subk')
    expect(subkMonthlyBillingRowsForContract(contract)[0]).toContain('may-invoice.pdf')
  })

  it('uses locked subk document attachment names when present', () => {
    const contract = makeContract({
      lockedSubcontractors: [{
        id: 'sub-1',
        contractId: 'contract-1',
        companyName: 'Premium Subk',
        contactName: 'Jane',
        quotes: ['legacy-quote.pdf'],
        invoices: ['legacy-invoice.pdf'],
        documents: {
          quote: [{
            id: 'quote-1',
            name: 'viewable-quote.pdf',
            attachedAt: '2026-05-24T12:00:00.000Z',
            uploadedBy: 'manager',
            dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
            mimeType: 'application/pdf',
            size: 8,
          }],
          invoice: [{
            id: 'invoice-1',
            name: 'viewable-invoice.pdf',
            attachedAt: '2026-05-24T12:00:00.000Z',
            uploadedBy: 'manager',
          }],
        },
        createdAt: '2026-05-01',
        createdBy: 'manager',
      }],
    })

    expect(subkQuoteSummaryForContract(contract)).toContain('Premium Subk: viewable-quote.pdf')
    expect(subkQuoteSummaryForContract(contract)).not.toContain('legacy-quote.pdf')
    expect(subkMonthlyBillingRowsForContract(contract)[0]).toContain('viewable-invoice.pdf')
  })
})
