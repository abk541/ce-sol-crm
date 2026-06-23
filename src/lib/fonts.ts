// ─────────────────────────────────────────────────────────────────────
// Curated Google Fonts catalog + on-demand loader.
// Fonts are fetched as a <link rel="stylesheet"> appended to <head>
// only when first selected (or when an active theme requires them).
// We de-dupe by element id so re-applying the same font is a no-op.
// ─────────────────────────────────────────────────────────────────────

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display'

export type FontEntry = {
  family: string
  category: FontCategory
  // Comma-separated weights (axis) string used to build the Google Fonts URL.
  weights: string
  // Italic axis suffix; empty if italics aren't loaded.
  italic?: boolean
}

// Curated set: 20 fonts. Covers sans / serif / mono / display.
export const FONT_CATALOG: FontEntry[] = [
  // Sans
  { family: 'Inter',             category: 'sans',    weights: '300;400;500;600;700;800' },
  { family: 'Plus Jakarta Sans', category: 'sans',    weights: '300;400;500;600;700;800' },
  { family: 'Manrope',           category: 'sans',    weights: '300;400;500;600;700;800' },
  { family: 'DM Sans',           category: 'sans',    weights: '300;400;500;600;700;800;900' },
  { family: 'Outfit',            category: 'sans',    weights: '300;400;500;600;700;800;900' },
  { family: 'Sora',              category: 'sans',    weights: '300;400;500;600;700;800' },
  { family: 'Work Sans',         category: 'sans',    weights: '300;400;500;600;700;800' },
  { family: 'Public Sans',       category: 'sans',    weights: '300;400;500;600;700;800;900' },
  { family: 'Nunito',            category: 'sans',    weights: '300;400;500;600;700;800;900' },
  { family: 'Quicksand',         category: 'sans',    weights: '300;400;500;600;700' },
  // Serif
  { family: 'Source Serif 4',    category: 'serif',   weights: '300;400;500;600;700;800;900' },
  { family: 'Playfair Display',  category: 'serif',   weights: '400;500;600;700;800;900' },
  { family: 'Crimson Pro',       category: 'serif',   weights: '300;400;500;600;700;800;900' },
  { family: 'EB Garamond',       category: 'serif',   weights: '400;500;600;700;800' },
  { family: 'Lora',              category: 'serif',   weights: '400;500;600;700' },
  { family: 'Source Sans 3',     category: 'sans',    weights: '300;400;500;600;700;800;900' },
  // Mono
  { family: 'JetBrains Mono',    category: 'mono',    weights: '300;400;500;600;700;800' },
  { family: 'Fira Code',         category: 'mono',    weights: '300;400;500;600;700' },
  { family: 'IBM Plex Mono',     category: 'mono',    weights: '300;400;500;600;700' },
  // Display / distinctive
  { family: 'Space Grotesk',     category: 'display', weights: '300;400;500;600;700' },
  { family: 'Unbounded',         category: 'display', weights: '300;400;500;600;700;800;900' },
]

export const FONT_BY_FAMILY: Record<string, FontEntry> = FONT_CATALOG.reduce(
  (acc, font) => {
    acc[font.family] = font
    return acc
  },
  {} as Record<string, FontEntry>,
)

function familyToUrlSegment(family: string): string {
  return family.trim().replace(/\s+/g, '+')
}

function styleElementId(family: string): string {
  return `ces-font-${familyToUrlSegment(family).toLowerCase()}`
}

function buildGoogleFontHref(entry: FontEntry): string {
  const base = `https://fonts.googleapis.com/css2?family=${familyToUrlSegment(entry.family)}`
  const axis = entry.italic
    ? `:ital,wght@0,${entry.weights.replace(/;/g, ';0,')};1,${entry.weights.replace(/;/g, ';1,')}`
    : `:wght@${entry.weights}`
  return `${base}${axis}&display=swap`
}

/**
 * Append a Google Fonts <link> for the given family (if known) to <head>.
 * No-op if already injected or running outside a browser.
 */
export function loadGoogleFont(family: string | undefined | null): void {
  if (typeof document === 'undefined' || !family) return
  const entry = FONT_BY_FAMILY[family]
  if (!entry) return
  const id = styleElementId(family)
  if (document.getElementById(id)) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.id = id
  link.href = buildGoogleFontHref(entry)
  document.head.appendChild(link)
}

/**
 * Bulk loader — loads every family in the given list once.
 */
export function loadGoogleFonts(families: Array<string | undefined | null>): void {
  const seen = new Set<string>()
  families.forEach(f => {
    if (!f || seen.has(f)) return
    seen.add(f)
    loadGoogleFont(f)
  })
}
