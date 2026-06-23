import { AnimatePresence, motion } from 'framer-motion'
import { Check, Palette, Type } from 'lucide-react'
import { useState } from 'react'
import {
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  THEME_OPTIONS,
  useAppearance,
} from '../../lib/appearance'
import { useEscapeKey } from '../../lib/utils'

const THEME_SHORT_LABELS = {
  aurora: 'Classic',
  prism: 'Neon',
  noir: 'Noir',
  daylight: 'Light',
} as const

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const { prefs, updatePrefs } = useAppearance()

  useEscapeKey(() => setOpen(false), open)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="appearance-trigger"
        aria-label="Open appearance controls"
        aria-expanded={open}
        title="Style"
      >
        <Palette size={15} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <motion.div
              key="appearance-popover"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="appearance-popover absolute right-0 top-11 z-50 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl"
            >
              <div className="appearance-popover__header px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-[var(--text-primary)]">Style</p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">Theme, type and scale.</p>
                  </div>
                  <span className="appearance-popover__icon">
                    <Palette size={13} />
                  </span>
                </div>
              </div>

              <div className="space-y-3 p-3">
                <section>
                  <SectionTitle label="Theme" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {THEME_OPTIONS.map(theme => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => updatePrefs({ theme: theme.id })}
                        className={`appearance-theme-chip ${prefs.theme === theme.id ? 'is-active' : ''}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="appearance-swatch" style={{ background: `linear-gradient(135deg, ${theme.colors.join(',')})` }} />
                          <span className="truncate">{THEME_SHORT_LABELS[theme.id]}</span>
                        </span>
                        {prefs.theme === theme.id && <Check size={11} />}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle label="Font" icon />
                  <div className="appearance-pill-row">
                    {FONT_OPTIONS.map(font => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => updatePrefs({ font: font.id })}
                        className={`appearance-pill ${prefs.font === font.id ? 'is-active' : ''}`}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle label="Size" />
                  <div className="appearance-pill-row three">
                    {FONT_SIZE_OPTIONS.map(size => (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => updatePrefs({ size: size.id })}
                        className={`appearance-pill ${prefs.size === size.id ? 'is-active' : ''}`}
                      >
                        {size.name}
                      </button>
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

function SectionTitle({ label, icon = false }: { label: string; icon?: boolean }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
      {icon && <Type size={10} />}
      {label}
    </p>
  )
}
