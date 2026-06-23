// ─────────────────────────────────────────────────────────────────────
// Theme contract — every Theme MUST satisfy this shape.
// Tokens are converted to CSS custom properties at runtime and scoped
// to <html data-theme="id">. Tailwind utilities (bg-card, text-primary,
// border-default, shadow-card, rounded-card, font-sans, etc.) read
// these vars, so swapping data-theme retones the whole UI.
// ─────────────────────────────────────────────────────────────────────

export type ThemeFamily = 'dark' | 'light'

export type ThemeColors = {
  // App surfaces
  appBg: string
  cardBg: string
  raisedBg: string
  sidebarBg: string
  modalBg: string
  inputBg: string
  overlayBg: string
  // Borders
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  borderInput: string
  borderFocus: string
  // Text
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textMuted: string
  textInverse: string
  // Accent
  accent: string
  accent2: string
  accentSoft: string
  accentGlow: string
  // Brand alt scale (legacy --indigo-*)
  brand700: string
  brand600: string
  brand500: string
  brand400: string
  // Sidebar
  sidebarText: string
  sidebarMuted: string
  sidebarBorder: string
  sidebarControlBg: string
  navHover: string
  navActive: string
  navActiveBorder: string
  // States
  successFg: string
  successBg: string
  warningFg: string
  warningBg: string
  errorFg: string
  errorBg: string
  infoFg: string
  infoBg: string
  // Backgrounds (gradients)
  bodyBg: string
  shellBg: string
  topbarBg: string
  sidebarBgImage: string
}

export type ThemeTypography = {
  // Google Font family names used as theme defaults; user override in
  // appearance prefs can replace these via --app-font.
  headingFamily: string
  bodyFamily: string
  monoFamily: string
  // Weights (CSS values)
  headingWeight: number | string
  bodyWeight: number | string
  // Tracking
  headingLetterSpacing: string
  bodyLetterSpacing: string
  // Heading transform
  headingTransform: 'none' | 'uppercase' | 'lowercase'
}

export type ThemeRadius = {
  sm: string
  md: string
  lg: string
  xl: string
  pill: string
  nav: string
  btn: string
  card: string
  input: string
}

export type ThemeShadow = {
  xs: string
  sm: string
  md: string
  lg: string
  xl: string
  modal: string
  focus: string
  btnPrimary: string
  // Visual personality (e.g. 'flat' suppresses elevation entirely)
  style: 'glass' | 'soft' | 'hard' | 'flat' | 'neumorphic'
}

export type ThemeDensity = {
  // Base font scale multiplier (theme-level density; user font-size slider
  // is independent)
  fontScale: number
  // Standard control padding
  controlPadY: string
  controlPadX: string
  // Tables
  tableRowPadY: string
  tableRowPadX: string
  // Cards
  cardPad: string
  // Gaps
  gapCompact: string
  gapStd: string
}

export type ThemeNav = {
  // Sidebar widths
  widthExpanded: number
  widthCollapsed: number
  // Logical style — currently visual only; preserved so future structural
  // changes (top-only nav) have a hook to read.
  style: 'sidebar' | 'rail' | 'topbar'
  defaultCollapsed: boolean
}

export type ThemeMotion = {
  // CSS duration tokens
  fast: string
  mid: string
  slow: string
  easing: string
  // 'instant' disables most transitions for a snappy/terminal feel
  preset: 'snappy' | 'smooth' | 'instant'
}

export type ThemeChrome = {
  // Component personality flags (consumed by index.css per-theme selectors)
  btnStyle: 'gradient' | 'flat' | 'outline' | 'pill' | 'hard'
  cardStyle: 'glass' | 'flat' | 'soft' | 'sharp' | 'hard'
  badgeStyle: 'soft' | 'outline' | 'solid'
  tableStriped: boolean
}

// Optional decorative pattern overlaid on the body. Drives data-bg-pattern
// hooks in index.css. Default 'none' if omitted.
export type ThemeBgPattern =
  | 'none'
  | 'grid'
  | 'dots'
  | 'scanlines'
  | 'paper'
  | 'diagonal'
  | 'topo'

export type Theme = {
  id: string
  name: string
  blurb: string
  family: ThemeFamily
  colors: ThemeColors
  typography: ThemeTypography
  radius: ThemeRadius
  shadow: ThemeShadow
  density: ThemeDensity
  nav: ThemeNav
  motion: ThemeMotion
  chrome: ThemeChrome
  chartColors: string[]
  // Preview swatches (4 colors) shown in the AppearanceMenu picker:
  // [sidebarBg, cardBg, accent, accent2]
  preview: [string, string, string, string]
  // Optional decorative pattern overlaid on body via ::before.
  bgPattern?: ThemeBgPattern
  // Optional tagline / family flag shown in tile UI.
  tags?: string[]
}
