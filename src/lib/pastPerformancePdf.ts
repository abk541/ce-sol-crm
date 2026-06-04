import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { Contract, ContractPoC, Opportunity } from '../types'

// ── Layout constants (Letter size, points) ───────────────────────────
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 36
const ORANGE = rgb(0.9, 0.4, 0.0)
const HEADER_BG = rgb(0.04, 0.04, 0.06)
const FOOTER_BG = rgb(0.07, 0.10, 0.14)
const INK = rgb(0.07, 0.07, 0.07)
const MUTED = rgb(0.40, 0.40, 0.45)
const BORDER = rgb(0.0, 0.0, 0.0)
const STRIPE_TOP = 8
const HEADER_H = 64
const STRIPE_BOTTOM = 8
const FOOTER_H = 36

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

async function loadLogoPng(): Promise<Uint8Array | null> {
  try {
    const url = `${import.meta.env.BASE_URL}logo.svg`
    const res = await fetch(url)
    if (!res.ok) return null
    const svgText = await res.text()
    // strip the explicit white background rect so the logo sits cleanly on its tile
    const cleaned = svgText.replace(/<rect[^/]*fill="white"[^/]*\/>/i, '')
    const blob = new Blob([cleaned], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = blobUrl
      // Image.decode is more reliable than onload for SVGs with text content
      if (typeof img.decode === 'function') {
        await img.decode()
      } else {
        await new Promise<void>((res2, rej) => {
          img.onload = () => res2()
          img.onerror = () => rej(new Error('logo load failed'))
        })
      }
      const scale = 3
      const w = 840 * scale
      const h = 138 * scale
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      let dataUrl: string
      try {
        dataUrl = canvas.toDataURL('image/png')
      } catch {
        return null // tainted canvas — skip logo, generate the PDF without it
      }
      const base64 = dataUrl.split(',')[1] ?? ''
      if (!base64) return null
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  } catch (err) {
    console.warn('Past performance PDF: logo could not be embedded', err)
    return null
  }
}

// Replace characters that pdf-lib's WinAnsi encoder cannot handle (em dash, smart quotes,
// non-breaking space, etc.) with safe ASCII equivalents so a stray unicode glyph in user
// data never crashes the whole export.
function toWinAnsi(input: string): string {
  if (!input) return ''
  return input
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // drop anything outside the printable WinAnsi/Latin-1 range
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
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

function drawCellBox(page: PDFPage, x: number, yTop: number, w: number, h: number) {
  page.drawRectangle({
    x,
    y: yTop - h,
    width: w,
    height: h,
    borderColor: BORDER,
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  })
}

function drawCellLabel(ctx: DrawCtx, label: string, x: number, yTop: number, maxWidth: number) {
  const labelSize = 9
  const lines = wrap(ctx, label, maxWidth - 12, labelSize, true).slice(0, 2)
  lines.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: x + 6,
      y: yTop - 13 - i * (labelSize + 2),
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
  size = 10,
) {
  if (!value) return
  const valueY = yTop - 16 - labelLines * 11
  const lines = wrap(ctx, value, width - 12, size).slice(0, maxLines)
  lines.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: x + 6,
      y: valueY - i * (size + 2),
      size,
      font: ctx.font,
      color: INK,
    })
  })
}

function drawPocBlock(
  ctx: DrawCtx,
  poc: ContractPoC | undefined,
  x: number,
  yTop: number,
  width: number,
  labelLines: number,
) {
  const lineSize = 9.5
  const labelSize = 9
  const rows: Array<{ label: string; value: string }> = [
    { label: 'POC:', value: poc?.name ?? '' },
    { label: 'EMAIL:', value: poc?.email ?? '' },
    { label: 'PHONE:', value: poc?.phone ?? '' },
  ]
  let y = yTop - 18 - labelLines * 11
  for (const row of rows) {
    ctx.page.drawText(row.label, {
      x: x + 8,
      y,
      size: labelSize,
      font: ctx.bold,
      color: INK,
    })
    const labelW = ctx.bold.widthOfTextAtSize(row.label, labelSize)
    const valLines = wrap(ctx, row.value, width - 16 - labelW - 4, lineSize).slice(0, 1)
    if (valLines.length) {
      ctx.page.drawText(valLines[0], {
        x: x + 8 + labelW + 4,
        y,
        size: lineSize,
        font: ctx.font,
        color: poc ? INK : MUTED,
      })
    }
    y -= 18
  }
}

