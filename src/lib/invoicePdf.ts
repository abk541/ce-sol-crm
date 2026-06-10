import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Contract, ContractInvoice, ContractLineItem, FileAttachment } from '../types'
import { formatInvoiceSequence } from './invoiceNumbers'

function fmtMoney(value?: number) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function fmtMoneyExact(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
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

function storedAttachmentName(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<FileAttachment>
    return typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : value
  } catch {
    return value
  }
}

function attachmentNames(attachments?: FileAttachment[], legacyNames?: string[]) {
  if (attachments?.length) return attachments.map(att => att.name)
  return (legacyNames || []).map(storedAttachmentName)
}

export function subkQuoteSummaryForContract(contract: Contract) {
  const subs = contract.lockedSubcontractors || []
  const lines: string[] = []
  for (const sub of subs) {
    const quotes = attachmentNames(sub.documents?.quote, sub.quotes)
    const hasRate = typeof sub.paymentRate === 'number' && Number.isFinite(sub.paymentRate) && sub.paymentRate > 0
    const ratePart = hasRate ? ` (${fmtMoneyExact(sub.paymentRate as number)})` : ''
    if (quotes.length === 0) {
      if (hasRate) lines.push(`${sub.companyName}${ratePart}`)
      continue
    }
    for (const quote of quotes) {
      lines.push(`${sub.companyName}: ${quote}${ratePart}`)
    }
  }

  if (lines.length === 0) return 'No locked subk quotes yet'
  return lines.join(', ')
}

export function subkMonthlyBillingRowsForContract(contract: Contract) {
  const subs = contract.lockedSubcontractors || []
  if (subs.length === 0) return ['No locked subk billing rows yet']
  return subs.map(sub => {
    const invoices = attachmentNames(sub.documents?.invoice, sub.invoices)
    const invoiceNote = invoices.length > 0 ? ` - invoices: ${invoices.join(', ')}` : ''
    const hasRate = typeof sub.paymentRate === 'number' && Number.isFinite(sub.paymentRate) && sub.paymentRate > 0
    const ratePart = hasRate ? `${fmtMoneyExact(sub.paymentRate as number)} / month` : 'monthly billing to be confirmed'
    return `${sub.companyName}: ${ratePart}${invoiceNote}`
  })
}

export interface InvoiceGenerationOptions {
  invoiceNumber?: number | string
  invoice?: ContractInvoice
  lineItems?: ContractLineItem[]
}

export const INVOICE_FROM_LINES = [
  'CE Solution Plus Corp.',
  '3007 43rd Ste 1, Astoria, NY 11103',
  'SAM UEI: ZVQVJUMF9K6 | www.cesolutionplus.com',
]

function formatPdfDate(value?: string) {
  if (!value) return '-'
  const d = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return value
  return d.toLocaleDateString('en-US')
}

function lineItemsForInvoice(contract: Contract, invoice?: ContractInvoice, explicit?: ContractLineItem[]) {
  if (explicit) return explicit
  const all = contract.lineItems || []
  const selectedIds = new Set(invoice?.lineItemIds || [])
  if (selectedIds.size > 0) return all.filter(line => selectedIds.has(line.id))
  const year = invoice?.popYear || contract.currentPopYear || 'base'
  return all.filter(line => line.year === year)
}

function invoiceServiceRange(contract: Contract, invoice?: ContractInvoice) {
  const start = invoice?.serviceFrom || contract.billingPeriodStart || contract.serviceDate || contract.popStart
  const end = invoice?.serviceTo || contract.billingPeriodEnd || contract.serviceDate || contract.popEnd
  if (start && end) return `${formatPdfDate(start)} To ${formatPdfDate(end)}`
  if (start) return formatPdfDate(start)
  if (end) return formatPdfDate(end)
  return '-'
}

