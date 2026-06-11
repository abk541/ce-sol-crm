import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib'
import type { Contract, Opportunity } from '../types'
import {
  PDF_THEME,
  drawBrandedFooter,
  drawBrandedHeader,
  embedCompanyLogo,
  toWinAnsi,
} from './pdfBranding'

export interface PastPerformancePocOverride {
  name?: string
  email?: string
  phone?: string
}

const { PAGE_W, PAGE_H, MARGIN, HEADER_H, HEADER_ACCENT_H, FOOTER_H, FOOTER_ACCENT_H, INK, MUTED, BORDER, OFF_WHITE, GOLD, WHITE } = PDF_THEME

const fmtMoney = (v?: number) =>
  v == null
    ? ''
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(v)

const fmtDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

type DrawCtx = { page: PDFPage; font: PDFFont; bold: PDFFont }

function wrap(ctx: DrawCtx, text: string, maxWidth: number, size: number, useBold = false): string[] {
  if (!text) return []
  const safe = toWinAnsi(text)
  const f = useBold ? ctx.bold : ctx.font
  const out: string[] = []
  for (const paragraph of safe.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
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

function drawCellBox(page: PDFPage, x: number, yTop: number, w: number, h: number, fill = WHITE) {
  page.drawRectangle({
    x,
    y: yTop - h,
    width: w,
    height: h,
    borderColor: BORDER,
    borderWidth: 0.6,
    color: fill,
  })
  page.drawRectangle({
    x,
    y: yTop - 18,
    width: w,
    height: 18,
    color: OFF_WHITE,
  })
  page.drawLine({
    start: { x, y: yTop - 18 },
    end: { x: x + w, y: yTop - 18 },
    color: BORDER,
    thickness: 0.4,
  })
}

function drawCellLabel(ctx: DrawCtx, label: string, x: number, yTop: number, maxWidth: number) {
  const labelSize = 8.5
  const lines = wrap(ctx, label, maxWidth - 12, labelSize, true).slice(0, 2)
  lines.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: x + 8,
      y: yTop - 12 - i * (labelSize + 2),
      size: labelSize,
      font: ctx.bold,
      color: INK,
    })
  })
  return lines.length
}

function drawCellValue(
  ctx: DrawCtx,
  value: string,
  x: number,
  yTop: number,
  width: number,
  labelLines: number,
  maxLines = 2,
  size = 11,
) {
  if (!value) return
  const valueY = yTop - 22 - labelLines * 11
  const lines = wrap(ctx, value, width - 16, size).slice(0, maxLines)
  lines.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: x + 8,
      y: valueY - i * (size + 2),
      size,
      font: ctx.font,
      color: INK,
    })
  })
}

function drawPocBlock(
  ctx: DrawCtx,
  poc: { name?: string; email?: string; phone?: string } | undefined,
  x: number,
  yTop: number,
  width: number,
  labelLines: number,
) {
  const lineSize = 9.5
  const labelSize = 8.5
  const rows: Array<{ label: string; value: string }> = [
    { label: 'POC', value: poc?.name ?? '' },
    { label: 'EMAIL', value: poc?.email ?? '' },
    { label: 'PHONE', value: poc?.phone ?? '' },
  ]
  let y = yTop - 24 - labelLines * 11
  for (const row of rows) {
    ctx.page.drawText(row.label, {
      x: x + 10,
      y,
      size: labelSize,
      font: ctx.bold,
      color: MUTED,
    })
    const labelW = ctx.bold.widthOfTextAtSize(row.label, labelSize)
    const valLines = wrap(ctx, row.value, width - 20 - labelW - 6, lineSize).slice(0, 1)
    if (valLines.length) {
      ctx.page.drawText(valLines[0], {
        x: x + 10 + labelW + 6,
        y,
        size: lineSize,
        font: ctx.font,
        color: poc && (poc.name || poc.email || poc.phone) ? INK : MUTED,
      })
    }
    ctx.page.drawLine({
      start: { x: x + 10, y: y - 6 },
      end: { x: x + width - 10, y: y - 6 },
      color: BORDER,
      thickness: 0.3,
    })
    y -= 22
  }
}

