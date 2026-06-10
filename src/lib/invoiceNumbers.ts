import type { Contract } from '../types'

export function invoiceYearSuffix(value?: string | Date) {
  const date = value instanceof Date
    ? value
    : value
      ? new Date(`${value}T00:00:00`)
      : new Date()
  const safe = Number.isFinite(date.getTime()) ? date : new Date()
  return String(safe.getFullYear()).slice(-2)
}

export function formatInvoiceSequence(sequence?: number | string, invoiceDate?: string | Date) {
  if (typeof sequence === 'string') return sequence
  if (sequence == null || !Number.isFinite(sequence) || sequence <= 0) return 'DRAFT'
  return `INV-CES-${invoiceYearSuffix(invoiceDate)}-${String(Math.trunc(sequence)).padStart(4, '0')}`
}

export function extractInvoiceSequence(value?: string) {
  const match = (value ?? '').match(/(\d+)\s*$/)
  const parsed = match ? Number(match[1]) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

export function nextInvoiceSequenceFromContracts(contracts: Contract[]) {
  let max = 0
  for (const contract of contracts) {
    for (const invoice of contract.invoices || []) {
      max = Math.max(max, extractInvoiceSequence(invoice.invoiceNumber))
    }
  }
  return max + 1
}
