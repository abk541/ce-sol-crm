import { AnimatePresence, motion } from 'framer-motion'
import { Check, LayoutGrid, Palette, Sparkles, Type } from 'lucide-react'
import {
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  THEME_OPTIONS,
  useAppearance,
  type FontId,
  type FontSizeId,
  type ThemeId,
} from '../../lib/appearance'
import { useEscapeKey } from '../../lib/utils'
import { useState } from 'react'

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const { prefs, updatePrefs } = useAppearance()

  useEscapeKey(() => setOpen(false), open)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="appearance-trigger relative flex h-9 w-9 items-center justify-center rounded-xl text-stone-300 transition-all hover:text-white"
        aria-label="Open appearance controls"
        aria-expanded={open}
      >
        <Palette size={16} />
        <span className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              key="appearance-popover"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="appearance-popover absolute right-0 top-11 z-50 w-[min(27rem,calc(100vw-2rem))] overflow-hidden rounded-[1.35rem] border shadow-2xl"
            >
              <div className="appearance-popover__header px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="appearance-popover__icon">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-[var(--text-primary)]">Appearance Studio</p>
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                      Switch the whole interface mood, font and reading size.
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-[72vh] overflow-y-auto p-3">
                <section>
                  <SectionTitle icon={LayoutGrid} label="Themes" />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {THEME_OPTIONS.map(theme => (
                      <ThemeChoice
                        key={theme.id}
                        theme={theme}
                        active={prefs.theme === theme.id}
                        onClick={() => updatePrefs({ theme: theme.id })}
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-4">
                  <SectionTitle icon={Type} label="Font" />
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_OPTIONS.map(font => (
                      <SegmentChoice
                        key={font.id}
                        active={prefs.font === font.id}
                        label={font.name}
                        description={font.description}
                        onClick={() => updatePrefs({ font: font.id as FontId })}
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-4">
                  <SectionTitle icon={Sparkles} label="Text Size" />
                  <div className="grid grid-cols-3 gap-2">
                    {FONT_SIZE_OPTIONS.map(size => (
                      <SegmentChoice
                        key={size.id}
                        active={prefs.size === size.id}
                        label={size.name}
                        description={size.description}
                        onClick={() => updatePrefs({ size: size.id as FontSizeId })}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Palette; label: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
      <Icon size={12} />
      {label}
    </p>
  )
}

function ThemeChoice({
  theme,
  active,
  onClick,
}: {
  theme: (typeof THEME_OPTIONS)[number]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`appearance-theme-choice ${active ? 'is-active' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex gap-1.5">
          {theme.colors.map(color => (
            <span key={color} className="h-5 w-5 rounded-full border border-white/20" style={{ background: color }} />
          ))}
        </div>
        {active && (
          <span className="appearance-check">
            <Check size={12} />
          </span>
        )}
      </div>
      <p className="text-left text-xs font-black text-[var(--text-primary)]">{theme.name}</p>
      <p className="mt-1 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">{theme.mood}</p>
      <p className="mt-1 text-left text-[11px] leading-4 text-[var(--text-tertiary)]">{theme.description}</p>
    </button>
  )
}

function SegmentChoice({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`appearance-segment ${active ? 'is-active' : ''}`}
    >
      <span className="block text-xs font-black text-[var(--text-primary)]">{label}</span>
      <span className="mt-1 block text-[10px] leading-4 text-[var(--text-tertiary)]">{description}</span>
    </button>
  )
}
