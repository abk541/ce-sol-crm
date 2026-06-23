import { useEffect, useState } from 'react'
import {
  DEFAULT_THEME_ID,
  THEME_BY_ID,
  THEMES,
  getTheme,
  themeToCssVars,
  chartColorsForTheme as registryChartColors,
  type Theme,
} from '../themes'
import { FONT_BY_FAMILY, loadGoogleFont, loadGoogleFonts } from './fonts'

// ─────────────────────────────────────────────────────────────────────
// Persisted appearance preferences.
//
// `themeId`        — registry key (see src/themes/index.ts)
// `fontFamily`     — Google Font name from FONT_CATALOG, or null to use
//                    the active theme's body font
// `fontSize`       — root pixel size driving rem scaling app-wide
// `accentOverride` — hex color that overrides --accent (and accent-soft
//                    / accent-glow / focus) regardless of theme; null
//                    means use theme accent
// `density`        — override the theme's density tier; null = theme
// `radiusScale`    — multiplier applied to --radius-* (0 = sharp, 1 =
//                    theme default, 1.6 = extra round)
// `reduceMotion`   — when true, all transitions are reduced to ~80ms
// ─────────────────────────────────────────────────────────────────────

export type DensityMode = 'compact' | 'comfortable' | 'spacious'

export type AppearancePrefs = {
  themeId: string
  fontFamily: string | null
  fontSize: number // 12 – 22, default 14
  accentOverride: string | null
  density: DensityMode | null
  radiusScale: number // 0 – 1.6, default 1
  reduceMotion: boolean
}

export const APPEARANCE_STORAGE_KEY = 'ces-crm-appearance'
export const APPEARANCE_COOKIE_KEY = 'ces_crm_appearance'
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year
export const STYLE_TAG_ID = 'ces-theme-tokens'

export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 22
export const FONT_SIZE_DEFAULT = 14

export const RADIUS_SCALE_MIN = 0
export const RADIUS_SCALE_MAX = 1.6
export const RADIUS_SCALE_DEFAULT = 1

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  themeId: DEFAULT_THEME_ID,
  fontFamily: null,
  fontSize: FONT_SIZE_DEFAULT,
  accentOverride: null,
  density: null,
  radiusScale: RADIUS_SCALE_DEFAULT,
  reduceMotion: false,
}

// Accent presets exposed by the picker. Free hex input is also allowed.
export const ACCENT_PRESETS: string[] = [
  '#B8914E', // gold
  '#5B6CFF', // indigo
  '#00D4FF', // cyan
  '#22C55E', // green
  '#F43F5E', // rose
  '#A855F7', // violet
  '#F59E0B', // amber
  '#FF71CE', // hot pink
  '#23D2D2', // aqua
  '#FF6B35', // tangerine
  '#0EA5E9', // sky
  '#D946EF', // magenta
]

// ─── Legacy exports preserved for back-compat with older consumers ──
export type ThemeId = string
export type FontId = string
export type FontSizeId = 'compact' | 'standard' | 'large'

export const THEME_OPTIONS = THEMES.map(t => ({
  id: t.id,
  name: t.name,
  description: t.blurb,
  mood: t.blurb,
  colors: t.preview,
}))

export const FONT_OPTIONS = Object.values(FONT_BY_FAMILY).map(f => ({
  id: f.family,
  name: f.family,
  description: f.category,
}))

export const FONT_SIZE_OPTIONS: Array<{ id: FontSizeId; name: string; description: string }> = [
  { id: 'compact', name: 'Compact', description: 'Smaller text, denser layout.' },
  { id: 'standard', name: 'Standard', description: 'Default size.' },
  { id: 'large', name: 'Large', description: 'Bigger text, easier scanning.' },
]

export function chartColorsForTheme(themeId: string): string[] {
  return registryChartColors(themeId)
}

// ─────────────────────────────────────────────────────────────────────
// Persistence — localStorage primary, cookie fallback. Read tries both
// so prefs survive even if one storage gets cleared.
// ─────────────────────────────────────────────────────────────────────

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function clampFontSize(value: unknown): number {
  return Math.round(clamp(value, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_DEFAULT))
}

function clampRadiusScale(value: unknown): number {
  return Math.round(clamp(value, RADIUS_SCALE_MIN, RADIUS_SCALE_MAX, RADIUS_SCALE_DEFAULT) * 100) / 100
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value.trim())
}

function isDensity(value: unknown): value is DensityMode {
  return value === 'compact' || value === 'comfortable' || value === 'spacious'
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const target = `${name}=`
  for (const raw of document.cookie.split(';')) {
    const part = raw.trim()
    if (part.startsWith(target)) {
      try {
        return decodeURIComponent(part.slice(target.length))
      } catch {
        return null
      }
    }
  }
  return null
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(value)
  document.cookie = `${name}=${encoded}; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; SameSite=Lax`
}

