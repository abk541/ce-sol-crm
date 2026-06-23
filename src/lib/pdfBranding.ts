import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib'

// Shared visual identity for every PDF the app exports.
// Cosmetic only — never touches data, layout structure, or generation mechanics.

export const PDF_THEME = {
  // Page geometry (US Letter, points)
  PAGE_W: 612,
  PAGE_H: 792,
  MARGIN: 44,

  // Header band — slimmer than before for a refined look
  HEADER_H: 68,
  HEADER_ACCENT_H: 2,

  // Footer band
  FOOTER_H: 28,
  FOOTER_ACCENT_H: 1.5,

  // Palette — cool navy with warm gold + clean greys
  NAVY: rgb(0.043, 0.094, 0.149),         // #0B1826 — header band
  NAVY_DEEP: rgb(0.020, 0.055, 0.094),    // #050E18 — band shading
  GOLD: rgb(0.831, 0.706, 0.420),         // #D4B46B — accent rule + labels
  GOLD_SOFT: rgb(0.949, 0.890, 0.741),    // #F2E3BD — subtitle text on dark
  WHITE: rgb(1, 1, 1),
  OFF_WHITE: rgb(0.976, 0.980, 0.988),    // #F9FAFC — soft body fills
  INK: rgb(0.071, 0.098, 0.137),          // #121923 — primary text
  INK_SOFT: rgb(0.255, 0.302, 0.357),     // #414D5B — secondary text
  MUTED: rgb(0.498, 0.541, 0.596),        // #7F8A98 — labels, captions
  BORDER: rgb(0.886, 0.906, 0.929),       // #E2E7ED — hairline borders
  BORDER_STRONG: rgb(0.733, 0.769, 0.812), // #BBC4CF — emphasis borders
  ACCENT_TEAL: rgb(0.063, 0.345, 0.345),  // #115858 — total / amount highlight
} as const

export const COMPANY_FOOTER_LINE =
  'CE Solution Plus Corp.   ·   Confidential & Proprietary   ·   cesolutionplus.com'

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

export interface BrandFonts {
  /** Helvetica — body / sans copy. */
  sans: PDFFont
  /** Helvetica Bold. */
  sansBold: PDFFont
  /** Times Roman — light serif (tagline). */
  serif: PDFFont
  /** Times Roman Bold — wordmark "SOLUTION PLUS". */
  serifBold: PDFFont
  /** Times Bold Italic — the "CE" calligraphic monogram. */
  serifItalic: PDFFont
}

export async function loadBrandFonts(pdf: PDFDocument): Promise<BrandFonts> {
  const [sans, sansBold, serif, serifBold, serifItalic] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
  ])
  return { sans, sansBold, serif, serifBold, serifItalic }
}

// ── Brand logo loader ─────────────────────────────────────────────
// Fetches /logo.avif (the same asset the app's CompanyLogo component
// uses), rasterizes it via a 2D canvas, and re-colors every opaque pixel
// to clean white-on-transparent so it sits naturally on the dark navy
// header band. Cached after the first successful load.
let cachedLogoPngBytes: Uint8Array | null | undefined

async function loadBrandLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogoPngBytes !== undefined) return cachedLogoPngBytes
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    cachedLogoPngBytes = null
    return null
  }
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
    const res = await fetch(`${base}logo.avif`)
    if (!res.ok) {
      cachedLogoPngBytes = null
      return null
    }
    const blob = await res.blob()
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('logo decode failed'))
      el.src = URL.createObjectURL(blob)
    })
    const scale = 3
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    URL.revokeObjectURL(img.src)
    if (!ctx) {
      cachedLogoPngBytes = null
      return null
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    const pixels = ctx.getImageData(0, 0, w, h)
    const data = pixels.data
    // Convert every visible pixel to solid white. White / near-white pixels
    // become fully transparent so the navy header reads through cleanly —
    // this mirrors the `filter: brightness(0) invert(1)` treatment used by
    // the in-app <CompanyLogo /> component.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 8 || (r > 232 && g > 232 && b > 232)) {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 0
      } else {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        // Preserve original alpha for smooth edges
      }
    }
    ctx.putImageData(pixels, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1] ?? ''
    if (!base64) {
      cachedLogoPngBytes = null
      return null
    }
    const binary = atob(base64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    cachedLogoPngBytes = out
    return out
  } catch {
    cachedLogoPngBytes = null
    return null
  }
}

