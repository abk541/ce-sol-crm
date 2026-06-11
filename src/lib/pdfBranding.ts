import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib'

// Shared visual identity for every PDF the app exports.
// Pure cosmetic helpers — they do not affect what data ends up on the page,
// only how it looks (header band, logo, footer, palette, typography).

export const PDF_THEME = {
  // Page geometry (US Letter, points)
  PAGE_W: 612,
  PAGE_H: 792,
  MARGIN: 40,

  // Header band
  HEADER_H: 88,
  HEADER_ACCENT_H: 3,

  // Footer band
  FOOTER_H: 36,
  FOOTER_ACCENT_H: 2,

  // Palette
  NAVY: rgb(0.043, 0.094, 0.149),       // #0B1826 — header / footer band
  NAVY_DEEP: rgb(0.027, 0.063, 0.106),  // #07101B — subtle gradient feel via stacked rects
  GOLD: rgb(0.843, 0.745, 0.478),       // #D7BE7A — accent rule + small labels
  GOLD_SOFT: rgb(0.937, 0.894, 0.769),  // #EFE4C4 — subtitle text on dark
  WHITE: rgb(1, 1, 1),
  OFF_WHITE: rgb(0.973, 0.976, 0.984),  // #F8F9FB — body soft fills
  INK: rgb(0.063, 0.094, 0.137),        // #101823 — primary body text
  INK_SOFT: rgb(0.227, 0.275, 0.337),   // #3A4656 — secondary text
  MUTED: rgb(0.451, 0.502, 0.561),      // #73808F — labels, captions
  BORDER: rgb(0.847, 0.875, 0.910),     // #D8DFE8 — table / cell borders
  BORDER_STRONG: rgb(0.690, 0.733, 0.788), // #B0BBC9 — emphasis borders
  ACCENT_TEAL: rgb(0.075, 0.353, 0.345), // #135A58 — totals / amount highlight
} as const

export const COMPANY_FOOTER_LINE =
  'CE Solution Plus Corp.   |   Confidential & Proprietary   |   www.cesolutionplus.com'

// Replace characters that pdf-lib's WinAnsi encoder cannot handle with safe equivalents
// so a stray unicode glyph in user data never crashes the export.
export function toWinAnsi(input: string): string {
  if (!input) return ''
  return input
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
}

// Load the company logo as a PNG byte array, optionally inverted for dark backgrounds.
// Returns null on any failure — the caller must skip the logo gracefully.
export async function loadCompanyLogoBytes(options: { invert?: boolean } = {}): Promise<Uint8Array | null> {
  try {
    const url = `${import.meta.env.BASE_URL}logo.svg`
    const res = await fetch(url)
    if (!res.ok) return null
    let svgText = await res.text()
    // strip the explicit white background rect — we want the mark on a transparent canvas
    svgText = svgText.replace(/<rect[^/]*fill="white"[^/]*\/>/i, '')
    if (options.invert) {
      // recolor every black ink stroke/fill to pure white so the mark sits on dark headers
      svgText = svgText
        .replace(/fill="#0A0A0A"/gi, 'fill="#FFFFFF"')
        .replace(/stroke="#0A0A0A"/gi, 'stroke="#FFFFFF"')
        .replace(/fill="#000000"/gi, 'fill="#FFFFFF"')
        .replace(/stroke="#000000"/gi, 'stroke="#FFFFFF"')
        .replace(/fill="black"/gi, 'fill="#FFFFFF"')
        .replace(/stroke="black"/gi, 'stroke="#FFFFFF"')
    }
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = blobUrl
      if (typeof img.decode === 'function') {
        await img.decode()
      } else {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('logo load failed'))
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
        return null
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
    console.warn('[pdfBranding] logo embed failed', err)
    return null
  }
}

export interface BrandedHeaderOptions {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  logo?: PDFImage | null
  /** Document type label, rendered large on the right (e.g. "INVOICE"). */
  docType: string
  /** Optional small line under the doc type (e.g. invoice number). */
  docMeta?: string
  /** Optional subtitle line above the doc type (e.g. "SDVOSB | CAGE: 9KV33"). */
  subtitle?: string
}

