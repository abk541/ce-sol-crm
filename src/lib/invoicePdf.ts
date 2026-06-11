import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Contract, ContractInvoice, ContractLineItem, FileAttachment } from '../types'
import { formatInvoiceSequence } from './invoiceNumbers'
import {
  PDF_THEME,
  drawBrandedFooter,
  drawBrandedHeader,
  embedCompanyLogo,
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

  const { PAGE_W, PAGE_H, MARGIN, HEADER_H, FOOTER_H, NAVY, GOLD, INK, INK_SOFT, MUTED, OFF_WHITE, BORDER, BORDER_STRONG, ACCENT_TEAL, WHITE } = PDF_THEME

  const sanitize = toWinAnsi

  const pdf = await PDFDocument.create()
  let page = pdf.addPage([PAGE_W, PAGE_H])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await embedCompanyLogo(pdf, { invert: true })

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

  const drawCard = (x: number, y: number, width: number, height: number, fill = WHITE) => {
    page.drawRectangle({ x, y, width, height, color: fill, borderColor: BORDER, borderWidth: 0.6 })
  }

  const drawLabelValue = (
    label: string,
    value: string,
    x: number,
    y: number,
    labelWidth = 96,
    valueWidth = 170,
  ) => {
    drawSafe(label.toUpperCase(), { x, y, size: 7, font: bold, color: MUTED })
    const lines = wrapW(value || '-', valueWidth, 9.5, true).slice(0, 2)
    lines.forEach((line, index) => {
      drawSafe(line, { x: x + labelWidth, y: y - index * 11, size: 9.5, font: index === 0 ? bold : font, color: INK })
    })
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
    font,
    bold,
    logo,
    docType: 'INVOICE',
    docMeta: invoiceNumber,
    subtitle: 'You have a need, we have a solution.',
  })

  // ── Contract title block ───────────────────────────────────────────
  const titleTop = PAGE_H - HEADER_H - 28
  const titleLines = wrapW(contract.title || 'Contract invoice', PAGE_W - MARGIN * 2, 14, true).slice(0, 2)
  titleLines.forEach((line, index) => {
    drawSafe(line, { x: MARGIN, y: titleTop - index * 17, size: 14, font: bold, color: INK })
  })
  drawSafe(contract.contractId || contract.id, {
    x: MARGIN,
    y: titleTop - titleLines.length * 17 - 2,
    size: 9.5,
    font,
    color: MUTED,
  })

  // ── Summary strip (4 KPIs) ─────────────────────────────────────────
  const summaryY = titleTop - titleLines.length * 17 - 50
  const summaryH = 56
  drawCard(MARGIN, summaryY, PAGE_W - MARGIN * 2, summaryH, OFF_WHITE)
  // Subtle gold accent bar on the left edge
  page.drawRectangle({ x: MARGIN, y: summaryY, width: 3, height: summaryH, color: GOLD })

  const summaryCols = [
    { label: 'Invoice Date', value: formatPdfDate(invoiceDate), x: MARGIN + 18 },
    { label: 'Service Period', value: invoiceServiceRange(contract, invoice), x: MARGIN + 154 },
    { label: 'POP Year', value: popYear, x: MARGIN + 332 },
    { label: 'Amount Due', value: fmtMoneyExact(totalAmount), x: MARGIN + 432 },
  ]
  summaryCols.forEach(col => {
    drawSafe(col.label.toUpperCase(), { x: col.x, y: summaryY + 36, size: 7, font: bold, color: MUTED })
    const isAmount = col.label === 'Amount Due'
    drawSafe(col.value, {
      x: col.x,
      y: summaryY + 16,
      size: isAmount ? 13 : 10.5,
      font: bold,
      color: isAmount ? ACCENT_TEAL : INK,
    })
  })

  // ── From / Bill To cards ───────────────────────────────────────────
  const cardY = summaryY - 110
  const cardW = (PAGE_W - MARGIN * 2 - 16) / 2
  const cardH = 96
  drawCard(MARGIN, cardY, cardW, cardH)
  drawCard(MARGIN + cardW + 16, cardY, cardW, cardH)
  drawSafe('FROM', { x: MARGIN + 14, y: cardY + cardH - 18, size: 8, font: bold, color: GOLD })
  INVOICE_FROM_LINES.forEach((line, index) => {
    drawSafe(line, {
      x: MARGIN + 14,
      y: cardY + cardH - 36 - index * 14,
      size: index === 0 ? 10.5 : 9.5,
      font: index === 0 ? bold : font,
      color: index === 0 ? INK : INK_SOFT,
    })
  })
  const billX = MARGIN + cardW + 30
  drawSafe('BILL TO', { x: billX, y: cardY + cardH - 18, size: 8, font: bold, color: GOLD })
  const billLines = [contract.client || '-', contract.location || '-']
  billLines.forEach((line, index) => {
    const lines = wrapW(line, cardW - 28, index === 0 ? 10.5 : 9.5, index === 0).slice(0, 2)
    lines.forEach((wrapped, wrapIndex) => {
      drawSafe(wrapped, {
        x: billX,
        y: cardY + cardH - 36 - index * 28 - wrapIndex * 11,
        size: index === 0 ? 10.5 : 9.5,
        font: index === 0 ? bold : font,
        color: index === 0 ? INK : INK_SOFT,
      })
    })
  })

  // ── Contract details strip ─────────────────────────────────────────
  const detailsY = cardY - 78
  drawSafe('CONTRACT DETAILS', { x: MARGIN, y: detailsY + 50, size: 8, font: bold, color: GOLD })
  drawCard(MARGIN, detailsY, PAGE_W - MARGIN * 2, 60, OFF_WHITE)
  drawLabelValue('Contract ID', contract.contractId || contract.id, MARGIN + 14, detailsY + 44, 70, 110)
  drawLabelValue('Contract No.', contract.contractNumber || '-', MARGIN + 188, detailsY + 44, 76, 116)
  drawLabelValue('Type', contract.type || '-', MARGIN + 372, detailsY + 44, 42, 80)
  drawLabelValue('Set Aside', contract.setAside || '-', MARGIN + 470, detailsY + 44, 60, 70)
  drawLabelValue('NAICS', contract.naicsCode || '-', MARGIN + 14, detailsY + 18, 70, 110)
  drawLabelValue('Invoice Type', invoiceType, MARGIN + 188, detailsY + 18, 76, 150)
  drawLabelValue('Due Date', billingDue ? formatPdfDate(billingDue) : '-', MARGIN + 372, detailsY + 18, 60, 120)

  // ── Line items table ───────────────────────────────────────────────
  const tableTop = detailsY - 32
  const innerLeft = MARGIN
  const innerRight = PAGE_W - MARGIN
  const innerW = innerRight - innerLeft
  const columns = [
    { label: 'CLIN', x: innerLeft, w: 70, align: 'left' as const },
    { label: 'DESCRIPTION', x: innerLeft + 70, w: 245, align: 'left' as const },
    { label: 'QTY', x: innerLeft + 315, w: 50, align: 'right' as const },
    { label: 'UNIT', x: innerLeft + 365, w: 58, align: 'left' as const },
    { label: 'RATE', x: innerLeft + 423, w: 62, align: 'right' as const },
    { label: 'AMOUNT', x: innerLeft + 485, w: innerW - 485, align: 'right' as const },
  ]

  const drawTableHeader = (top: number, title = 'LINE ITEMS') => {
    drawSafe(title, { x: innerLeft, y: top + 14, size: 8, font: bold, color: GOLD })
    page.drawRectangle({ x: innerLeft, y: top - 22, width: innerW, height: 22, color: NAVY })
    columns.forEach(column => {
      drawSafe(column.label, {
        x: column.align === 'right' ? column.x + column.w - bold.widthOfTextAtSize(column.label, 9) - 8 : column.x + 8,
        y: top - 14,
        size: 9,
        font: bold,
        color: WHITE,
      })
    })
  }

  const drawInvoiceRows = (startIndex: number, maxRows: number, startY: number) => {
    let y = startY
    let index = startIndex
    while (index < invoiceRows.length && index < startIndex + maxRows) {
      const row = invoiceRows[index]
      const descLines = wrapW(row.description, 232, 9.5).slice(0, 2)
      const rowH = descLines.length > 1 ? 34 : 26
      if ((index - startIndex) % 2 === 0) {
        page.drawRectangle({ x: innerLeft, y: y - rowH + 16, width: innerW, height: rowH, color: OFF_WHITE })
      }
      // Hairline divider under every row
      page.drawLine({
        start: { x: innerLeft, y: y - rowH + 16 },
        end: { x: innerRight, y: y - rowH + 16 },
        color: BORDER,
        thickness: 0.4,
      })
      drawSafe(row.clin, { x: columns[0].x + 8, y, size: 10, font, color: INK })
      descLines.forEach((line, lineIndex) => {
        drawSafe(line, { x: columns[1].x + 8, y: y - lineIndex * 11, size: 9.5, font, color: INK })
      })
      const qty = String(row.quantity)
      const rate = fmtMoneyExact(row.rate)
      const amount = fmtMoneyExact(row.amount)
      drawSafe(qty, { x: columns[2].x + columns[2].w - font.widthOfTextAtSize(qty, 10) - 8, y, size: 10, font, color: INK })
      drawSafe(row.unit, { x: columns[3].x + 8, y, size: 10, font, color: INK })
      drawSafe(rate, { x: columns[4].x + columns[4].w - font.widthOfTextAtSize(rate, 10) - 8, y, size: 10, font, color: INK })
      drawSafe(amount, { x: columns[5].x + columns[5].w - bold.widthOfTextAtSize(amount, 10) - 8, y, size: 10, font: bold, color: INK })
      y -= rowH
      index += 1
    }
    return { nextIndex: index, rowY: y }
  }

  drawTableHeader(tableTop)
  let drawn = drawInvoiceRows(0, 5, tableTop - 42)
  let rowY = drawn.rowY
  let nextRow = drawn.nextIndex

  while (nextRow < invoiceRows.length) {
    drawSafe('Line items continue on the next page.', { x: innerLeft + 8, y: rowY, size: 8, font, color: MUTED })
    drawBrandedFooter({ page, font, rightText: `Invoice ${invoiceNumber}` })
    page = pdf.addPage([PAGE_W, PAGE_H])
    drawBrandedHeader({
      page,
      font,
      bold,
      logo,
      docType: 'INVOICE',
      docMeta: invoiceNumber,
      subtitle: 'continued',
    })
    const continuationTop = PAGE_H - HEADER_H - 60
    drawTableHeader(continuationTop, 'LINE ITEMS CONTINUED')
    drawn = drawInvoiceRows(nextRow, 16, continuationTop - 42)
    rowY = drawn.rowY
    nextRow = drawn.nextIndex
  }

  // ── Totals block ───────────────────────────────────────────────────
  const totalsTop = rowY + 4
  page.drawLine({
    start: { x: innerLeft, y: totalsTop },
    end: { x: innerRight, y: totalsTop },
    color: BORDER_STRONG,
    thickness: 0.8,
  })
  // Right-aligned total card
  const totalsBoxX = innerRight - 240
  const totalsBoxY = totalsTop - 56
  page.drawRectangle({
    x: totalsBoxX,
    y: totalsBoxY,
    width: 240,
    height: 48,
    color: NAVY,
  })
  page.drawRectangle({ x: totalsBoxX, y: totalsBoxY, width: 3, height: 48, color: GOLD })
  drawSafe('TOTAL AMOUNT DUE', {
    x: totalsBoxX + 14,
    y: totalsBoxY + 30,
    size: 8,
    font: bold,
    color: PDF_THEME.GOLD_SOFT,
  })
  rightText(fmtMoneyExact(totalAmount), totalsBoxX + 240 - 14, totalsBoxY + 14, 16, true, WHITE)

  // ── Payment notes ──────────────────────────────────────────────────
  const notesTop = FOOTER_H + 78
  drawSafe('PAYMENT NOTES', { x: MARGIN, y: notesTop, size: 8, font: bold, color: GOLD })
  page.drawLine({
    start: { x: MARGIN, y: notesTop - 4 },
    end: { x: PAGE_W - MARGIN, y: notesTop - 4 },
    color: BORDER,
    thickness: 0.5,
  })
  const noteText = invoice?.notes?.trim()
    ? invoice.notes
    : 'Please reference the invoice number on all remittances and correspondence.'
  wrapW(noteText, PAGE_W - MARGIN * 2, 9).slice(0, 3).forEach((line, index) => {
    drawSafe(line, { x: MARGIN, y: notesTop - 18 - index * 12, size: 9, font, color: INK_SOFT })
  })

  // ── Branded footer ─────────────────────────────────────────────────
  drawBrandedFooter({ page, font, rightText: `Invoice ${invoiceNumber}` })

  const bytes = await pdf.save()
  const safeId = (contract.contractId || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  const safeInvoice = invoiceNumber.replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `invoice-${safeId}-${safeInvoice}.pdf`)
}