function normalizeRaw(raw: string | null): AppearancePrefs | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs> & {
      theme?: string
      font?: string
      size?: string | number
    }

    const themeIdRaw = parsed.themeId ?? parsed.theme
    const fontLegacy = parsed.fontFamily ?? parsed.font
    const sizeLegacy = parsed.fontSize ?? parsed.size

    let fontFamily: string | null = null
    if (typeof fontLegacy === 'string' && FONT_BY_FAMILY[fontLegacy]) {
      fontFamily = fontLegacy
    }

    let fontSize = FONT_SIZE_DEFAULT
    if (typeof sizeLegacy === 'number') {
      fontSize = clampFontSize(sizeLegacy)
    } else if (typeof sizeLegacy === 'string') {
      if (sizeLegacy === 'compact') fontSize = 13
      else if (sizeLegacy === 'large') fontSize = 16
      else fontSize = FONT_SIZE_DEFAULT
    }

    return {
      themeId: themeIdRaw && THEME_BY_ID[themeIdRaw] ? themeIdRaw : DEFAULT_THEME_ID,
      fontFamily,
      fontSize,
      accentOverride: isHexColor(parsed.accentOverride) ? parsed.accentOverride : null,
      density: isDensity(parsed.density) ? parsed.density : null,
      radiusScale: clampRadiusScale(parsed.radiusScale ?? RADIUS_SCALE_DEFAULT),
      reduceMotion: parsed.reduceMotion === true,
    }
  } catch {
    return null
  }
}

export function getAppearancePrefs(): AppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  let prefs: AppearancePrefs | null = null
  try {
    prefs = normalizeRaw(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))
  } catch {
    prefs = null
  }
  if (!prefs) {
    prefs = normalizeRaw(readCookie(APPEARANCE_COOKIE_KEY))
  }
  return prefs ?? DEFAULT_APPEARANCE
}

// ─────────────────────────────────────────────────────────────────────
// CSS injection — single <style> tag in <head> holds the resolved
// :root token block, overridden by the per-theme data-theme attribute.
// User-level prefs (accent, density, radius, motion) are applied on
// top of the theme token block.
// ─────────────────────────────────────────────────────────────────────

