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
// `themeId` is a registry key (see src/themes/index.ts).
// `fontFamily` is a Google Font name from FONT_CATALOG, or `null` to
// inherit the active theme's body font.
// `fontSize` is the root pixel size driving rem scaling across the app.
// ─────────────────────────────────────────────────────────────────────

export type AppearancePrefs = {
  themeId: string
  fontFamily: string | null
  fontSize: number // 12 – 20, default 14
}

export const APPEARANCE_STORAGE_KEY = 'ces-crm-appearance'
export const STYLE_TAG_ID = 'ces-theme-tokens'
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 20
export const FONT_SIZE_DEFAULT = 14

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  themeId: DEFAULT_THEME_ID,
  fontFamily: null,
  fontSize: FONT_SIZE_DEFAULT,
}

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
// Persistence
// ─────────────────────────────────────────────────────────────────────

function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(n)))
}

export function getAppearancePrefs(): AppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
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
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

// ─────────────────────────────────────────────────────────────────────
// CSS injection — single <style> tag in <head> holds the resolved
// :root token block, overridden by the per-theme data-theme attribute.
// ─────────────────────────────────────────────────────────────────────

function buildCssBlock(theme: Theme, fontFamily: string | null, fontSize: number): string {
  const vars = themeToCssVars(theme)
  if (fontFamily && FONT_BY_FAMILY[fontFamily]) {
    vars['--app-font'] = `"${fontFamily}", ui-sans-serif, system-ui, sans-serif`
  } else {
    vars['--app-font'] = 'var(--font-body)'
  }
  vars['--app-font-size'] = `${fontSize}px`

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
    theme.density.fontScale < 0.97
      ? 'compact'
      : theme.density.fontScale > 1.01
      ? 'spacious'
      : 'standard'
  root.dataset.btn = theme.chrome.btnStyle
  root.dataset.card = theme.chrome.cardStyle
  root.dataset.motion = theme.motion.preset

  ensureStyleTag().textContent = buildCssBlock(theme, prefs.fontFamily, prefs.fontSize)

  loadGoogleFonts([
    theme.typography.headingFamily,
    theme.typography.bodyFamily,
    theme.typography.monoFamily,
    prefs.fontFamily,
  ])
}

export function saveAppearancePrefs(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs))
  applyAppearancePrefs(prefs)
  window.dispatchEvent(new CustomEvent('ces-appearance-change', { detail: prefs }))
}

export function initializeAppearance() {
  if (typeof document === 'undefined') return
  applyAppearancePrefs(getAppearancePrefs())
}

// ─────────────────────────────────────────────────────────────────────
// React hook — single source of truth for the UI.
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
  }, [])

  const updatePrefs = (patch: Partial<AppearancePrefs>) => {
    const next: AppearancePrefs = {
      themeId: patch.themeId ?? prefs.themeId,
      fontFamily: patch.fontFamily === undefined ? prefs.fontFamily : patch.fontFamily,
      fontSize: patch.fontSize === undefined ? prefs.fontSize : clampFontSize(patch.fontSize),
    }
    setPrefs(next)
    saveAppearancePrefs(next)
  }

  const theme = getTheme(prefs.themeId)
  // Back-compat: legacy callers access prefs.theme / prefs.font / prefs.size.
  const legacyPrefs = {
    ...prefs,
    theme: prefs.themeId,
    font: prefs.fontFamily,
    size: prefs.fontSize,
  }

  return { prefs: legacyPrefs, theme, updatePrefs, loadFont: loadGoogleFont }
}
