import { describe, expect, it } from 'vitest'
import type { Contract } from '../types'
import {
  getFinanceProjectionRow,
  getFinanceProjectionSummary,
  isFinanceProjectionContract,
} from '../lib/financeProjections'

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

describe('finance projection helpers', () => {
  it('keeps archived and terminated contracts out of projections (pending-payment and canceled stay active)', () => {
    expect(isFinanceProjectionContract(makeContract({ status: 'KICK_OFF' }))).toBe(true)
    expect(isFinanceProjectionContract(makeContract({ status: 'PENDING_PAYMENT' }))).toBe(true)
    expect(isFinanceProjectionContract(makeContract({ status: 'CANCELED' }))).toBe(true)
    expect(isFinanceProjectionContract(makeContract({ status: 'ARCHIVED' }))).toBe(false)
    expect(isFinanceProjectionContract(makeContract({ status: 'TERMINATED' }))).toBe(false)
  })

  it('summarizes OTJ totals and recurring monthly projections', () => {
    const summary = getFinanceProjectionSummary([
      makeContract({ id: 'otj-1', type: 'OTJ', value: 100_000 }),
      makeContract({ id: 'rec-1', type: 'RECURRING', value: 240_000, monthlyPayment: 20_000 }),
      makeContract({ id: 'old-1', type: 'OTJ', value: 999_000, status: 'ARCHIVED' }),
    ])

    expect(summary.activeContracts).toHaveLength(2)
    expect(summary.otjContracts).toHaveLength(1)
    expect(summary.recurringContracts).toHaveLength(1)
    expect(summary.otjTotal).toBe(100_000)
    expect(summary.recurringMonthly).toBe(20_000)
    expect(summary.projectedInvoiceTotal).toBe(120_000)
  })

  it('builds row data without duplicating invoice logic in the page', () => {
    const recurringRow = getFinanceProjectionRow(makeContract({
      type: 'RECURRING',
      monthlyPayment: 15_000,
      lockedSubcontractors: [{
        id: 'sub-1',
        contractId: 'contract-1',
        companyName: 'Atlas Subk',
        contactName: 'Sam',
        invoices: ['may.pdf'],
        createdAt: '2026-05-01',
        createdBy: 'manager',
      }],
    }))

    const otjRow = getFinanceProjectionRow(makeContract({
      type: 'OTJ',
      status: 'PENDING_PAYMENT',
      value: 50_000,
      lockedSubcontractors: [{
        id: 'sub-2',
        contractId: 'contract-1',
        companyName: 'Build Subk',
        contactName: 'Lee',
        quotes: ['quote.pdf'],
        createdAt: '2026-05-01',
        createdBy: 'manager',
      }],
    }))

    expect(recurringRow.isRecurring).toBe(true)
    expect(recurringRow.invoiceAmount).toBe(15_000)
    expect(recurringRow.subkRows[0]).toContain('Atlas Subk')

    expect(otjRow.isRecurring).toBe(false)
    expect(otjRow.invoiceReady).toBe(true)
    expect(otjRow.invoiceAmount).toBe(50_000)
    expect(otjRow.subkRows[0]).toContain('Build Subk: quote.pdf')
  })
})