export function drawBrandedHeader({
  page,
  font,
  bold,
  logo,
  docType,
  docMeta,
  subtitle,
}: BrandedHeaderOptions) {
  const { PAGE_W, PAGE_H, MARGIN, HEADER_H, HEADER_ACCENT_H, NAVY, NAVY_DEEP, GOLD, WHITE, GOLD_SOFT } = PDF_THEME

  // Stacked rectangles fake a subtle vertical gradient on the dark band
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY })
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: HEADER_H * 0.42,
    color: NAVY_DEEP,
  })
  // Gold accent rule directly under the band
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H - HEADER_ACCENT_H,
    width: PAGE_W,
    height: HEADER_ACCENT_H,
    color: GOLD,
  })

  // Logo on the left — already inverted to white when loaded
  if (logo) {
    const targetH = 40
    const targetW = (logo.width / logo.height) * targetH
    page.drawImage(logo, {
      x: MARGIN,
      y: PAGE_H - HEADER_H / 2 - targetH / 2,
      width: targetW,
      height: targetH,
    })
  } else {
    // Fallback wordmark when the logo cannot be embedded
    page.drawText('CE SOLUTION PLUS', {
      x: MARGIN,
      y: PAGE_H - HEADER_H / 2 - 4,
      size: 16,
      font: bold,
      color: WHITE,
    })
  }

  // Right side — subtitle (small gold), then big doc type, then doc meta
  const rightX = PAGE_W - MARGIN
  const baseY = PAGE_H - HEADER_H / 2

  if (subtitle) {
    const safe = toWinAnsi(subtitle)
    const w = font.widthOfTextAtSize(safe, 8.5)
    page.drawText(safe, { x: rightX - w, y: baseY + 18, size: 8.5, font, color: GOLD_SOFT })
  }
  const safeType = toWinAnsi(docType)
  const typeSize = 22
  const typeW = bold.widthOfTextAtSize(safeType, typeSize)
  page.drawText(safeType, { x: rightX - typeW, y: baseY - 6, size: typeSize, font: bold, color: WHITE })
  if (docMeta) {
    const safeMeta = toWinAnsi(docMeta)
    const w = bold.widthOfTextAtSize(safeMeta, 10.5)
    page.drawText(safeMeta, { x: rightX - w, y: baseY - 22, size: 10.5, font: bold, color: GOLD })
  }
}

export interface BrandedFooterOptions {
  page: PDFPage
  font: PDFFont
  /** Optional left-aligned text (e.g. page number, document id). */
  leftText?: string
  /** Optional right-aligned text. */
  rightText?: string
}

export function drawBrandedFooter({ page, font, leftText, rightText }: BrandedFooterOptions) {
  const { PAGE_W, MARGIN, FOOTER_H, FOOTER_ACCENT_H, NAVY, GOLD, WHITE, GOLD_SOFT } = PDF_THEME

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: NAVY })
  page.drawRectangle({
    x: 0,
    y: FOOTER_H,
    width: PAGE_W,
    height: FOOTER_ACCENT_H,
    color: GOLD,
  })

  const centerText = toWinAnsi(COMPANY_FOOTER_LINE)
  const centerSize = 8.5
  const centerW = font.widthOfTextAtSize(centerText, centerSize)
  page.drawText(centerText, {
    x: (PAGE_W - centerW) / 2,
    y: FOOTER_H / 2 - 3,
    size: centerSize,
    font,
    color: WHITE,
  })

  if (leftText) {
    const safe = toWinAnsi(leftText)
    page.drawText(safe, {
      x: MARGIN,
      y: FOOTER_H / 2 - 3,
      size: 8,
      font,
      color: GOLD_SOFT,
    })
  }
  if (rightText) {
    const safe = toWinAnsi(rightText)
    const w = font.widthOfTextAtSize(safe, 8)
    page.drawText(safe, {
      x: PAGE_W - MARGIN - w,
      y: FOOTER_H / 2 - 3,
      size: 8,
      font,
      color: GOLD_SOFT,
    })
  }
}

// Convenience: embed the logo into a freshly created PDFDocument, returning the
// PDFImage handle (or null) the caller passes into drawBrandedHeader.
export async function embedCompanyLogo(pdf: PDFDocument, options: { invert?: boolean } = {}) {
  try {
    const bytes = await loadCompanyLogoBytes(options)
    if (!bytes) return null
    return await pdf.embedPng(bytes)
  } catch (err) {
    console.warn('[pdfBranding] embedCompanyLogo failed', err)
    return null
  }
}