export async function loadBrandLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  const bytes = await loadBrandLogoBytes()
  if (!bytes) return null
  try {
    return await pdf.embedPng(bytes)
  } catch {
    return null
  }
}

interface DrawWordmarkOptions {
  page: PDFPage
  brand: BrandFonts
  /** Left edge of the wordmark in points. */
  x: number
  /** Vertical center of the wordmark band. */
  centerY: number
  /** Color for every glyph and rule (white on dark headers, ink on light). */
  color: ReturnType<typeof rgb>
  /** Optional accent color for the "CE" monogram. Defaults to `color`. */
  monogramColor?: ReturnType<typeof rgb>
}

// Draw the company wordmark natively using pdf-lib standard fonts.
// Replicates: italic CE monogram | thin separator | "SOLUTION PLUS" with widely
// tracked tagline. Crisp at any zoom and never depends on browser font availability.
export function drawWordmark(opts: DrawWordmarkOptions) {
  const { page, brand, x, centerY, color } = opts
  const monogramColor = opts.monogramColor ?? color

  // ── CE monogram ───────────────────────────────────────────────────
  const ceSize = 30
  const ceText = 'CE'
  const ceWidth = brand.serifItalic.widthOfTextAtSize(ceText, ceSize)
  // Baseline so the cap-height sits centered on centerY
  const ceBaselineY = centerY - ceSize * 0.36
  page.drawText(ceText, {
    x,
    y: ceBaselineY,
    size: ceSize,
    font: brand.serifItalic,
    color: monogramColor,
  })

  // ── Separator rule ────────────────────────────────────────────────
  const sepX = x + ceWidth + 12
  const sepHalf = ceSize * 0.55
  page.drawLine({
    start: { x: sepX, y: centerY - sepHalf },
    end: { x: sepX, y: centerY + sepHalf },
    color,
    thickness: 0.6,
  })

  // ── "SOLUTION PLUS" wordmark with hand-tracked letter spacing ────
  const wordX = sepX + 12
  const wordSize = 13.5
  const wordText = 'SOLUTION PLUS'
  const wordTracking = 1.6
  const wordBaselineY = centerY + 3
  let cursor = wordX
  for (const ch of wordText) {
    page.drawText(ch, {
      x: cursor,
      y: wordBaselineY,
      size: wordSize,
      font: brand.serifBold,
      color,
    })
    cursor += brand.serifBold.widthOfTextAtSize(ch, wordSize) + wordTracking
  }
  const wordEndX = cursor

  // ── Tagline — small caps style with very wide tracking ───────────
  const tagSize = 5.4
  const tagText = 'YOU HAVE A NEED, WE HAVE A SOLUTION'
  const tagTracking = 1.4
  let tagWidth = 0
  for (const ch of tagText) tagWidth += brand.serif.widthOfTextAtSize(ch, tagSize) + tagTracking
  tagWidth -= tagTracking
  // Center the tagline under the SOLUTION PLUS wordmark
  const tagStartX = wordX + (wordEndX - wordX) / 2 - tagWidth / 2
  const tagBaselineY = centerY - 11
  cursor = tagStartX
  for (const ch of tagText) {
    page.drawText(ch, {
      x: cursor,
      y: tagBaselineY,
      size: tagSize,
      font: brand.serif,
      color,
    })
    cursor += brand.serif.widthOfTextAtSize(ch, tagSize) + tagTracking
  }

  return { width: wordEndX - x, height: ceSize }
}

export interface BrandedHeaderOptions {
  page: PDFPage
  brand: BrandFonts
  /** Document type label, rendered on the right (e.g. "INVOICE"). */
  docType: string
  /** Optional small line under the doc type (e.g. invoice number). */
  docMeta?: string
  /** Optional subtitle line above the doc type. */
  subtitle?: string
  /** Embedded company logo image. When omitted, the procedural wordmark is drawn instead. */
  logo?: PDFImage | null
}

