import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings, Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useEscapeKey } from '../../lib/utils'
import { playNotificationDing } from '../../lib/sound'

export default function PreferencesMenu() {
  const [open, setOpen] = useState(false)
  const prefs = useStore(s => s.prefs)
  const setPref = useStore(s => s.setPref)

  useEscapeKey(() => setOpen(false), open)

  const toggleSound = () => {
    const next = !prefs.notificationSound
    setPref('notificationSound', next)
    if (next) playNotificationDing()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-stone-300 transition-all hover:bg-white/10 hover:text-white"
        aria-label="Open preferences"
        aria-expanded={open}
      >
        <Settings size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              key="prefs-popover"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl"
              style={{
                background: 'var(--exec-panel)',
                borderColor: 'var(--exec-border-strong)',
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
                <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Preferences</p>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Customize your workspace.</p>
              </div>

              <div className="space-y-4 px-3 py-3">
                <section>
                  <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                    Notifications
                  </p>
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:bg-white/5"
                    style={{ borderColor: 'transparent' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-xl border"
                        style={{
                          color: prefs.notificationSound ? 'var(--accent)' : 'var(--text-tertiary)',
                          background: 'var(--exec-panel-soft)',
                          borderColor: 'var(--border-default)',
                        }}
                      >
                        {prefs.notificationSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                      </div>
                      <div>
                        <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Notification sound</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {prefs.notificationSound ? 'Soft chime on new alerts.' : 'Silent - no sound on alerts.'}
                        </p>
                      </div>
                    </div>
                    <Toggle on={prefs.notificationSound} />
                  </button>
                </section>

                <section>
                  <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                    Appearance
                  </p>
                  <p className="px-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    Use the palette button next to Settings to change themes, font and text size.
                  </p>
                </section>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
      style={{
        background: on ? 'color-mix(in srgb, var(--accent) 85%, transparent)' : 'rgba(148,163,184,0.35)',
        boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'inset 0 0 0 1px rgba(148,163,184,0.4)',
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </span>
  )
}