const DENSITY_TOKENS: Record<DensityMode, Record<string, string>> = {
  compact: {
    '--pad-y': '7px',
    '--pad-x': '11px',
    '--row-pad-y': '8px',
    '--row-pad-x': '12px',
    '--card-pad': '14px',
    '--gap-compact': '6px',
    '--gap-std': '10px',
    '--density-row-h': '32px',
  },
  comfortable: {
    '--pad-y': '10px',
    '--pad-x': '14px',
    '--row-pad-y': '12px',
    '--row-pad-x': '16px',
    '--card-pad': '20px',
    '--gap-compact': '9px',
    '--gap-std': '14px',
    '--density-row-h': '40px',
  },
  spacious: {
    '--pad-y': '14px',
    '--pad-x': '18px',
    '--row-pad-y': '16px',
    '--row-pad-x': '20px',
    '--card-pad': '28px',
    '--gap-compact': '12px',
    '--gap-std': '20px',
    '--density-row-h': '52px',
  },
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (full.length !== 6) return hex
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${full}${a}`
}

function buildCssBlock(theme: Theme, prefs: AppearancePrefs): string {
  const vars = themeToCssVars(theme)

  // Font override
  if (prefs.fontFamily && FONT_BY_FAMILY[prefs.fontFamily]) {
    vars['--app-font'] = `"${prefs.fontFamily}", ui-sans-serif, system-ui, sans-serif`
  } else {
    vars['--app-font'] = 'var(--font-body)'
  }
  vars['--app-font-size'] = `${prefs.fontSize}px`

  // Radius scaling — multiply each radius by user scale (with px floors).
  const baseRadii: Array<[string, string]> = [
    ['--radius-sm', theme.radius.sm],
    ['--radius-md', theme.radius.md],
    ['--radius-lg', theme.radius.lg],
    ['--radius-xl', theme.radius.xl],
    ['--radius-btn', theme.radius.btn],
    ['--radius-card', theme.radius.card],
    ['--radius-input', theme.radius.input],
    ['--nav-radius', theme.radius.nav],
  ]
  for (const [key, raw] of baseRadii) {
    const m = /^(-?\d+(?:\.\d+)?)(px|rem|em)$/.exec(raw.trim())
    if (!m) continue
    const n = Number(m[1])
    if (!Number.isFinite(n)) continue
    const scaled = Math.max(0, Math.round(n * prefs.radiusScale))
    vars[key] = `${scaled}${m[2]}`
  }

  // Density override
  if (prefs.density) {
    Object.assign(vars, DENSITY_TOKENS[prefs.density])
  }

  // Reduce motion — slam durations near zero.
  if (prefs.reduceMotion) {
    vars['--motion-fast'] = '0ms'
    vars['--motion-mid'] = '0ms'
    vars['--motion-slow'] = '0ms'
  }

  // Accent override — replaces all accent-derived tokens.
  if (prefs.accentOverride && isHexColor(prefs.accentOverride)) {
    const a = prefs.accentOverride
    vars['--accent'] = a
    vars['--accent-soft'] = withAlpha(a, 0.16)
    vars['--accent-glow'] = withAlpha(a, 0.32)
    vars['--border-focus'] = a
    vars['--shadow-focus'] = `0 0 0 3px ${withAlpha(a, 0.30)}`
    vars['--nav-active-border'] = a
    vars['--indigo-500'] = a
  }

  const decl = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  return `:root,\nhtml[data-theme="${theme.id}"] {\n${decl}\n}\n`
}

function ensureStyleTag(): HTMLStyleElement {
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_TAG_ID
    document.head.appendChild(tag)
  }
  return tag
}

export function applyAppearancePrefs(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return
  const theme = getTheme(prefs.themeId)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.themeFamily = theme.family
  root.dataset.shadow = theme.shadow.style
  root.dataset.density =
    prefs.density ??
    (theme.density.fontScale < 0.97
      ? 'compact'
      : theme.density.fontScale > 1.01
      ? 'spacious'
      : 'comfortable')
  root.dataset.btn = theme.chrome.btnStyle
  root.dataset.card = theme.chrome.cardStyle
  root.dataset.motion = prefs.reduceMotion ? 'instant' : theme.motion.preset
  root.dataset.bgPattern = theme.bgPattern ?? 'none'

  ensureStyleTag().textContent = buildCssBlock(theme, prefs)

  loadGoogleFonts([
    theme.typography.headingFamily,
    theme.typography.bodyFamily,
    theme.typography.monoFamily,
    prefs.fontFamily,
  ])
}

export function saveAppearancePrefs(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return
  const serialized = JSON.stringify(prefs)
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, serialized)
  } catch {
    /* private mode, quota — fall back to cookie only */
  }
  writeCookie(APPEARANCE_COOKIE_KEY, serialized)
  applyAppearancePrefs(prefs)
  window.dispatchEvent(new CustomEvent('ces-appearance-change', { detail: prefs }))
}

export function initializeAppearance() {
  if (typeof document === 'undefined') return
  applyAppearancePrefs(getAppearancePrefs())
}

// ─────────────────────────────────────────────────────────────────────
// React hook — single source of truth for the UI.
//
// `previewPrefs(prefs)` applies the given prefs to the DOM without
// persisting; `commitPrefs()` saves the currently-previewed state.
// The hover-preview UX in AppearanceMenu uses this pair.
// ─────────────────────────────────────────────────────────────────────
export function useAppearance() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => getAppearancePrefs())

  useEffect(() => {
    applyAppearancePrefs(prefs)
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<AppearancePrefs>).detail
      if (next) setPrefs(next)
    }
    window.addEventListener('ces-appearance-change', onChange)
    return () => window.removeEventListener('ces-appearance-change', onChange)
    // Apply on mount only — subsequent changes flow through updatePrefs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updatePrefs = (patch: Partial<AppearancePrefs>) => {
    const next: AppearancePrefs = {
      themeId: patch.themeId ?? prefs.themeId,
      fontFamily: patch.fontFamily === undefined ? prefs.fontFamily : patch.fontFamily,
      fontSize: patch.fontSize === undefined ? prefs.fontSize : clampFontSize(patch.fontSize),
      accentOverride:
        patch.accentOverride === undefined
          ? prefs.accentOverride
          : patch.accentOverride && isHexColor(patch.accentOverride)
          ? patch.accentOverride
          : null,
      density:
        patch.density === undefined
          ? prefs.density
          : isDensity(patch.density)
          ? patch.density
          : null,
      radiusScale:
        patch.radiusScale === undefined
          ? prefs.radiusScale
          : clampRadiusScale(patch.radiusScale),
      reduceMotion: patch.reduceMotion === undefined ? prefs.reduceMotion : !!patch.reduceMotion,
    }
    setPrefs(next)
    saveAppearancePrefs(next)
  }

  const previewPrefs = (patch: Partial<AppearancePrefs>) => {
    // Apply to the DOM without persisting or notifying other tabs.
    const next: AppearancePrefs = { ...prefs, ...patch }
    if (patch.fontSize !== undefined) next.fontSize = clampFontSize(patch.fontSize)
    if (patch.radiusScale !== undefined) next.radiusScale = clampRadiusScale(patch.radiusScale)
    applyAppearancePrefs(next)
  }

  const cancelPreview = () => applyAppearancePrefs(prefs)

  const resetPrefs = () => updatePrefs(DEFAULT_APPEARANCE)

  const theme = getTheme(prefs.themeId)

  // Back-compat: legacy callers access prefs.theme / prefs.font / prefs.size.
  const legacyPrefs = {
    ...prefs,
    theme: prefs.themeId,
    font: prefs.fontFamily,
    size: prefs.fontSize,
  }

  return {
    prefs: legacyPrefs,
    theme,
    updatePrefs,
    previewPrefs,
    cancelPreview,
    resetPrefs,
    loadFont: loadGoogleFont,
  }
}
