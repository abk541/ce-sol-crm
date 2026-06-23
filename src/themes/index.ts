import { aurora } from './aurora'
import { prism } from './prism'
import { noir } from './noir'
import { daylight } from './daylight'
import { corporate } from './corporate'
import { saas } from './saas'
import { terminal } from './terminal'
import { warm } from './warm'
import { minimal } from './minimal'
import { synthwave } from './synthwave'
import { newsprint } from './newsprint'
import { dracula } from './dracula'
import { sunset } from './sunset'
import { mint } from './mint'
import { abyss } from './abyss'
import { forest } from './forest'
import { midnight } from './midnight'
import { sandstone } from './sandstone'
import { carbon } from './carbon'
import { lavender } from './lavender'
import { solar } from './solar'
import { ocean } from './ocean'
import type { Theme } from './types'

export type { Theme } from './types'

// Display order in the AppearanceMenu — calm / usable themes first, then
// vivid statement themes, then originals. Filterable via family tabs.
export const THEMES: Theme[] = [
  sandstone,
  lavender,
  solar,
  mint,
  sunset,
  newsprint,
  ocean,
  midnight,
  carbon,
  dracula,
  abyss,
  forest,
  synthwave,
  saas,
  corporate,
  terminal,
  warm,
  minimal,
  aurora,
  prism,
  noir,
  daylight,
]

export const THEME_BY_ID: Record<string, Theme> = THEMES.reduce(
  (acc, theme) => {
    acc[theme.id] = theme
    return acc
  },
  {} as Record<string, Theme>,
)

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME_ID: ThemeId = 'aurora'

export function getTheme(id: string | undefined | null): Theme {
  if (id && THEME_BY_ID[id]) return THEME_BY_ID[id]
  return THEME_BY_ID[DEFAULT_THEME_ID]
}

// ─────────────────────────────────────────────────────────────────────
// Convert a Theme object into the full :root CSS custom-property block.
// Keys here are the contract the rest of the CSS / Tailwind config reads.
// ─────────────────────────────────────────────────────────────────────
export function themeToCssVars(theme: Theme): Record<string, string> {
  const c = theme.colors
  const t = theme.typography
  const r = theme.radius
  const s = theme.shadow
  const d = theme.density
  const n = theme.nav
  const m = theme.motion

  return {
    // Surfaces
    '--bg-app': c.appBg,
    '--bg-card': c.cardBg,
    '--bg-raised': c.raisedBg,
    '--bg-sidebar': c.sidebarBg,
    '--bg-modal': c.modalBg,
    '--bg-input': c.inputBg,
    '--bg-overlay': c.overlayBg,
    // Borders
    '--border-subtle': c.borderSubtle,
    '--border-default': c.borderDefault,
    '--border-strong': c.borderStrong,
    '--border-input': c.borderInput,
    '--border-focus': c.borderFocus,
    // Text
    '--text-primary': c.textPrimary,
    '--text-secondary': c.textSecondary,
    '--text-tertiary': c.textTertiary,
    '--text-muted': c.textMuted,
    '--text-inverse': c.textInverse,
    // Accent / brand (legacy --indigo-* preserved for back-compat)
    '--accent': c.accent,
    '--accent-2': c.accent2,
    '--accent-soft': c.accentSoft,
    '--accent-glow': c.accentGlow,
    '--indigo-700': c.brand700,
    '--indigo-600': c.brand600,
    '--indigo-500': c.brand500,
    '--indigo-400': c.brand400,
    // Sidebar / nav
    '--sidebar-text': c.sidebarText,
    '--sidebar-muted': c.sidebarMuted,
    '--sidebar-border': c.sidebarBorder,
    '--sidebar-control-bg': c.sidebarControlBg,
    '--nav-hover': c.navHover,
    '--nav-active': c.navActive,
    '--nav-active-border': c.navActiveBorder,
    '--nav-radius': r.nav,
    '--sidebar-width-expanded': `${n.widthExpanded}px`,
    '--sidebar-width-collapsed': `${n.widthCollapsed}px`,
    // States
    '--success-fg': c.successFg,
    '--success-bg': c.successBg,
    '--warning-fg': c.warningFg,
    '--warning-bg': c.warningBg,
    '--error-fg': c.errorFg,
    '--error-bg': c.errorBg,
    '--info-fg': c.infoFg,
    '--info-bg': c.infoBg,
    // Layered backgrounds
    '--body-bg': c.bodyBg,
    '--shell-bg': c.shellBg,
    '--topbar-bg': c.topbarBg,
    '--sidebar-bg-image': c.sidebarBgImage,
    // Typography
    '--font-heading': `"${t.headingFamily}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
    '--font-body': `"${t.bodyFamily}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
    '--font-mono': `"${t.monoFamily}", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
    '--font-heading-weight': String(t.headingWeight),
    '--font-body-weight': String(t.bodyWeight),
    '--font-heading-tracking': t.headingLetterSpacing,
    '--font-body-tracking': t.bodyLetterSpacing,
    '--font-heading-transform': t.headingTransform,
    '--theme-font-scale': String(d.fontScale),
    // Radii
    '--radius-sm': r.sm,
    '--radius-md': r.md,
    '--radius-lg': r.lg,
    '--radius-xl': r.xl,
    '--radius-pill': r.pill,
    '--radius-btn': r.btn,
    '--radius-card': r.card,
    '--radius-input': r.input,
    // Shadows
    '--shadow-xs': s.xs,
    '--shadow-sm': s.sm,
    '--shadow-md': s.md,
    '--shadow-lg': s.lg,
    '--shadow-xl': s.xl,
    '--shadow-modal': s.modal,
    '--shadow-focus': s.focus,
    '--shadow-btn-primary': s.btnPrimary,
    // Density
    '--pad-y': d.controlPadY,
    '--pad-x': d.controlPadX,
    '--row-pad-y': d.tableRowPadY,
    '--row-pad-x': d.tableRowPadX,
    '--card-pad': d.cardPad,
    '--gap-compact': d.gapCompact,
    '--gap-std': d.gapStd,
    // Motion
    '--motion-fast': m.fast,
    '--motion-mid': m.mid,
    '--motion-slow': m.slow,
    '--ease-smooth': m.easing,
    '--ease-spring': m.easing,
  }
}

// Pre-built chart-color lookup for components that don't want to touch the
// theme object directly.
export function chartColorsForTheme(themeId: string): string[] {
  return getTheme(themeId).chartColors
}
