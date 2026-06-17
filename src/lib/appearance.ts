import { useEffect, useState } from 'react'

export type ThemeId = 'aurora' | 'prism' | 'noir' | 'daylight'
export type FontId = 'inter' | 'humanist' | 'editorial' | 'mono'
export type FontSizeId = 'compact' | 'standard' | 'large'

export type AppearancePrefs = {
  theme: ThemeId
  font: FontId
  size: FontSizeId
}

export const APPEARANCE_STORAGE_KEY = 'ces-crm-appearance'

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'aurora',
  font: 'inter',
  size: 'standard',
}

export const THEME_OPTIONS: Array<{
  id: ThemeId
  name: string
  description: string
  mood: string
  colors: string[]
}> = [
  {
    id: 'aurora',
    name: 'Aurora Command',
    description: 'Deep emerald, graphite and warm gold.',
    mood: 'Executive command center',
    colors: ['#07131F', '#0F4F59', '#1F7A78', '#D7BE7A'],
  },
  {
    id: 'prism',
    name: 'Prism Intelligence',
    description: 'Electric indigo, cyan and signal violet.',
    mood: 'High-energy analytics suite',
    colors: ['#090A2A', '#5B6CFF', '#00D4FF', '#F45BFF'],
  },
  {
    id: 'noir',
    name: 'Noir Ledger',
    description: 'Black glass, platinum and champagne.',
    mood: 'Luxury finance terminal',
    colors: ['#050507', '#1C1B22', '#C6B58A', '#F2EFE7'],
  },
  {
    id: 'daylight',
    name: 'Daylight Atlas',
    description: 'Bright ivory, navy and polished teal.',
    mood: 'Clean boardroom workspace',
    colors: ['#F7F4EA', '#102A43', '#0E7490', '#C08B2C'],
  },
]

export const FONT_OPTIONS: Array<{ id: FontId; name: string; description: string }> = [
  { id: 'inter', name: 'Inter', description: 'Balanced SaaS interface type.' },
  { id: 'humanist', name: 'Humanist', description: 'Softer, warmer operational feel.' },
  { id: 'editorial', name: 'Editorial', description: 'Premium report-style typography.' },
  { id: 'mono', name: 'Mono', description: 'Command-center technical rhythm.' },
]

export const FONT_SIZE_OPTIONS: Array<{ id: FontSizeId; name: string; description: string }> = [
  { id: 'compact', name: 'Compact', description: 'More data on screen.' },
  { id: 'standard', name: 'Standard', description: 'Default balanced spacing.' },
  { id: 'large', name: 'Large', description: 'Bigger text and calmer scanning.' },
]

export const THEME_CHART_COLORS: Record<ThemeId, string[]> = {
  aurora: ['#21D4A4', '#6E76FF', '#21C8F6', '#F0B84A', '#D7BE7A', '#EF6F7A', '#A78BFA'],
  prism: ['#00D4FF', '#8B5CF6', '#F45BFF', '#24F0A5', '#FFB84D', '#FF5C8A', '#5B6CFF'],
  noir: ['#F0D38A', '#BFC7D5', '#8F8A7A', '#FFFFFF', '#C6B58A', '#7A869A', '#D9B56D'],
  daylight: ['#0E7490', '#2563EB', '#16A34A', '#C08B2C', '#7C3AED', '#DC2626', '#0891B2'],
}

function isThemeId(value: unknown): value is ThemeId {
  return value === 'aurora' || value === 'prism' || value === 'noir' || value === 'daylight'
}

function isFontId(value: unknown): value is FontId {
  return value === 'inter' || value === 'humanist' || value === 'editorial' || value === 'mono'
}

function isFontSizeId(value: unknown): value is FontSizeId {
  return value === 'compact' || value === 'standard' || value === 'large'
}

export function getAppearancePrefs(): AppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
      font: isFontId(parsed.font) ? parsed.font : DEFAULT_APPEARANCE.font,
      size: isFontSizeId(parsed.size) ? parsed.size : DEFAULT_APPEARANCE.size,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function applyAppearancePrefs(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = prefs.theme
  root.dataset.font = prefs.font
  root.dataset.size = prefs.size
}

export function saveAppearancePrefs(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs))
  applyAppearancePrefs(prefs)
  window.dispatchEvent(new CustomEvent('ces-appearance-change', { detail: prefs }))
}

export function initializeAppearance() {
  applyAppearancePrefs(getAppearancePrefs())
}

export function chartColorsForTheme(theme: ThemeId) {
  return THEME_CHART_COLORS[theme] ?? THEME_CHART_COLORS.aurora
}

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
    const next = { ...prefs, ...patch }
    setPrefs(next)
    saveAppearancePrefs(next)
  }

  return { prefs, updatePrefs }
}
