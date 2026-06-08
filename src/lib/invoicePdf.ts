import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Contract, FileAttachment } from '../types'

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
  const quotes = (contract.lockedSubcontractors || [])
    .flatMap(sub => attachmentNames(sub.documents?.quote, sub.quotes).map(quote => `${sub.companyName}: ${quote}`))

  if (quotes.length === 0) return 'No locked subk quotes yet'
  return quotes.join(', ')
}

export function subkMonthlyBillingRowsForContract(contract: Contract) {
  const subs = contract.lockedSubcontractors || []
  if (subs.length === 0) return ['No locked subk billing rows yet']
  return subs.map(sub => {
    const invoices = attachmentNames(sub.documents?.invoice, sub.invoices)
    const invoiceNote = invoices.length > 0 ? ` - invoices: ${invoices.join(', ')}` : ''
    return `${sub.companyName}: monthly billing to be confirmed${invoiceNote}`
  })
}

export interface InvoiceGenerationOptions {
  invoiceNumber?: number   // sequential id; printed as INV-{0000}. Falls back to a timestamped placeholder if omitted.
}

function formatInvoiceNumber(n?: number) {
  if (n == null || !Number.isFinite(n) || n <= 0) return 'DRAFT'
  return `INV-${String(Math.trunc(n)).padStart(4, '0')}`
}

function formatServiceDate(value?: string) {
  if (!value) return '-'
  const d = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
  const ORANGE = rgb(0.9, 0.4, 0.0)
  const HEADER_BG = rgb(0.04, 0.04, 0.06)
  const FOOTER_BG = rgb(0.07, 0.10, 0.14)
  const INK = rgb(0.08, 0.12, 0.2)
  const MUTED = rgb(0.32, 0.36, 0.44)
  const BORDER = rgb(0.78, 0.80, 0.84)
  const ACCENT = rgb(0.02, 0.46, 0.39)

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
  drawSafe('INVOICE', { x: MARGIN, y: titleY, size: 22, font: bold, color: ACCENT })
  drawSafe(invoiceCadenceForContract(contract), { x: MARGIN, y: titleY - 14, size: 9, font, color: MUTED })

  const amount = invoiceAmountForContract(contract)
  const amountText = fmtMoney(amount)
  const amountSize = 22
  const amountW = bold.widthOfTextAtSize(amountText, amountSize)
  drawSafe(amountText, {
    x: PAGE_W - MARGIN - amountW,
    y: titleY,
    size: amountSize,
    font: bold,
    color: ACCENT,
  })
  const subLabel = contract.type === 'RECURRING' ? 'MONTHLY RETURN' : 'TOTAL RETURN'
  const subLabelW = bold.widthOfTextAtSize(subLabel, 8)
  drawSafe(subLabel, {
    x: PAGE_W - MARGIN - subLabelW,
    y: titleY - 14,
    size: 8,
    font: bold,
    color: MUTED,
  })

  // Field table
  const invoicePeriod = contract.type === 'RECURRING'
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date())
    : 'One-time job total'

  type Field = { label: string; value: string }
  const rowFields: Field[][] = [
    [
      { label: 'INVOICE #', value: formatInvoiceNumber(options.invoiceNumber) },
      { label: 'INVOICE DATE', value: new Date().toLocaleDateString('en-US') },
      { label: 'SERVICE DATE', value: formatServiceDate(contract.serviceDate) },
    ],
    [
      { label: 'CONTRACT', value: contract.title },
      { label: 'CONTRACT ID', value: contract.contractId || contract.id },
      { label: 'CLIENT / AGENCY', value: contract.client || '-' },
      { label: 'LOCATION', value: contract.location || '-' },
    ],
    [
      { label: 'TYPE', value: contract.type === 'S&D' || contract.type === 'SUPPLY' ? 'S&D' : contract.type },
      { label: 'STATUS', value: contract.status },
      { label: 'INVOICE PERIOD', value: invoicePeriod },
      { label: 'TOTAL CONTRACT VALUE', value: fmtMoney(contract.value || 0) },
    ],
    [
      contract.type === 'RECURRING'
        ? { label: 'MONTHLY PAYMENT (GOV)', value: fmtMoney(contract.monthlyPayment || 0) }
        : { label: "QUOTE (SUBK'S)", value: subkQuoteSummaryForContract(contract) },
    ],
  ]

  let cursorY = titleY - 38
  const rowH = 44
  const innerLeft = MARGIN
  const innerRight = PAGE_W - MARGIN
  const innerW = innerRight - innerLeft

  for (const row of rowFields) {
    const cellW = innerW / row.length
    page.drawRectangle({
      x: innerLeft,
      y: cursorY - rowH,
      width: innerW,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.8,
      color: rgb(1, 1, 1),
    })
    row.forEach((field, i) => {
      const x = innerLeft + i * cellW
      if (i > 0) {
        page.drawLine({
          start: { x, y: cursorY - rowH + 2 },
          end: { x, y: cursorY - 2 },
          color: BORDER,
          thickness: 0.6,
        })
      }
      drawSafe(field.label, { x: x + 8, y: cursorY - 13, size: 8, font: bold, color: MUTED })
      const valueLines = wrapW(field.value || '-', cellW - 16, 10).slice(0, 2)
      valueLines.forEach((line, j) => {
        drawSafe(line, { x: x + 8, y: cursorY - 26 - j * 12, size: 10, font, color: INK })
      })
    })
    cursorY -= rowH + 6
  }

  // Subk billing rows section
  const sectionLabel = contract.type === 'RECURRING' ? 'MONTHLY BILLING (SUBK)' : 'SUBK QUOTE REFERENCE'
  drawSafe(sectionLabel, { x: innerLeft, y: cursorY - 4, size: 9, font: bold, color: MUTED })
  cursorY -= 18

  const subkRows = contract.type === 'RECURRING'
    ? subkMonthlyBillingRowsForContract(contract)
    : [`Quote (Subk's): ${subkQuoteSummaryForContract(contract)}`]

  const listMaxLines = Math.max(8, Math.floor((cursorY - (FOOTER_H + STRIPE_BOTTOM + 24)) / 14))
  const listBoxTop = cursorY
  const listBoxBottom = FOOTER_H + STRIPE_BOTTOM + 16
  const listBoxH = listBoxTop - listBoxBottom
  page.drawRectangle({
    x: innerLeft,
    y: listBoxBottom,
    width: innerW,
    height: listBoxH,
    borderColor: BORDER,
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  })

  let listY = listBoxTop - 14
  let drawn = 0
  outer: for (const row of subkRows) {
    const lines = wrapW(row, innerW - 24, 9.5)
    for (let i = 0; i < lines.length; i++) {
      if (drawn >= listMaxLines) break outer
      drawSafe(`${i === 0 ? '-' : '  '} ${lines[i]}`, {
        x: innerLeft + 10,
        y: listY,
        size: 9.5,
        font,
        color: INK,
      })
      listY -= 13
      drawn++
    }
    listY -= 3
  }

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
  const numberSuffix = options.invoiceNumber && options.invoiceNumber > 0
    ? `-${String(Math.trunc(options.invoiceNumber)).padStart(4, '0')}`
    : ''
  download(bytes, `invoice-${safeId}${numberSuffix}.pdf`)
}
