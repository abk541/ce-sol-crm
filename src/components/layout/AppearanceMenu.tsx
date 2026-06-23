import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Gauge,
  Moon,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Type,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, type Theme } from '../../themes'
import { FONT_CATALOG, type FontCategory, type FontEntry } from '../../lib/fonts'
import {
  ACCENT_PRESETS,
  type DensityMode,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  RADIUS_SCALE_DEFAULT,
  RADIUS_SCALE_MAX,
  RADIUS_SCALE_MIN,
  useAppearance,
} from '../../lib/appearance'
import { useEscapeKey } from '../../lib/utils'

type FamilyFilter = 'all' | 'dark' | 'light'

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const {
    prefs,
    theme,
    updatePrefs,
    previewPrefs,
    cancelPreview,
    resetPrefs,
    loadFont,
  } = useAppearance()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  useEscapeKey(() => {
    cancelPreview()
    setOpen(false)
  }, open)

  useEffect(() => {
    if (!open) return
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      setAnchor({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // If popover closes mid-preview, revert.
  useEffect(() => {
    if (!open) cancelPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = () => {
    cancelPreview()
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="appearance-trigger"
        aria-label="Open appearance controls"
        aria-expanded={open}
        title="Appearance"
      >
        <Palette size={15} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && anchor && (
            <>
              <motion.div
                key="appearance-overlay"
                className="fixed inset-0 z-[60]"
                onClick={close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                style={{ background: 'transparent' }}
              />
              <motion.div
                key="appearance-popover"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="appearance-popover fixed z-[61] w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border"
                style={{ top: anchor.top, right: anchor.right }}
              >
                <PopoverHeader theme={theme} onReset={resetPrefs} />
                <div className="max-h-[78vh] space-y-4 overflow-y-auto p-3">
                  <ThemeSection
                    activeId={prefs.themeId}
                    onPreview={id => previewPrefs({ themeId: id })}
                    onCancelPreview={cancelPreview}
                    onPick={id => updatePrefs({ themeId: id })}
                  />

                  <CustomizeSection
                    accentOverride={prefs.accentOverride}
                    density={prefs.density}
                    radiusScale={prefs.radiusScale}
                    reduceMotion={prefs.reduceMotion}
                    onAccent={hex => updatePrefs({ accentOverride: hex })}
                    onDensity={d => updatePrefs({ density: d })}
                    onRadius={n => updatePrefs({ radiusScale: n })}
                    onRadiusPreview={n => previewPrefs({ radiusScale: n })}
                    onReduceMotion={v => updatePrefs({ reduceMotion: v })}
                  />

                  <FontSection
                    activeFamily={prefs.fontFamily}
                    onPick={family => updatePrefs({ fontFamily: family })}
                    loadFont={loadFont}
                  />

                  <SizeSection
                    value={prefs.fontSize}
                    onChange={v => updatePrefs({ fontSize: v })}
                    onPreview={v => previewPrefs({ fontSize: v })}
                    fontFamily={prefs.fontFamily}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Popover header
// ─────────────────────────────────────────────────────────────────────
function PopoverHeader({ theme, onReset }: { theme: Theme; onReset: () => void }) {
  return (
    <div className="appearance-popover__header px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[var(--text-primary)]">Appearance</p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--text-tertiary)]">
            {theme.name} · {theme.blurb}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
            title="Reset to defaults"
          >
            <RotateCcw size={10} />
            Reset
          </button>
          <span className="appearance-popover__icon">
            <Palette size={13} />
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Theme grid — family tabs, search, live hover-preview tiles
// ─────────────────────────────────────────────────────────────────────
function ThemeSection({
  activeId,
  onPreview,
  onCancelPreview,
  onPick,
}: {
  activeId: string
  onPreview: (id: string) => void
  onCancelPreview: () => void
  onPick: (id: string) => void
}) {
  const [family, setFamily] = useState<FamilyFilter>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return THEMES.filter(t => {
      if (family !== 'all' && t.family !== family) return false
      if (!q) return true
      const tags = t.tags?.join(' ') ?? ''
      return (
        t.name.toLowerCase().includes(q) ||
        t.blurb.toLowerCase().includes(q) ||
        tags.toLowerCase().includes(q)
      )
    })
  }, [family, search])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          <Sparkles size={10} />
          Theme
        </p>
        <span className="text-[9px] font-bold text-[var(--text-muted)]">
          {filtered.length}/{THEMES.length}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <FamilyTabs value={family} onChange={setFamily} />
      </div>

      <div className="relative mb-2">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search themes…"
          className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] py-1.5 pl-7 pr-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        />
      </div>

      <div
        className="grid grid-cols-2 gap-2"
        onMouseLeave={onCancelPreview}
      >
        {filtered.map(t => (
          <ThemeTile
            key={t.id}
            theme={t}
            active={activeId === t.id}
            onHover={() => onPreview(t.id)}
            onClick={() => onPick(t.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-[var(--border-default)] py-6 text-center text-[11px] text-[var(--text-tertiary)]">
            No themes match “{search}”.
          </div>
        )}
      </div>
    </section>
  )
}

function FamilyTabs({
  value,
  onChange,
}: {
  value: FamilyFilter
  onChange: (v: FamilyFilter) => void
}) {
  const tabs: Array<{ id: FamilyFilter; label: string; icon: React.ReactNode }> = [
    { id: 'all', label: 'All', icon: <Sparkles size={10} /> },
    { id: 'dark', label: 'Dark', icon: <Moon size={10} /> },
    { id: 'light', label: 'Light', icon: <Sun size={10} /> },
  ]
  return (
    <div className="inline-flex w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] p-0.5">
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${
            value === t.id
              ? 'bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-xs)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ThemeTile({
  theme,
  active,
  onHover,
  onClick,
}: {
  theme: Theme
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  const [sidebar, body, accent, accent2] = theme.preview
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={`appearance-theme-tile ${active ? 'is-active' : ''}`}
      title={theme.blurb}
    >
      <div
        className="appearance-theme-tile__preview"
        style={
          {
            ['--tile-sidebar' as string]: sidebar,
            ['--tile-body' as string]: body,
          } as React.CSSProperties
        }
      >
        <div className="appearance-theme-tile__sidebar">
          <div
            className="mx-auto mt-1.5 h-1 w-2 rounded-full"
            style={{ background: accent }}
          />
          <div
            className="mx-auto mt-1 h-1 w-2 rounded-full"
            style={{ background: `color-mix(in srgb, ${accent} 50%, transparent)` }}
          />
        </div>
        <div className="appearance-theme-tile__body">
          <div className="flex items-center gap-1">
            <div
              className="appearance-theme-tile__topbar flex-1"
              style={{ background: `color-mix(in srgb, ${accent} 36%, transparent)` }}
            />
            <div
              className="h-[6px] w-[6px] rounded-full"
              style={{ background: accent }}
            />
          </div>
          <div
            className="text-[11px] font-black leading-none"
            style={{
              fontFamily: `'${theme.typography.headingFamily}', sans-serif`,
              color: theme.family === 'dark' ? '#FFFFFF' : '#111',
              textTransform: theme.typography.headingTransform,
              letterSpacing: theme.typography.headingLetterSpacing,
            }}
          >
            Aa
          </div>
          <div className="appearance-theme-tile__row">
            <div className="appearance-theme-tile__chip" style={{ background: accent }} />
            <div className="appearance-theme-tile__chip" style={{ background: accent2 }} />
            <div
              className="appearance-theme-tile__chip"
              style={{ background: `color-mix(in srgb, ${accent} 28%, transparent)` }}
            />
          </div>
        </div>
      </div>
      <div className="appearance-theme-tile__meta">
        <div className="appearance-theme-tile__name">
          <span className="truncate">{theme.name}</span>
          {active && <Check size={11} className="shrink-0 text-[var(--accent)]" />}
        </div>
        <div className="appearance-theme-tile__blurb">{theme.blurb}</div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Customize panel: always-open, prominent header, accent-first layout
// ─────────────────────────────────────────────────────────────────────
function CustomizeSection({
  accentOverride,
  density,
  radiusScale,
  reduceMotion,
  onAccent,
  onDensity,
  onRadius,
  onRadiusPreview,
  onReduceMotion,
}: {
  accentOverride: string | null
  density: DensityMode | null
  radiusScale: number
  reduceMotion: boolean
  onAccent: (hex: string | null) => void
  onDensity: (d: DensityMode | null) => void
  onRadius: (n: number) => void
  onRadiusPreview: (n: number) => void
  onReduceMotion: (v: boolean) => void
}) {
  const overrides =
    (accentOverride ? 1 : 0) +
    (density ? 1 : 0) +
    (radiusScale !== RADIUS_SCALE_DEFAULT ? 1 : 0) +
    (reduceMotion ? 1 : 0)
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 4%, transparent))',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <span className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <SlidersHorizontal size={13} />
          </span>
          Customize
        </span>
        {overrides > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]"
            style={{
              background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
              color: 'var(--accent)',
            }}
          >
            {overrides} active
          </span>
        )}
      </div>
      <div className="space-y-4 px-3 py-3">
        <AccentRow value={accentOverride} onChange={onAccent} />
        <DensityRow value={density} onChange={onDensity} />
        <RadiusRow
          value={radiusScale}
          onChange={onRadius}
          onPreview={onRadiusPreview}
        />
        <MotionRow value={reduceMotion} onChange={onReduceMotion} />
      </div>
    </section>
  )
}

function AccentRow({
  value,
  onChange,
}: {
  value: string | null
  onChange: (hex: string | null) => void
}) {
  const [custom, setCustom] = useState(value ?? '#B8914E')
  return (
    <div>
      <RowLabel icon={<Palette size={10} />} label="Accent" />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[8px] font-black uppercase tracking-wider transition-all ${
            value === null
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)]'
          }`}
          title="Use theme accent"
        >
          Aa
        </button>
        {ACCENT_PRESETS.map(hex => {
          const active = value?.toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: hex,
                borderColor: active ? 'var(--text-primary)' : 'transparent',
              }}
              title={hex}
            >
              {active && (
                <Check
                  size={11}
                  className="absolute inset-0 m-auto text-white drop-shadow"
                  strokeWidth={3}
                />
              )}
            </button>
          )
        })}
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={custom}
            onChange={e => {
              setCustom(e.target.value)
              onChange(e.target.value)
            }}
            className="h-7 w-7 cursor-pointer rounded-full border-2 border-[var(--border-default)] bg-transparent"
            title="Custom color"
          />
        </div>
      </div>
    </div>
  )
}

function DensityRow({
  value,
  onChange,
}: {
  value: DensityMode | null
  onChange: (v: DensityMode | null) => void
}) {
  const items: Array<{ id: DensityMode | null; label: string }> = [
    { id: null, label: 'Theme' },
    { id: 'compact', label: 'Compact' },
    { id: 'comfortable', label: 'Cozy' },
    { id: 'spacious', label: 'Spacious' },
  ]
  return (
    <div>
      <RowLabel icon={<Gauge size={10} />} label="Density" />
      <div className="inline-flex w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] p-0.5">
        {items.map(it => (
          <button
            key={String(it.id)}
            type="button"
            onClick={() => onChange(it.id)}
            className={`flex-1 rounded px-1 py-1 text-[10px] font-bold uppercase tracking-[0.10em] transition-all ${
              value === it.id
                ? 'bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RadiusRow({
  value,
  onChange,
  onPreview,
}: {
  value: number
  onChange: (n: number) => void
  onPreview: (n: number) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <RowLabel icon={<SlidersHorizontal size={10} />} label="Roundness" inline />
        <span className="text-[10px] font-bold text-[var(--text-primary)]">
          {value === 0 ? 'Sharp' : value < 0.85 ? 'Subtle' : value <= 1.15 ? 'Theme' : 'Round'} · {pct}%
        </span>
      </div>
      <input
        type="range"
        min={RADIUS_SCALE_MIN}
        max={RADIUS_SCALE_MAX}
        step={0.05}
        value={value}
        onChange={e => onPreview(Number(e.target.value))}
        onMouseUp={e => onChange(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={e => onChange(Number((e.target as HTMLInputElement).value))}
        onKeyUp={e => onChange(Number((e.target as HTMLInputElement).value))}
        className="appearance-slider"
      />
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        <span>Sharp</span>
        <button
          type="button"
          onClick={() => onChange(RADIUS_SCALE_DEFAULT)}
          className="text-[9px] font-bold text-[var(--accent)] hover:underline"
        >
          Theme default
        </button>
        <span>Round</span>
      </div>
    </div>
  )
}

function MotionRow({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <RowLabel icon={<Zap size={10} />} label="Motion" inline />
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
          {value ? 'Animations disabled.' : 'Smooth transitions everywhere.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        style={{
          background: value
            ? 'color-mix(in srgb, var(--accent) 85%, transparent)'
            : 'color-mix(in srgb, var(--text-muted) 40%, transparent)',
          boxShadow: value
            ? 'inset 0 0 0 1px var(--accent)'
            : 'inset 0 0 0 1px color-mix(in srgb, var(--text-muted) 50%, transparent)',
        }}
        aria-label="Toggle reduced motion"
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  )
}

function RowLabel({
  icon,
  label,
  inline = false,
}: {
  icon: React.ReactNode
  label: string
  inline?: boolean
}) {
  return (
    <p
      className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)] ${inline ? '' : 'mb-1.5'}`}
    >
      {icon}
      {label}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Font picker — visual grid of font cards each rendered in its own face
// ─────────────────────────────────────────────────────────────────────
type FontFilter = 'all' | FontCategory

function FontSection({
  activeFamily,
  onPick,
  loadFont,
}: {
  activeFamily: string | null
  onPick: (family: string | null) => void
  loadFont: (family: string) => void
}) {
  const [filter, setFilter] = useState<FontFilter>('all')
  const [search, setSearch] = useState('')

  // Eagerly load fonts on mount so previews are typeset, not blank.
  useEffect(() => {
    FONT_CATALOG.forEach(f => loadFont(f.family))
  }, [loadFont])

  const filtered = useMemo<FontEntry[]>(() => {
    const q = search.trim().toLowerCase()
    return FONT_CATALOG.filter(f => {
      if (filter !== 'all' && f.category !== filter) return false
      if (!q) return true
      return f.family.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    })
  }, [filter, search])

  const tabs: Array<{ id: FontFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'sans', label: 'Sans' },
    { id: 'serif', label: 'Serif' },
    { id: 'mono', label: 'Mono' },
    { id: 'display', label: 'Display' },
  ]

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          <Type size={10} />
          Font
        </p>
        <span className="text-[9px] font-bold text-[var(--text-muted)]">
          {filtered.length}/{FONT_CATALOG.length}
        </span>
      </div>

      <div className="mb-2 inline-flex w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] p-0.5">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`flex-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${
              filter === t.id
                ? 'bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mb-2">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search fonts…"
          className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] py-1.5 pl-7 pr-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FontTile
          family={null}
          category="auto"
          active={activeFamily === null}
          onClick={() => onPick(null)}
        />
        {filtered.map(font => (
          <FontTile
            key={font.family}
            family={font.family}
            category={font.category}
            active={activeFamily === font.family}
            onClick={() => onPick(font.family)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-[var(--border-default)] py-6 text-center text-[11px] text-[var(--text-tertiary)]">
            No fonts match “{search}”.
          </div>
        )}
      </div>
    </section>
  )
}

function FontTile({
  family,
  category,
  active,
  onClick,
}: {
  family: string | null
  category: string
  active: boolean
  onClick: () => void
}) {
  const label = family ?? 'Theme default'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`appearance-theme-tile flex flex-col items-stretch ${active ? 'is-active' : ''}`}
      title={label}
    >
      <div
        className="flex items-center justify-center px-3"
        style={{
          height: 56,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, var(--bg-card)), var(--bg-card))',
          color: 'var(--text-primary)',
          fontFamily: family ? `'${family}', sans-serif` : undefined,
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {family ? 'Ag' : 'Auto'}
      </div>
      <div className="appearance-theme-tile__meta">
        <div className="appearance-theme-tile__name">
          <span className="truncate">{label}</span>
          {active && <Check size={11} className="shrink-0 text-[var(--accent)]" />}
        </div>
        <div className="appearance-theme-tile__blurb uppercase tracking-[0.12em]">{category}</div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Size — live preview + preset chips + fine-tune slider
// ─────────────────────────────────────────────────────────────────────
function SizeSection({
  value,
  onChange,
  onPreview,
  fontFamily,
}: {
  value: number
  onChange: (v: number) => void
  onPreview: (v: number) => void
  fontFamily: string | null
}) {
  const presets: Array<{ size: number; label: string }> = [
    { size: 13, label: 'Small' },
    { size: 15, label: 'Default' },
    { size: 17, label: 'Comfy' },
    { size: 19, label: 'Large' },
  ]
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          <Type size={10} />
          Text size
        </p>
        <span className="text-[10px] font-black text-[var(--text-primary)]">{value}px</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)]">
        <div
          className="border-b border-[var(--border-default)] px-3 py-3"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent)',
            fontFamily: fontFamily ? `'${fontFamily}', sans-serif` : undefined,
          }}
        >
          <div
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: `${value}px`, lineHeight: 1.35, letterSpacing: '-0.01em' }}
          >
            The quick brown fox
          </div>
          <div
            className="mt-0.5 text-[var(--text-tertiary)]"
            style={{ fontSize: `${Math.max(11, value - 3)}px`, lineHeight: 1.4 }}
          >
            jumps over the lazy dog — 0123456789
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1.5">
          {presets.map(p => {
            const active = value === p.size
            return (
              <button
                key={p.size}
                type="button"
                onClick={() => onChange(p.size)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 transition-all ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-xs)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="text-[11px] font-black">{p.size}</span>
                <span className="text-[8px] font-bold uppercase tracking-[0.12em] opacity-80">
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-t border-[var(--border-default)] px-3 py-2.5">
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            value={value}
            onChange={e => onPreview(Number(e.target.value))}
            onMouseUp={e => onChange(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={e => onChange(Number((e.target as HTMLInputElement).value))}
            onKeyUp={e => onChange(Number((e.target as HTMLInputElement).value))}
            className="appearance-slider"
          />
          <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            <span>{FONT_SIZE_MIN}px</span>
            <button
              type="button"
              onClick={() => onChange(FONT_SIZE_DEFAULT)}
              className="text-[9px] font-bold text-[var(--accent)] hover:underline"
            >
              {FONT_SIZE_DEFAULT}px default
            </button>
            <span>{FONT_SIZE_MAX}px</span>
          </div>
        </div>
      </div>
    </section>
  )
}
