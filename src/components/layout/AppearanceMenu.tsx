import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Palette, Search, Type } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { THEMES } from '../../themes'
import { FONT_CATALOG, type FontEntry } from '../../lib/fonts'
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  useAppearance,
} from '../../lib/appearance'
import { useEscapeKey } from '../../lib/utils'

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const { prefs, theme, updatePrefs, loadFont } = useAppearance()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  useEscapeKey(() => setOpen(false), open)

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
                onClick={() => setOpen(false)}
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
                className="appearance-popover fixed z-[61] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border"
                style={{ top: anchor.top, right: anchor.right }}
              >
                <div className="appearance-popover__header px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[var(--text-primary)]">Appearance</p>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--text-tertiary)]">
                        {theme.name} · {theme.blurb}
                      </p>
                    </div>
                    <span className="appearance-popover__icon">
                      <Palette size={13} />
                    </span>
                  </div>
                </div>

                <div className="max-h-[70vh] space-y-4 overflow-y-auto p-3">
                  <ThemeSection
                    activeId={prefs.themeId}
                    onPick={id => updatePrefs({ themeId: id })}
                  />
                  <FontSection
                    activeFamily={prefs.fontFamily}
                    onPick={family => updatePrefs({ fontFamily: family })}
                    loadFont={loadFont}
                  />
                  <SizeSection
                    value={prefs.fontSize}
                    onChange={v => updatePrefs({ fontSize: v })}
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
// Theme preview tiles
// ─────────────────────────────────────────────────────────────────────
function ThemeSection({
  activeId,
  onPick,
}: {
  activeId: string
  onPick: (id: string) => void
}) {
  return (
    <section>
      <SectionTitle label="Theme" />
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map(t => {
          const [sidebar, body, accent, accent2] = t.preview
          const isActive = activeId === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              className={`appearance-theme-tile ${isActive ? 'is-active' : ''}`}
              title={t.blurb}
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
                <div className="appearance-theme-tile__sidebar" />
                <div className="appearance-theme-tile__body">
                  <div
                    className="appearance-theme-tile__topbar"
                    style={{ background: `color-mix(in srgb, ${accent} 40%, transparent)` }}
                  />
                  <div className="appearance-theme-tile__row">
                    <div
                      className="appearance-theme-tile__chip"
                      style={{ background: accent }}
                    />
                    <div
                      className="appearance-theme-tile__chip"
                      style={{ background: accent2 }}
                    />
                    <div
                      className="appearance-theme-tile__chip"
                      style={{
                        background: `color-mix(in srgb, ${accent} 25%, transparent)`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="appearance-theme-tile__meta">
                <div
                  className="appearance-theme-tile__name"
                  style={{ fontFamily: `'${t.typography.headingFamily}', sans-serif` }}
                >
                  <span className="truncate">{t.name}</span>
                  {isActive && <Check size={11} className="shrink-0 text-[var(--accent)]" />}
                </div>
                <div className="appearance-theme-tile__blurb">{t.blurb}</div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Font dropdown
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

  // Close on outside click.
  useEffect(() => {
    if (!openList) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenList(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openList])

  // Preload preview fonts when the dropdown opens.
  useEffect(() => {
    if (!openList) return
    FONT_CATALOG.slice(0, 6).forEach(f => loadFont(f.family))
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
      <SectionTitle label="Font" icon />
      <button
        type="button"
        onClick={() => setOpenList(v => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
        style={
          activeFamily
            ? { fontFamily: `'${activeFamily}', sans-serif` }
            : undefined
        }
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
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <section>
      <SectionTitle label="Size" />
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
          onChange={e => onChange(Number(e.target.value))}
          className="appearance-slider mt-2"
        />
        <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          <span>{FONT_SIZE_MIN}px</span>
          <button
            type="button"
            onClick={() => onChange(FONT_SIZE_DEFAULT)}
            className="text-[9px] font-bold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Reset
          </button>
          <span>{FONT_SIZE_MAX}px</span>
        </div>
      </div>
    </section>
  )
}

function SectionTitle({ label, icon = false }: { label: string; icon?: boolean }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
      {icon && <Type size={10} />}
      {label}
    </p>
  )
}