export function drawBrandedHeader({ page, brand, docType, docMeta, subtitle, logo }: BrandedHeaderOptions) {
  const { PAGE_W, PAGE_H, MARGIN, HEADER_H, HEADER_ACCENT_H, NAVY, NAVY_DEEP, GOLD, WHITE, GOLD_SOFT } = PDF_THEME

  // Solid navy band with a subtle deeper-navy bottom strip for depth
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY })
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: HEADER_H * 0.34,
    color: NAVY_DEEP,
  })
  // Hairline gold accent rule directly under the band
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H - HEADER_ACCENT_H,
    width: PAGE_W,
    height: HEADER_ACCENT_H,
    color: GOLD,
  })

  const bandCenterY = PAGE_H - HEADER_H / 2

  if (logo) {
    // Embedded brand logo — preferred path, matches the in-app CompanyLogo.
    const targetH = HEADER_H * 0.62
    const ratio = logo.width / logo.height
    const targetW = targetH * ratio
    page.drawImage(logo, {
      x: MARGIN,
      y: bandCenterY - targetH / 2,
      width: targetW,
      height: targetH,
    })
  } else {
    // Fallback: procedural wordmark.
    drawWordmark({
      page,
      brand,
      x: MARGIN,
      centerY: bandCenterY,
      color: WHITE,
      monogramColor: GOLD_SOFT,
    })
  }

  // Right side — slim subtitle above the doc type, then doc meta below
  const rightX = PAGE_W - MARGIN

  if (subtitle) {
    const safe = toWinAnsi(subtitle)
    const size = 7
    const w = brand.sans.widthOfTextAtSize(safe, size)
    page.drawText(safe, {
      x: rightX - w,
      y: bandCenterY + 14,
      size,
      font: brand.sans,
      color: GOLD_SOFT,
    })
  }

  const safeType = toWinAnsi(docType)
  const typeSize = 16
  const typeW = brand.sansBold.widthOfTextAtSize(safeType, typeSize)
  // Tracked, all-caps for a refined editorial feel
  let cursor = rightX - typeW - (safeType.length - 1) * 0.8
  for (const ch of safeType) {
    page.drawText(ch, {
      x: cursor,
      y: bandCenterY - 2,
      size: typeSize,
      font: brand.sansBold,
      color: WHITE,
    })
    cursor += brand.sansBold.widthOfTextAtSize(ch, typeSize) + 0.8
  }

  if (docMeta) {
    const safeMeta = toWinAnsi(docMeta)
    const metaSize = 8.5
    const w = brand.sans.widthOfTextAtSize(safeMeta, metaSize)
    page.drawText(safeMeta, {
      x: rightX - w,
      y: bandCenterY - 16,
      size: metaSize,
      font: brand.sans,
      color: GOLD,
    })
  }
}

export interface BrandedFooterOptions {
  page: PDFPage
  brand: BrandFonts
  /** Optional left-aligned text. */
  leftText?: string
  /** Optional right-aligned text. */
  rightText?: string
}

export function drawBrandedFooter({ page, brand, leftText, rightText }: BrandedFooterOptions) {
  const { PAGE_W, MARGIN, FOOTER_H, FOOTER_ACCENT_H, GOLD, MUTED, BORDER } = PDF_THEME

  // Hairline gold accent rule above the footer
  page.drawRectangle({
    x: MARGIN,
    y: FOOTER_H + FOOTER_ACCENT_H,
    width: PAGE_W - MARGIN * 2,
    height: FOOTER_ACCENT_H,
    color: GOLD,
  })
  page.drawLine({
    start: { x: MARGIN, y: FOOTER_H + FOOTER_ACCENT_H + 4 },
    end: { x: PAGE_W - MARGIN, y: FOOTER_H + FOOTER_ACCENT_H + 4 },
    color: BORDER,
    thickness: 0.3,
  })

  const centerText = toWinAnsi(COMPANY_FOOTER_LINE)
  const centerSize = 7.5
  const centerW = brand.sans.widthOfTextAtSize(centerText, centerSize)
  page.drawText(centerText, {
    x: (PAGE_W - centerW) / 2,
    y: FOOTER_H / 2 - 1,
    size: centerSize,
    font: brand.sans,
    color: MUTED,
  })

  if (leftText) {
    const safe = toWinAnsi(leftText)
    page.drawText(safe, {
      x: MARGIN,
      y: FOOTER_H / 2 - 1,
      size: 7,
      font: brand.sans,
      color: MUTED,
    })
  }
  if (rightText) {
    const safe = toWinAnsi(rightText)
    const w = brand.sans.widthOfTextAtSize(safe, 7)
    page.drawText(safe, {
      x: PAGE_W - MARGIN - w,
      y: FOOTER_H / 2 - 1,
      size: 7,
      font: brand.sans,
      color: MUTED,
    })
  }
}
