import { PDFDocument } from 'pdf-lib'
import type { Contract, ContractInvoice, ContractLineItem, FileAttachment } from '../types'
import { formatInvoiceSequence } from './invoiceNumbers'
import {
  PDF_THEME,
  drawBrandedFooter,
  drawBrandedHeader,
  loadBrandFonts,
  toWinAnsi,
} from './pdfBranding'

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

  const { PAGE_W, PAGE_H, MARGIN, HEADER_H, FOOTER_H, NAVY, GOLD, GOLD_SOFT, INK, INK_SOFT, MUTED, OFF_WHITE, BORDER, BORDER_STRONG, ACCENT_TEAL, WHITE } = PDF_THEME

  const sanitize = toWinAnsi

  const pdf = await PDFDocument.create()
  let page = pdf.addPage([PAGE_W, PAGE_H])
  const brand = await loadBrandFonts(pdf)
  const font = brand.sans
  const bold = brand.sansBold

  const rightText = (text: string, rightX: number, y: number, size: number, useBold = false, color = INK) => {
    const safe = sanitize(text)
    const f = useBold ? bold : font
    page.drawText(safe, { x: rightX - f.widthOfTextAtSize(safe, size), y, size, font: f, color })
  }

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

  const sectionLabel = (text: string, x: number, y: number) => {
    drawSafe(text, { x, y, size: 6.5, font: bold, color: MUTED })
    page.drawLine({
      start: { x, y: y - 4 },
      end: { x: PAGE_W - MARGIN, y: y - 4 },
      color: BORDER,
      thickness: 0.4,
    })
  }

  const drawLabelValue = (
    label: string,
    value: string,
    x: number,
    y: number,
    valueWidth = 170,
  ) => {
    drawSafe(label.toUpperCase(), { x, y, size: 6.5, font: bold, color: MUTED })
    const lines = wrapW(value || '-', valueWidth, 9, true).slice(0, 1)
    if (lines.length) {
      drawSafe(lines[0], { x, y: y - 12, size: 9, font: bold, color: INK })
    } else {
      drawSafe('-', { x, y: y - 12, size: 9, font, color: INK_SOFT })
    }
  }

  const popYearLabel = (value?: string) => {
    const labels: Record<string, string> = {
      base: 'Base Year',
      option1: 'Option Year 1',
      option2: 'Option Year 2',
      option3: 'Option Year 3',
      option4: 'Option Year 4',
    }
    return value ? labels[value] || value : '-'
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

  const billingDue = invoice?.dueDate || ''
  const popYear = popYearLabel(invoice?.popYear || contract.currentPopYear)
  const invoiceType = invoiceCadenceForContract(contract)

  // ── Branded header ────────────────────────────────────────────────
  drawBrandedHeader({
    page,
    brand,
    docType: 'INVOICE',
    docMeta: `No. ${invoiceNumber}`,
    subtitle: invoiceCadenceForContract(contract),
  })

  // ── Document title block (compact) ────────────────────────────────
  const titleTop = PAGE_H - HEADER_H - 32

  // Right-side metadata stack — vertical so it never collides with the title
  const metaItems = [
    { label: 'INVOICE DATE', value: formatPdfDate(invoiceDate) },
    { label: 'DUE DATE', value: billingDue ? formatPdfDate(billingDue) : '-' },
    { label: 'POP YEAR', value: popYear },
  ]
  const metaRight = PAGE_W - MARGIN
  const metaLabelSize = 6.5
  const metaValueSize = 9
  const metaRowH = 22
  const metaBlockW = 130
  const metaLeftEdge = metaRight - metaBlockW
  metaItems.forEach((item, index) => {
    const baseY = titleTop - index * metaRowH
    rightText(item.label, metaRight, baseY, metaLabelSize, true, MUTED)
    rightText(item.value || '-', metaRight, baseY - 11, metaValueSize, true, INK)
  })
  const metaBottom = titleTop - metaItems.length * metaRowH + (metaRowH - 11)

  // Title (left) — reserves clear space for the metadata block on the right
  const titleMaxW = metaLeftEdge - MARGIN - 16
  const titleLines = wrapW(contract.title || 'Contract invoice', titleMaxW, 12, true).slice(0, 3)
  titleLines.forEach((line, index) => {
    drawSafe(line, { x: MARGIN, y: titleTop - index * 14, size: 12, font: bold, color: INK })
  })
  const titleBottom = titleTop - titleLines.length * 14 - 4
  drawSafe(contract.contractId || contract.id, {
    x: MARGIN,
    y: titleBottom,
    size: 8,
    font,
    color: MUTED,
  })

  // ── From / Bill To ────────────────────────────────────────────────
  const blockBottom = Math.min(titleBottom - 10, metaBottom - 10)
  const partyTop = blockBottom - 22
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2
  sectionLabel('FROM', MARGIN, partyTop)
  sectionLabel('BILL TO', MARGIN + colW + 24, partyTop)

  const partyBodyTop = partyTop - 14
  INVOICE_FROM_LINES.forEach((line, index) => {
    drawSafe(line, {
      x: MARGIN,
      y: partyBodyTop - index * 12,
      size: index === 0 ? 10 : 8.5,
      font: index === 0 ? bold : font,
      color: index === 0 ? INK : INK_SOFT,
    })
  })
  const billLines = [contract.client || '-', contract.location || '-']
  billLines.forEach((line, index) => {
    const wrapped = wrapW(line, colW, index === 0 ? 10 : 8.5, index === 0).slice(0, 2)
    wrapped.forEach((w, wi) => {
      drawSafe(w, {
        x: MARGIN + colW + 24,
        y: partyBodyTop - index * 26 - wi * 11,
        size: index === 0 ? 10 : 8.5,
        font: index === 0 ? bold : font,
        color: index === 0 ? INK : INK_SOFT,
      })
    })
  })

  // ── Contract details strip ────────────────────────────────────────
  const detailsTop = partyTop - 78
  sectionLabel('CONTRACT DETAILS', MARGIN, detailsTop)
  const detailsRowY = detailsTop - 16
  drawLabelValue('Contract ID', contract.contractId || contract.id, MARGIN, detailsRowY, 110)
  drawLabelValue('Contract No.', contract.contractNumber || '-', MARGIN + 130, detailsRowY, 110)
  drawLabelValue('Service Period', invoiceServiceRange(contract, invoice), MARGIN + 260, detailsRowY, 170)
  drawLabelValue('Type', contract.type || '-', MARGIN + 440, detailsRowY, 80)

  // ── Line items table ──────────────────────────────────────────────
  const tableTop = detailsTop - 58
  const innerLeft = MARGIN
  const innerRight = PAGE_W - MARGIN
  const innerW = innerRight - innerLeft
  const columns = [
    { label: 'CLIN', x: innerLeft, w: 56, align: 'left' as const },
    { label: 'DESCRIPTION', x: innerLeft + 56, w: 244, align: 'left' as const },
    { label: 'QTY', x: innerLeft + 300, w: 42, align: 'right' as const },
    { label: 'UNIT', x: innerLeft + 342, w: 52, align: 'left' as const },
    { label: 'RATE', x: innerLeft + 394, w: 60, align: 'right' as const },
    { label: 'AMOUNT', x: innerLeft + 454, w: innerW - 454, align: 'right' as const },
  ]

  const drawTableHeader = (top: number, title = 'LINE ITEMS') => {
    sectionLabel(title, innerLeft, top + 14)
    page.drawRectangle({ x: innerLeft, y: top - 18, width: innerW, height: 18, color: NAVY })
    columns.forEach(column => {
      drawSafe(column.label, {
        x: column.align === 'right'
          ? column.x + column.w - bold.widthOfTextAtSize(column.label, 7.5) - 8
          : column.x + 8,
        y: top - 12,
        size: 7.5,
        font: bold,
        color: GOLD_SOFT,
      })
    })
  }

  const drawInvoiceRows = (startIndex: number, maxRows: number, startY: number) => {
    let y = startY
    let index = startIndex
    while (index < invoiceRows.length && index < startIndex + maxRows) {
      const row = invoiceRows[index]
      const descLines = wrapW(row.description, columns[1].w - 16, 9).slice(0, 2)
      const rowH = descLines.length > 1 ? 26 : 20
      if ((index - startIndex) % 2 === 0) {
        page.drawRectangle({ x: innerLeft, y: y - rowH + 12, width: innerW, height: rowH, color: OFF_WHITE })
      }
      page.drawLine({
        start: { x: innerLeft, y: y - rowH + 12 },
        end: { x: innerRight, y: y - rowH + 12 },
        color: BORDER,
        thickness: 0.3,
      })
      drawSafe(row.clin, { x: columns[0].x + 8, y, size: 9, font, color: INK })
      descLines.forEach((line, lineIndex) => {
        drawSafe(line, { x: columns[1].x + 8, y: y - lineIndex * 10, size: 9, font, color: INK })
      })
      const qty = String(row.quantity)
      const rate = fmtMoneyExact(row.rate)
      const amount = fmtMoneyExact(row.amount)
      drawSafe(qty, { x: columns[2].x + columns[2].w - font.widthOfTextAtSize(qty, 9) - 8, y, size: 9, font, color: INK })
      drawSafe(row.unit, { x: columns[3].x + 8, y, size: 9, font, color: INK })
      drawSafe(rate, { x: columns[4].x + columns[4].w - font.widthOfTextAtSize(rate, 9) - 8, y, size: 9, font, color: INK })
      drawSafe(amount, { x: columns[5].x + columns[5].w - bold.widthOfTextAtSize(amount, 9) - 8, y, size: 9, font: bold, color: INK })
      y -= rowH
      index += 1
    }
    return { nextIndex: index, rowY: y }
  }

  drawTableHeader(tableTop)
  let drawn = drawInvoiceRows(0, 6, tableTop - 32)
  let rowY = drawn.rowY
  let nextRow = drawn.nextIndex

  while (nextRow < invoiceRows.length) {
    drawSafe('Line items continue on the next page.', { x: innerLeft + 8, y: rowY, size: 7.5, font, color: MUTED })
    drawBrandedFooter({ page, brand, rightText: `Invoice ${invoiceNumber}` })
    page = pdf.addPage([PAGE_W, PAGE_H])
    drawBrandedHeader({
      page,
      brand,
      docType: 'INVOICE',
      docMeta: `No. ${invoiceNumber}`,
      subtitle: 'continued',
    })
    const continuationTop = PAGE_H - HEADER_H - 50
    drawTableHeader(continuationTop, 'LINE ITEMS CONTINUED')
    drawn = drawInvoiceRows(nextRow, 18, continuationTop - 32)
    rowY = drawn.rowY
    nextRow = drawn.nextIndex
  }

  // ── Totals row ────────────────────────────────────────────────────
  const totalsTop = rowY + 4
  page.drawLine({
    start: { x: innerLeft, y: totalsTop },
    end: { x: innerRight, y: totalsTop },
    color: BORDER_STRONG,
    thickness: 0.6,
  })
  // Slim subtotal line above the highlight
  drawSafe('Subtotal', { x: innerRight - 200, y: totalsTop - 16, size: 9, font, color: INK_SOFT })
  rightText(fmtMoneyExact(totalAmount), innerRight, totalsTop - 16, 9, false, INK_SOFT)

  // Amount-due highlight bar
  const totalsBoxY = totalsTop - 50
  const totalsBoxX = innerRight - 230
  page.drawRectangle({ x: totalsBoxX, y: totalsBoxY, width: 230, height: 28, color: NAVY })
  page.drawRectangle({ x: totalsBoxX, y: totalsBoxY, width: 2.5, height: 28, color: GOLD })
  drawSafe('AMOUNT DUE', {
    x: totalsBoxX + 14,
    y: totalsBoxY + 10,
    size: 7,
    font: bold,
    color: GOLD_SOFT,
  })
  rightText(fmtMoneyExact(totalAmount), totalsBoxX + 230 - 14, totalsBoxY + 9, 13, true, WHITE)

  // ── Payment notes ─────────────────────────────────────────────────
  const notesTop = FOOTER_H + 64
  sectionLabel('PAYMENT NOTES', MARGIN, notesTop)
  const noteText = invoice?.notes?.trim()
    ? invoice.notes
    : 'Please reference the invoice number on all remittances and correspondence.'
  wrapW(noteText, PAGE_W - MARGIN * 2, 8.5).slice(0, 3).forEach((line, index) => {
    drawSafe(line, { x: MARGIN, y: notesTop - 16 - index * 11, size: 8.5, font, color: INK_SOFT })
  })

  // ── Branded footer ────────────────────────────────────────────────
  drawBrandedFooter({
    page,
    brand,
    leftText: `Contract ${contract.contractId || contract.id}`,
    rightText: `Invoice ${invoiceNumber}`,
  })

  // Suppress unused warnings — these are intentionally part of the public theme
  void invoiceType
  void ACCENT_TEAL

  const bytes = await pdf.save()
  const safeId = (contract.contractId || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  const safeInvoice = invoiceNumber.replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `invoice-${safeId}-${safeInvoice}.pdf`)
}
