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
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-stone-300 transition-all hover:text-white hover:bg-white/10"
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
                background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(7,19,31,0.98))',
                borderColor: 'rgba(215,190,122,0.24)',
                boxShadow: '0 24px 70px rgba(0,0,0,0.44)',
              }}
            >
              <div className="border-b border-[#D7BE7A]/15 px-4 py-3">
                <p className="text-sm font-black text-slate-100">Preferences</p>
                <p className="text-[11px] text-slate-400">Customize your workspace.</p>
              </div>

              <div className="px-3 py-3 space-y-4">
                <section>
                  <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Notifications
                  </p>
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-[#D7BE7A]/25 hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-xl border"
                        style={{
                          color: prefs.notificationSound ? '#D7BE7A' : '#94A3B8',
                          background: 'rgba(255,255,255,0.055)',
                          borderColor: 'rgba(215,190,122,0.18)',
                        }}
                      >
                        {prefs.notificationSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-100">Notification sound</p>
                        <p className="text-[11px] text-slate-400">
                          {prefs.notificationSound ? 'Soft chime on new alerts.' : 'Silent — no sound on alerts.'}
                        </p>
                      </div>
                    </div>
                    <Toggle on={prefs.notificationSound} />
                  </button>
                </section>

                <section>
                  <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Coming soon
                  </p>
                  <ul className="space-y-1.5 px-1 text-[11px] text-slate-500">
                    <li>• Theme &amp; accent color</li>
                    <li>• Font &amp; font size</li>
                    <li>• Density &amp; layout</li>
                  </ul>
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
        background: on ? 'rgba(215,190,122,0.85)' : 'rgba(148,163,184,0.35)',
        boxShadow: on ? 'inset 0 0 0 1px rgba(215,190,122,0.6)' : 'inset 0 0 0 1px rgba(148,163,184,0.4)',
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </span>
  )
}