export async function generatePastPerformancePdf({
  contract,
  opportunity,
  description,
  contractingPoc,
  technicalPoc,
}: {
  contract: Contract
  opportunity?: Opportunity
  description: string
  contractingPoc?: PastPerformancePocOverride
  technicalPoc?: PastPerformancePocOverride
}) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx: DrawCtx = { page, font, bold }
  const logo = await embedCompanyLogo(pdf, { invert: true })

  drawBrandedHeader({
    page,
    font,
    bold,
    logo,
    docType: 'Relevant Past Performance',
    subtitle: 'SDVOSB   |   CAGE: 9KV33',
  })

  // Data extraction (no fabrication: blank when missing)
  const awardingOrg = contract.client || opportunity?.client || ''
  const contractRef =
    contract.contractNumber || contract.contractId || opportunity?.solicitationId || ''
  const dateOfContract = opportunity?.submittedAt || contract.popStart
  const startDate = contract.popStart
  const endDate = contract.popEnd
  const totalAmount =
    opportunity?.contractAmount != null ? opportunity.contractAmount : contract.value
  const location = contract.location || opportunity?.location || ''

  const pocs = contract.pocs || []
  const fallbackContractingPoc = pocs.find(p => p.role === 'KO')
  const fallbackTechnicalPoc = pocs.find(p => p.role === 'COR') || pocs.find(p => p.role === 'END_USER')
  const overrideHasContent = (o?: PastPerformancePocOverride) =>
    !!(o && (o.name?.trim() || o.email?.trim() || o.phone?.trim()))
  const resolvedContractingPoc = overrideHasContent(contractingPoc)
    ? { name: contractingPoc!.name?.trim(), email: contractingPoc!.email?.trim(), phone: contractingPoc!.phone?.trim() }
    : fallbackContractingPoc
  const resolvedTechnicalPoc = overrideHasContent(technicalPoc)
    ? { name: technicalPoc!.name?.trim(), email: technicalPoc!.email?.trim(), phone: technicalPoc!.phone?.trim() }
    : fallbackTechnicalPoc

  // Layout
  const tableX = MARGIN
  const tableW = PAGE_W - MARGIN * 2
  const halfW = tableW / 2

  // Section caption above the form
  const captionY = PAGE_H - HEADER_H - HEADER_ACCENT_H - 22
  page.drawText(toWinAnsi('FORM CE-PP-1   /   PAST PERFORMANCE REFERENCE'), {
    x: MARGIN,
    y: captionY,
    size: 8,
    font: bold,
    color: GOLD,
  })
  page.drawLine({
    start: { x: MARGIN, y: captionY - 6 },
    end: { x: PAGE_W - MARGIN, y: captionY - 6 },
    color: BORDER,
    thickness: 0.5,
  })

  let y = captionY - 16

  // Cell 1 — full width
  {
    const h = 60
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(
      ctx,
      '1.  Complete name of commercial firm, Government agency or other organization awarding contract',
      tableX,
      y,
      tableW,
    )
    drawCellValue(ctx, awardingOrg, tableX, y, tableW, ll, 1)
    y -= h
  }

  // Row: Cells 2 & 4
  {
    const h = 56
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '2.  Contract Number or other reference', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '4.  Date of Contract', tableX + halfW, y, halfW)
    drawCellValue(ctx, contractRef, tableX, y, halfW, lL, 1)
    drawCellValue(ctx, fmtDate(dateOfContract), tableX + halfW, y, halfW, lR, 1)
    y -= h
  }

  // Row: Cells 5 & 6
  {
    const h = 56
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '5.  Date work started', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '6.  Date work was or will be completed', tableX + halfW, y, halfW)
    drawCellValue(ctx, fmtDate(startDate), tableX, y, halfW, lL, 1)
    drawCellValue(ctx, fmtDate(endDate), tableX + halfW, y, halfW, lR, 1)
    y -= h
  }

  // Cell 7 — full width
  {
    const h = 56
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(ctx, '7.  Total Contract Amount (including all options)', tableX, y, tableW)
    drawCellValue(ctx, fmtMoney(totalAmount), tableX, y, tableW, ll, 1, 13)
    y -= h
  }

  // Row: Cells 8 & 9 — POCs
  {
    const h = 132
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '8.  Contracting or purchasing point of contact', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '9.  Technical point of contact', tableX + halfW, y, halfW)
    drawPocBlock(ctx, resolvedContractingPoc, tableX, y, halfW, lL)
    drawPocBlock(ctx, resolvedTechnicalPoc, tableX + halfW, y, halfW, lR)
    y -= h
  }

  // Cell 10 — full width
  {
    const h = 56
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(ctx, '10.  Location of work', tableX, y, tableW)
    drawCellValue(ctx, location, tableX, y, tableW, ll, 1)
    y -= h
  }

  // Cell 11 — description, takes the remaining vertical space
  {
    const footerTop = FOOTER_H + FOOTER_ACCENT_H
    const cell11Bottom = footerTop + 18
    const h = y - cell11Bottom
    if (h > 60) {
      drawCellBox(page, tableX, y, tableW, h)
      const ll = drawCellLabel(ctx, '11.  Description of contract work', tableX, y, tableW)
      const descSize = 10.5
      const lineGap = descSize + 3
      const usable = Math.max(0, Math.floor((h - 24 - ll * 11 - 8) / lineGap))
      const lines = wrap(ctx, description, tableW - 18, descSize).slice(0, usable)
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: tableX + 9,
          y: y - 24 - ll * 11 - i * lineGap,
          size: descSize,
          font,
          color: INK,
        })
      })
    }
  }

  drawBrandedFooter({
    page,
    font,
    leftText: contractRef ? `Reference: ${contractRef}` : undefined,
    rightText: 'Past Performance Reference',
  })

  const bytes = await pdf.save()
  const safeId = (contractRef || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `past-performance-${safeId}.pdf`)
}