export async function generatePastPerformancePdf({
  contract,
  opportunity,
  description,
}: {
  contract: Contract
  opportunity?: Opportunity
  description: string
}) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx: DrawCtx = { page, font, bold }

  // Top orange stripe
  page.drawRectangle({
    x: 0,
    y: PAGE_H - STRIPE_TOP,
    width: PAGE_W,
    height: STRIPE_TOP,
    color: ORANGE,
  })

  // Black header bar
  const headerTop = PAGE_H - STRIPE_TOP
  page.drawRectangle({
    x: 0,
    y: headerTop - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: HEADER_BG,
  })

  // Logo (white tile + brand mark) — failure to embed must NOT block the export.
  try {
    const logoBytes = await loadLogoPng()
    if (logoBytes) {
      const logoImg = await pdf.embedPng(logoBytes)
      const logoH = 36
      const logoW = (logoImg.width / logoImg.height) * logoH
      const padX = 8
      const padY = 5
      page.drawRectangle({
        x: MARGIN - padX,
        y: headerTop - HEADER_H / 2 - logoH / 2 - padY,
        width: logoW + padX * 2,
        height: logoH + padY * 2,
        color: rgb(1, 1, 1),
      })
      page.drawImage(logoImg, {
        x: MARGIN,
        y: headerTop - HEADER_H / 2 - logoH / 2,
        width: logoW,
        height: logoH,
      })
    }
  } catch (err) {
    console.warn('Past performance PDF: logo embed failed, continuing without it', err)
  }

  // Header right meta
  const meta = '|  SDVOSB  |  CAGE: 9KV33'
  const metaSize = 10
  const metaW = font.widthOfTextAtSize(meta, metaSize)
  page.drawText(meta, {
    x: PAGE_W - MARGIN - metaW,
    y: headerTop - HEADER_H / 2 - 3,
    size: metaSize,
    font,
    color: rgb(0.85, 0.85, 0.88),
  })

  // Title
  const title = 'Relevant Past Performance'
  const titleSize = 18
  const titleW = bold.widthOfTextAtSize(title, titleSize)
  const titleY = headerTop - HEADER_H - 36
  page.drawText(title, {
    x: (PAGE_W - titleW) / 2,
    y: titleY,
    size: titleSize,
    font: bold,
    color: INK,
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
  const contractingPoc = pocs.find(p => p.role === 'KO')
  const technicalPoc = pocs.find(p => p.role === 'COR') || pocs.find(p => p.role === 'END_USER')

  // Layout
  const tableX = MARGIN
  const tableW = PAGE_W - MARGIN * 2
  const halfW = tableW / 2

  let y = titleY - 24

  // Cell 1 — full width
  {
    const h = 56
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(
      ctx,
      '1.   Complete name of commercial firm, Government agency or other organization awarding contract:',
      tableX,
      y,
      tableW,
    )
    drawCellValue(ctx, awardingOrg, tableX, y, tableW, ll, 1)
    y -= h
  }

  // Row: Cells 2 & 4
  {
    const h = 50
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '2. Contract Number or other reference:', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '4. Date of Contract:', tableX + halfW, y, halfW)
    drawCellValue(ctx, contractRef, tableX, y, halfW, lL, 1)
    drawCellValue(ctx, fmtDate(dateOfContract), tableX + halfW, y, halfW, lR, 1)
    y -= h
  }

  // Row: Cells 5 & 6
  {
    const h = 50
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '5. Date work started:', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '6. Date work was or will be completed:', tableX + halfW, y, halfW)
    drawCellValue(ctx, fmtDate(startDate), tableX, y, halfW, lL, 1)
    drawCellValue(ctx, fmtDate(endDate), tableX + halfW, y, halfW, lR, 1)
    y -= h
  }

  // Cell 7 — full width
  {
    const h = 50
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(ctx, '7. Total Contract Amount: (including all options)', tableX, y, tableW)
    drawCellValue(ctx, fmtMoney(totalAmount), tableX, y, tableW, ll, 1)
    y -= h
  }

  // Row: Cells 8 & 9 — POCs
  {
    const h = 130
    drawCellBox(page, tableX, y, halfW, h)
    drawCellBox(page, tableX + halfW, y, halfW, h)
    const lL = drawCellLabel(ctx, '8.  Contracting or purchasing point of contact:', tableX, y, halfW)
    const lR = drawCellLabel(ctx, '9.  Technical point of contact:', tableX + halfW, y, halfW)
    drawPocBlock(ctx, contractingPoc, tableX, y, halfW, lL)
    drawPocBlock(ctx, technicalPoc, tableX + halfW, y, halfW, lR)
    y -= h
  }

  // Cell 10 — full width
  {
    const h = 50
    drawCellBox(page, tableX, y, tableW, h)
    const ll = drawCellLabel(ctx, '10.  Location of work:', tableX, y, tableW)
    drawCellValue(ctx, location, tableX, y, tableW, ll, 1)
    y -= h
  }

  // Cell 11 — description, takes the remaining vertical space
  {
    const footerTop = STRIPE_BOTTOM + FOOTER_H
    const cell11Bottom = footerTop + 12
    const h = y - cell11Bottom
    if (h > 60) {
      drawCellBox(page, tableX, y, tableW, h)
      const ll = drawCellLabel(ctx, '11.  Description of contract work:', tableX, y, tableW)
      const descSize = 10
      const lineGap = descSize + 3
      const usable = Math.max(0, Math.floor((h - 18 - ll * 11 - 6) / lineGap))
      const lines = wrap(ctx, description, tableW - 14, descSize).slice(0, usable)
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: tableX + 7,
          y: y - 18 - ll * 11 - i * lineGap,
          size: descSize,
          font,
          color: INK,
        })
      })
    }
  }

  // Footer band
  page.drawRectangle({
    x: 0,
    y: STRIPE_BOTTOM,
    width: PAGE_W,
    height: FOOTER_H,
    color: FOOTER_BG,
  })
  const footText = 'CE Solution Plus Corp.  |  Confidential & Proprietary  |  cesolutionplus.com'
  const footSize = 9
  const footW = font.widthOfTextAtSize(footText, footSize)
  page.drawText(footText, {
    x: (PAGE_W - footW) / 2,
    y: STRIPE_BOTTOM + FOOTER_H / 2 - 3,
    size: footSize,
    font,
    color: rgb(0.82, 0.82, 0.86),
  })

  // Bottom orange stripe
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: STRIPE_BOTTOM,
    color: ORANGE,
  })

  const bytes = await pdf.save()
  const safeId = (contractRef || contract.id).replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `past-performance-${safeId}.pdf`)
}
