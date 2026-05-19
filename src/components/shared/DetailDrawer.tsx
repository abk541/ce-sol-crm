import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  width?: number
  showBackdrop?: boolean
  children: React.ReactNode
}

export default function DetailDrawer({ isOpen, onClose, title, subtitle, width = 480, showBackdrop = true, children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {showBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(15,23,42,0.18)', backdropFilter: 'blur(1px)' }}
              onClick={onClose}
            />
          )}

          {/* Panel */}
          <motion.div
            initial={{ x: width, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: width, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed right-4 top-20 bottom-4 z-50 flex flex-col detail-drawer overflow-hidden rounded-2xl"
            style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0 ml-3"
              >
                <X size={15} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Reusable field row inside a drawer
export function DrawerField({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0 ${className}`}>
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0 mt-0.5">{label}</span>
      <div className="text-right text-sm text-slate-700 font-medium max-w-[68%] break-words">{value ?? '-'}</div>
    </div>
  )
}

// Section header inside a drawer
export function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-black tracking-[0.18em] text-slate-400 uppercase mb-3">{title}</p>
      <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-1">
        {children}
      </div>
    </div>
  )
}
