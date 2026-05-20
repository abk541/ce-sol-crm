import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

type FloatingActionMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  title?: string
  triggerClassName?: string
  menuClassName?: string
  width?: number
  children: ReactNode
}

export default function FloatingActionMenu({
  open,
  onOpenChange,
  trigger,
  title = 'More actions',
  triggerClassName = 'w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors',
  menuClassName = '',
  width = 176,
  children,
}: FloatingActionMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      const margin = 8
      const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin)
      const top = Math.min(rect.bottom + 6, window.innerHeight - margin)
      setPosition({ top, left })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, width])

  return (
    <>
      <button
        ref={triggerRef}
        title={title}
        onClick={e => {
          e.stopPropagation()
          onOpenChange(!open)
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => onOpenChange(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.12 }}
                className={`fixed z-[80] rounded-xl py-1 ${menuClassName}`}
                style={{
                  top: position.top,
                  left: position.left,
                  width,
                  maxHeight: 'min(360px, calc(100vh - 16px))',
                  overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  boxShadow: '0 18px 42px rgba(0,0,0,0.24)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {children}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
