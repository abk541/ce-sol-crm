import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  width?: number
  showBackdrop?: boolean
  placement?: 'side' | 'modal'
  variant?: 'default' | 'premium'
  children: React.ReactNode
}

export default function DetailDrawer({ isOpen, onClose, title, subtitle, width = 480, showBackdrop = true, placement = 'side', variant = 'default', children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const premium = variant === 'premium'
  const content = (
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
              style={{
                background: premium ? 'rgba(2,11,18,0.74)' : 'rgba(15,23,42,0.18)',
                backdropFilter: premium ? 'blur(5px)' : 'blur(1px)',
              }}
              onClick={onClose}
            />
          )}

          {/* Panel */}
          <motion.div
            initial={placement === 'modal' ? { opacity: 0, scale: 0.96 } : { x: width, opacity: 0 }}
            animate={placement === 'modal' ? { opacity: 1, scale: 1 } : { x: 0, opacity: 1 }}
            exit={placement === 'modal' ? { opacity: 0, scale: 0.96 } : { x: width, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className={[
              'fixed z-50 flex flex-col overflow-hidden',
              premium
                ? 'rounded-3xl border border-[#D7BE7A]/25 bg-[#07131F] shadow-[0_28px_90px_rgba(0,0,0,0.50),0_0_0_1px_rgba(255,255,255,0.04)]'
                : 'detail-drawer rounded-2xl',
              placement === 'modal'
                ? 'left-1/2 top-1/2 max-h-[calc(100vh-3rem)]'
                : 'right-4 top-20 bottom-4',
            ].join(' ')}
            style={{
              width: `min(${width}px, calc(100vw - 2rem))`,
              translate: placement === 'modal' ? '-50% -50%' : undefined,
            }}
          >
            {/* Header */}
            <div className={[
              'flex items-start justify-between flex-shrink-0',
              premium
                ? 'border-b border-[#D7BE7A]/15 bg-gradient-to-r from-[#0B1B2A] via-[#0A2327] to-[#102820] px-6 py-5'
                : 'px-6 py-5 border-b border-slate-100',
            ].join(' ')}>
              <div className="min-w-0 pr-4">
                {premium && <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#D7BE7A]">Opportunity Details</p>}
                <h2 className={[
                  'leading-tight break-words',
                  premium ? 'text-xl font-black tracking-tight text-[#F8FBF7]' : 'text-base font-bold text-slate-900',
                ].join(' ')} title={title}>{title}</h2>
                {subtitle && <p className={premium ? 'mt-1 truncate text-sm text-slate-300' : 'text-xs text-slate-500 mt-0.5'}>{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className={[
                  'flex-shrink-0 ml-3 flex items-center justify-center transition-all',
                  premium
                    ? 'h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:border-[#D7BE7A]/35 hover:bg-[#D7BE7A]/10 hover:text-white'
                    : 'w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100',
                ].join(' ')}
              >
                <X size={15} />
              </button>
            </div>

            {/* Content */}
            <div className={premium ? 'flex-1 overflow-y-auto px-6 py-5' : 'flex-1 overflow-y-auto px-6 py-5'}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}

// Reusable field row inside a drawer
export function DrawerField({ label, value, className = '', variant = 'default' }: { label: string; value: React.ReactNode; className?: string; variant?: 'default' | 'premium' }) {
  const premium = variant === 'premium'
  return (
    <div className={`flex items-start justify-between py-3 border-b last:border-0 ${premium ? 'border-[#D7BE7A]/15' : 'border-slate-50'} ${className}`}>
      <span className={`text-xs font-bold uppercase tracking-wide flex-shrink-0 mt-0.5 ${premium ? 'text-slate-400' : 'text-slate-400'}`}>{label}</span>
      <div className={`text-right text-sm font-bold max-w-[68%] break-words ${premium ? 'text-[#F8FBF7]' : 'text-slate-700'}`}>{value ?? '-'}</div>
    </div>
  )
}

// Section header inside a drawer
export function DrawerSection({ title, children, variant = 'default' }: { title: string; children: React.ReactNode; variant?: 'default' | 'premium' }) {
  const premium = variant === 'premium'
  return (
    <div className="mb-5">
      <p className={`text-[10px] font-black tracking-[0.18em] uppercase mb-3 ${premium ? 'text-[#D7BE7A]' : 'text-slate-400'}`}>{title}</p>
      <div className={`rounded-2xl border px-4 py-1 ${premium ? 'border-[#D7BE7A]/20 bg-[#06131F]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'bg-slate-50 border-slate-100'}`}>
        {children}
      </div>
    </div>
  )
}