export async function generateContractInvoicePdf(contract: Contract, options: InvoiceGenerationOptions = {}) {
  if (!canGenerateContractInvoice(contract)) {
    throw new Error('OTJ invoices can only be generated when the contract is pending payment.')
  }

  // Page geometry + brand palette (matches past-performance PDF)
  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN = 36
  const HEADER_H = 64
  const STRIPE_TOP = 8
  const STRIPE_BOTTOM = 8
  const FOOTER_H = 36
  const ORANGE = rgb(0.72, 0.34, 0.08)
  const HEADER_BG = rgb(0.04, 0.04, 0.06)
  const FOOTER_BG = rgb(0.07, 0.10, 0.14)
  const INK = rgb(0.08, 0.12, 0.2)
  const MUTED = rgb(0.32, 0.36, 0.44)
  const BORDER = rgb(0.78, 0.80, 0.84)
  const ACCENT = rgb(0.05, 0.32, 0.30)

  const sanitize = (s: string) => (s || '')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const wrapW = (text: string, maxWidth: number, size: number, useBold = false): string[] => {
    const safe = sanitize(text)
    if (!safe) return []
    const f = useBold ? bold : font
    const out: string[] = []
    for (const para of safe.split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean)
      if (!words.length) { out.push(''); continue }
      let line = ''
      for (const w of words) {
        const probe = line ? `${line} ${w}` : w
        if (f.widthOfTextAtSize(probe, size) > maxWidth && line) {
          out.push(line)
          line = w
        } else {
          line = probe
        }
      }
      if (line) out.push(line)
    }
    return out
  }

  const drawSafe = (text: string, opts: Parameters<typeof page.drawText>[1]) => {
    const safe = sanitize(text)
    if (!safe) return
    page.drawText(safe, opts)
  }

  const invoice = options.invoice
  const invoiceDate = invoice?.invoiceDate || new Date().toISOString().slice(0, 10)
  const invoiceNumber = invoice?.invoiceNumber || formatInvoiceSequence(options.invoiceNumber, invoiceDate)
  const selectedLineItems = lineItemsForInvoice(contract, invoice, options.lineItems)
  const fallbackAmount = invoice?.amount ?? invoiceAmountForContract(contract)
  const invoiceRows = selectedLineItems.length > 0
    ? selectedLineItems.map(line => ({
        clin: line.clin,
        description: line.description || contract.title,
        quantity: line.quantity || 0,
        unit: line.unit || '-',
        rate: line.rate || 0,
        amount: line.amount || 0,
      }))
    : [{
        clin: '0001',
        description: contract.title,
        quantity: 1,
        unit: contract.type === 'RECURRING' ? 'Month' : 'Job',
        rate: fallbackAmount,
        amount: fallbackAmount,
      }]
  const totalAmount = invoice?.amount ?? invoiceRows.reduce((sum, row) => sum + row.amount, 0)

  // Top orange stripe + dark header
  page.drawRectangle({ x: 0, y: PAGE_H - STRIPE_TOP, width: PAGE_W, height: STRIPE_TOP, color: ORANGE })
  const headerTop = PAGE_H - STRIPE_TOP
  page.drawRectangle({ x: 0, y: headerTop - HEADER_H, width: PAGE_W, height: HEADER_H, color: HEADER_BG })

  // Brand text (no logo image, to keep this generator self-contained)
  drawSafe('CE SOLUTION PLUS', {
    x: MARGIN,
    y: headerTop - HEADER_H / 2 + 2,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  })
  drawSafe('You have a need, we have a solution.', {
    x: MARGIN,
    y: headerTop - HEADER_H / 2 - 12,
    size: 8,
    font,
    color: rgb(0.85, 0.85, 0.88),
  })

  const meta = '|  SDVOSB  |  CAGE: 9KV33'
  const metaSize = 10
  const metaW = font.widthOfTextAtSize(meta, metaSize)
  drawSafe(meta, {
    x: PAGE_W - MARGIN - metaW,
    y: headerTop - HEADER_H / 2 - 3,
    size: metaSize,
    font,
    color: rgb(0.85, 0.85, 0.88),
  })

  // Invoice title bar
  const titleY = headerTop - HEADER_H - 28
  const titleLines = wrapW(contract.title || 'Contract invoice', PAGE_W - MARGIN * 2, 13, false).slice(0, 2)
  drawSafe('Invoice', { x: MARGIN, y: titleY, size: 22, font: bold, color: ACCENT })
  titleLines.forEach((line, index) => {
    drawSafe(line, { x: MARGIN, y: titleY - 26 - index * 14, size: 13, font, color: INK })
  })
  page.drawLine({ start: { x: MARGIN, y: titleY - 44 }, end: { x: PAGE_W - MARGIN, y: titleY - 44 }, color: INK, thickness: 0.8 })

  let cursorY = titleY - 88
  const innerLeft = MARGIN
  const innerRight = PAGE_W - MARGIN
  const innerW = innerRight - innerLeft
  const midX = innerLeft + innerW * 0.62

  drawSafe('From:', { x: innerLeft, y: cursorY, size: 12, font: bold, color: INK })
  INVOICE_FROM_LINES.forEach((line, index) => {
    drawSafe(line, { x: innerLeft, y: cursorY - 16 - index * 13, size: 12, font, color: INK })
  })

  drawSafe('To:', { x: midX, y: cursorY, size: 12, font: bold, color: INK })
  const toLines = [contract.client || '-', contract.location || '-'].filter(Boolean)
  toLines.forEach((line, index) => {
    drawSafe(line, { x: midX, y: cursorY - 16 - index * 13, size: 12, font: index === 0 ? bold : font, color: INK })
  })

  cursorY -= 84
  page.drawLine({ start: { x: innerLeft, y: cursorY + 10 }, end: { x: innerRight, y: cursorY + 10 }, color: ORANGE, thickness: 0.7 })

  const infoRows = [
    { label: 'Service Date:', value: invoiceServiceRange(contract, invoice) },
    { label: 'Invoice Date:', value: formatPdfDate(invoiceDate) },
    { label: 'Invoice Number:', value: invoiceNumber },
  ]
  infoRows.forEach((row, index) => {
    const y = cursorY - index * 18
    drawSafe(row.label, { x: innerLeft, y, size: 12, font: bold, color: INK })
    drawSafe(row.value, { x: innerLeft + 120, y, size: 12, font, color: INK })
  })

  cursorY -= 74
  const tableTop = cursorY
  const columns = [
    { label: 'CLIN', x: innerLeft, w: 70, align: 'left' as const },
    { label: 'DESCRIPTION', x: innerLeft + 70, w: 230, align: 'left' as const },
    { label: 'QTY', x: innerLeft + 300, w: 55, align: 'right' as const },
    { label: 'UNIT', x: innerLeft + 355, w: 65, align: 'left' as const },
    { label: 'RATE', x: innerLeft + 420, w: 70, align: 'right' as const },
    { label: 'AMOUNT', x: innerLeft + 490, w: innerW - 490, align: 'right' as const },
  ]
  page.drawRectangle({ x: innerLeft, y: tableTop - 24, width: innerW, height: 24, color: HEADER_BG })
  columns.forEach(column => {
    drawSafe(column.label, {
      x: column.align === 'right' ? column.x + column.w - bold.widthOfTextAtSize(column.label, 10) - 8 : column.x + 8,
      y: tableTop - 16,
      size: 10,
      font: bold,
      color: rgb(1, 1, 1),
    })
  })

  let rowY = tableTop - 48
  invoiceRows.slice(0, 14).forEach((row, index) => {
    if (index % 2 === 0) {
      page.drawRectangle({ x: innerLeft, y: rowY - 8, width: innerW, height: 28, color: rgb(0.97, 0.98, 0.98) })
    }
    const descLines = wrapW(row.description, 215, 10).slice(0, 2)
    drawSafe(row.clin, { x: columns[0].x + 8, y: rowY, size: 10, font, color: INK })
    descLines.forEach((line, lineIndex) => {
      drawSafe(line, { x: columns[1].x + 8, y: rowY - lineIndex * 11, size: 10, font, color: INK })
    })
    const qty = String(row.quantity)
    const rate = fmtMoneyExact(row.rate)
    const amount = fmtMoneyExact(row.amount)
    drawSafe(qty, { x: columns[2].x + columns[2].w - font.widthOfTextAtSize(qty, 10) - 8, y: rowY, size: 10, font, color: INK })
    drawSafe(row.unit, { x: columns[3].x + 8, y: rowY, size: 10, font, color: INK })
    drawSafe(rate, { x: columns[4].x + columns[4].w - font.widthOfTextAtSize(rate, 10) - 8, y: rowY, size: 10, font, color: INK })
    drawSafe(amount, { x: columns[5].x + columns[5].w - font.widthOfTextAtSize(amount, 10) - 8, y: rowY, size: 10, font, color: INK })
    rowY -= descLines.length > 1 ? 36 : 28
  })

  page.drawLine({ start: { x: innerLeft, y: rowY + 6 }, end: { x: innerRight, y: rowY + 6 }, color: BORDER, thickness: 0.8 })
  const totalLabel = 'TOTAL'
  const totalText = fmtMoneyExact(totalAmount)
  drawSafe(totalLabel, { x: innerLeft + 390, y: rowY - 12, size: 11, font: bold, color: INK })
  drawSafe(totalText, { x: innerRight - bold.widthOfTextAtSize(totalText, 12), y: rowY - 12, size: 12, font: bold, color: ACCENT })

  // Bottom orange stripe + dark footer
  page.drawRectangle({ x: 0, y: FOOTER_H, width: PAGE_W, height: STRIPE_BOTTOM, color: ORANGE })
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: FOOTER_BG })
  const footerText = 'CE Solution Plus Corp.  |  Confidential & Proprietary  |  cesolutionplus.com'
  const footerSize = 9
  const footerW = font.widthOfTextAtSize(footerText, footerSize)
  drawSafe(footerText, {
    x: (PAGE_W - footerW) / 2,
    y: FOOTER_H / 2 - 3,
    size: footerSize,
    font,
    color: rgb(0.86, 0.86, 0.9),
  })

  const bytes = await pdf.save()
  const safeId = (contract.contractId || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  const safeInvoice = invoiceNumber.replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `invoice-${safeId}-${safeInvoice}.pdf`)
}
