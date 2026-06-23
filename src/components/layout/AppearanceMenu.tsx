import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
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
import { FONT_CATALOG, type FontEntry } from '../../lib/fonts'
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
// Customize accordion: accent / density / radius / motion
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
  const [open, setOpen] = useState(
    !!(accentOverride || density || radiusScale !== RADIUS_SCALE_DEFAULT || reduceMotion),
  )
  return (
    <section className="rounded-lg border border-[var(--border-default)]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          <SlidersHorizontal size={11} />
          Customize
        </span>
        <ChevronDown
          size={13}
          className={`text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-[var(--border-default)] px-3 py-3">
          <AccentRow value={accentOverride} onChange={onAccent} />
          <DensityRow value={density} onChange={onDensity} />
          <RadiusRow
            value={radiusScale}
            onChange={onRadius}
            onPreview={onRadiusPreview}
          />
          <MotionRow value={reduceMotion} onChange={onReduceMotion} />
        </div>
      )}
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
// Font dropdown with search and per-entry preview
// ─────────────────────────────────────────────────────────────────────
function FontSection({
  activeFamily,
  onPick,
  loadFont,
}: {
  activeFamily: string | null
  onPick: (family: string | null) => void
  loadFont: (family: string) => void
}) {
  const [openList, setOpenList] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openList) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenList(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openList])

  useEffect(() => {
    if (!openList) return
    FONT_CATALOG.slice(0, 8).forEach(f => loadFont(f.family))
  }, [openList, loadFont])

  const filtered = useMemo<FontEntry[]>(() => {
    const q = search.trim().toLowerCase()
    if (!q) return FONT_CATALOG
    return FONT_CATALOG.filter(
      f => f.family.toLowerCase().includes(q) || f.category.toLowerCase().includes(q),
    )
  }, [search])

  const activeLabel = activeFamily ?? 'Match theme default'

  return (
    <section ref={wrapRef}>
      <RowLabel icon={<Type size={10} />} label="Font" />
      <button
        type="button"
        onClick={() => setOpenList(v => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
        style={activeFamily ? { fontFamily: `'${activeFamily}', sans-serif` } : undefined}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${openList ? 'rotate-180' : ''}`}
        />
      </button>

      {openList && (
        <div className="appearance-font-dropdown mt-1.5">
          <div className="sticky top-0 z-10 border-b border-[var(--border-default)] bg-[var(--bg-modal)] p-2">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search fonts…"
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] py-1.5 pl-7 pr-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onPick(null)
              setOpenList(false)
            }}
            className={`appearance-font-option ${activeFamily === null ? 'is-active' : ''}`}
          >
            <span className="appearance-font-option__name">Match theme default</span>
            <span className="appearance-font-option__cat">Auto</span>
          </button>

          {filtered.map(font => (
            <button
              key={font.family}
              type="button"
              onMouseEnter={() => loadFont(font.family)}
              onFocus={() => loadFont(font.family)}
              onClick={() => {
                loadFont(font.family)
                onPick(font.family)
                setOpenList(false)
              }}
              className={`appearance-font-option ${activeFamily === font.family ? 'is-active' : ''}`}
              style={{ fontFamily: `'${font.family}', sans-serif` }}
            >
              <span className="appearance-font-option__name">{font.family}</span>
              <span className="appearance-font-option__cat">{font.category}</span>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-[var(--text-tertiary)]">
              No fonts match “{search}”.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Font size slider
// ─────────────────────────────────────────────────────────────────────
function SizeSection({
  value,
  onChange,
  onPreview,
}: {
  value: number
  onChange: (v: number) => void
  onPreview: (v: number) => void
}) {
  return (
    <section>
      <RowLabel icon={<Type size={10} />} label="Size" />
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">Root font size</span>
          <span className="text-[12px] font-bold text-[var(--text-primary)]">{value}px</span>
        </div>
        <input
          type="range"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          value={value}
          onChange={e => onPreview(Number(e.target.value))}
          onMouseUp={e => onChange(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => onChange(Number((e.target as HTMLInputElement).value))}
          onKeyUp={e => onChange(Number((e.target as HTMLInputElement).value))}
          className="appearance-slider mt-2"
        />
        <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          <span>{FONT_SIZE_MIN}px</span>
          <button
            type="button"
            onClick={() => onChange(FONT_SIZE_DEFAULT)}
            className="text-[9px] font-bold text-[var(--accent)] hover:underline"
          >
            {FONT_SIZE_DEFAULT}px
          </button>
          <span>{FONT_SIZE_MAX}px</span>
        </div>
      </div>
    </section>
  )
}
