import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

type FloatingPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

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
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width,
    maxHeight: 360,
    placement: 'bottom',
  })

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      const margin = 8
      const gap = 6
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const menuWidth = Math.min(width, Math.max(160, viewportWidth - margin * 2))
      const left = Math.min(Math.max(margin, rect.right - menuWidth), viewportWidth - menuWidth - margin)
      const desiredHeight = Math.min(menuRef.current?.scrollHeight ?? 360, 360, viewportHeight - margin * 2)
      const spaceBelow = viewportHeight - rect.bottom - margin - gap
      const spaceAbove = rect.top - margin - gap
      const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow
      const availableHeight = Math.max(96, openUp ? spaceAbove : spaceBelow)
      const maxHeight = Math.min(desiredHeight, availableHeight)
      const top = openUp
        ? Math.max(margin, rect.top - maxHeight - gap)
        : Math.min(rect.bottom + gap, viewportHeight - maxHeight - margin)

      setPosition({
        top,
        left,
        width: menuWidth,
        maxHeight,
        placement: openUp ? 'top' : 'bottom',
      })
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
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.96, y: position.placement === 'top' ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: position.placement === 'top' ? 4 : -4 }}
                transition={{ duration: 0.12 }}
                className={`fixed z-[80] rounded-xl py-1 ${menuClassName}`}
                style={{
                  top: position.top,
                  left: position.left,
                  width: position.width,
                  maxHeight: position.maxHeight,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
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
