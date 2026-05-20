import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Contract } from '../types'

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function fmtMoney(value?: number) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function invoiceAmountForContract(contract: Contract) {
  if (contract.type === 'RECURRING') return contract.monthlyPayment || 0
  return contract.value || 0
}

export function invoiceCadenceForContract(contract: Contract) {
  return contract.type === 'RECURRING' ? 'Monthly recurring invoice' : 'One-time job invoice'
}

export function canGenerateContractInvoice(contract: Contract) {
  return contract.type === 'RECURRING' || contract.status === 'PENDING_PAYMENT'
}

export function subkQuoteSummaryForContract(contract: Contract) {
  const quotes = (contract.lockedSubcontractors || [])
    .flatMap(sub => (sub.quotes || []).map(quote => `${sub.companyName}: ${quote}`))

  if (quotes.length === 0) return 'No locked subk quotes yet'
  return quotes.join(', ')
}

export function subkMonthlyBillingRowsForContract(contract: Contract) {
  const subs = contract.lockedSubcontractors || []
  if (subs.length === 0) return ['No locked subk billing rows yet']
  return subs.map(sub => {
    const invoiceNote = (sub.invoices || []).length > 0 ? ` - invoices: ${(sub.invoices || []).join(', ')}` : ''
    return `${sub.companyName}: monthly billing to be confirmed${invoiceNote}`
  })
}

export async function generateContractInvoicePdf(contract: Contract) {
  if (!canGenerateContractInvoice(contract)) {
    throw new Error('OTJ invoices can only be generated when the contract is pending payment.')
  }

  const templateUrl = `${import.meta.env.BASE_URL}templates/pp-template.pdf`
  const templateBytes = await fetch(templateUrl).then(res => {
    if (!res.ok) throw new Error('Invoice PDF template could not be loaded.')
    return res.arrayBuffer()
  })

  const pdf = await PDFDocument.load(templateBytes)
  const page = pdf.getPage(0)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.08, 0.12, 0.2)
  const muted = rgb(0.28, 0.33, 0.42)
  const accent = rgb(0.02, 0.46, 0.39)
  const amount = invoiceAmountForContract(contract)
  const invoicePeriod = contract.type === 'RECURRING'
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date())
    : 'One-time job total'
  const subkRows = contract.type === 'RECURRING'
    ? subkMonthlyBillingRowsForContract(contract)
    : [`Quote (Subk's): ${subkQuoteSummaryForContract(contract)}`]

  const write = (label: string, value: string, x: number, y: number, width = 40) => {
    page.drawText(label, { x, y, size: 7, font: bold, color: muted })
    wrapText(value || '-', width).slice(0, 2).forEach((line, i) => {
      page.drawText(line, { x, y: y - 12 - i * 11, size: 9, font, color: ink })
    })
  }

  page.drawText('INVOICE', { x: 56, y: 736, size: 18, font: bold, color: accent })
  page.drawText(invoiceCadenceForContract(contract), { x: 56, y: 718, size: 9, font, color: muted })
  page.drawText(fmtMoney(amount), { x: 405, y: 731, size: 18, font: bold, color: accent })
  page.drawText(contract.type === 'RECURRING' ? 'MONTHLY RETURN' : 'TOTAL RETURN', { x: 405, y: 716, size: 7, font: bold, color: muted })

  write('CONTRACT', contract.title, 56, 682, 62)
  write('INVOICE DATE', new Date().toLocaleDateString('en-US'), 405, 682, 22)
  write('CONTRACT ID', contract.contractId || contract.id, 56, 635, 42)
  write('CLIENT / AGENCY', contract.client || '-', 235, 635, 42)
  write('LOCATION', contract.location || '-', 405, 635, 28)
  write('TYPE', contract.type === 'S&D' ? 'Delivery' : contract.type, 56, 587, 24)
  write('STATUS', contract.status, 160, 587, 22)
  write('INVOICE PERIOD', invoicePeriod, 245, 587, 24)
  write('TOTAL CONTRACT VALUE', fmtMoney(contract.value || 0), 360, 587, 28)

  if (contract.type === 'RECURRING') {
    write('MONTHLY PAYMENT (GOV)', fmtMoney(contract.monthlyPayment || 0), 56, 535, 36)
  } else {
    write("QUOTE (SUBK'S)", subkQuoteSummaryForContract(contract), 56, 535, 80)
  }

  page.drawText(contract.type === 'RECURRING' ? 'MONTHLY BILLING (SUBK)' : 'SUBK QUOTE REFERENCE', {
    x: 56,
    y: 486,
    size: 8,
    font: bold,
    color: muted,
  })
  subkRows.slice(0, 12).forEach((row, i) => {
    wrapText(row, 95).slice(0, 2).forEach((line, j) => {
      page.drawText(`${j === 0 ? '-' : ' '} ${line}`, { x: 56, y: 470 - (i * 22) - (j * 10), size: 8.5, font, color: ink })
    })
  })

  const bytes = await pdf.save()
  const safeId = (contract.contractId || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `invoice-${safeId}.pdf`)
}
