import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Calendar, X } from 'lucide-react'

// ── New dropdown-style Period interface ───────────────────────────────
export interface Period { label: string; from: string; to: string }

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getPresets(): { label: string; from: string; to: string }[] {
  const now = new Date()
  const today = toYMD(now)

  // This week Mon–Sun
  const day = now.getDay() // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Last 30 days
  const l30 = new Date(now); l30.setDate(now.getDate() - 30)

  // Last quarter (previous 3 months)
  const lqEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const lqStart = new Date(lqEnd.getFullYear(), lqEnd.getMonth() - 2, 1)

  // This year
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd   = new Date(now.getFullYear(), 11, 31)

  return [
    { label: 'Today',        from: today,           to: today },
    { label: 'This Week',    from: toYMD(mon),       to: toYMD(sun) },
    { label: 'This Month',   from: toYMD(monthStart),to: toYMD(monthEnd) },
    { label: 'Last 30 Days', from: toYMD(l30),       to: today },
    { label: 'Last Quarter', from: toYMD(lqStart),   to: toYMD(lqEnd) },
    { label: 'This Year',    from: toYMD(yearStart),  to: toYMD(yearEnd) },
  ]
}

export function filterByPeriod(dateStr: string | undefined, period: Period | null): boolean {
  if (!period) return true
  if (!dateStr) return true
  const d = dateStr.slice(0, 10)
  return d >= period.from && d <= period.to
}

export default function PeriodFilter({
  value,
  onChange,
}: {
  value: Period | null
  onChange: (p: Period | null) => void
}) {
  const [open, setOpen]         = useState(false)
  const [custom, setCustom]     = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const presets = getPresets()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCustom(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const select = (p: Period | null) => {
    onChange(p)
    setOpen(false)
    setCustom(false)
  }

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    select({ label: `${customFrom} – ${customTo}`, from: customFrom, to: customTo })
  }

  const isActive = !!value

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
        style={isActive
          ? { background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE' }
          : { background: '#FFFFFF', color: '#475569', borderColor: '#E2E8F0' }}
      >
        <Calendar size={12} />
        {isActive ? value!.label : 'Period'}
        {isActive
          ? <button
              onMouseDown={e => { e.stopPropagation(); onChange(null) }}
              className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
              tabIndex={-1}
            ><X size={10} /></button>
          : <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="absolute right-0 top-9 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 min-w-[200px]"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
          >
            {/* All Time */}
            <button
              onClick={() => select(null)}
              className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              All Time
            </button>
            <div className="my-1 border-t border-slate-100" />

            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => select(p)}
                className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${
                  value?.label === p.label
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}

            <div className="my-1 border-t border-slate-100" />

            {/* Custom Range */}
            <button
              onClick={() => setCustom(v => !v)}
              className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <Calendar size={11} /> Custom Range
              <ChevronDown size={10} className={`ml-auto transition-transform ${custom ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {custom && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">From</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">To</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <button
                      disabled={!customFrom || !customTo}
                      onClick={applyCustom}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-40"
                    >
                      Apply
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Backward-compat exports used by DashboardPage ─────────────────────
export const PERIODS = ['7D', '30D', '3M', '6M', '1Y', 'ALL'] as const
export type PeriodPill = typeof PERIODS[number]

export function PeriodFilterPills({
  value,
  onChange,
  className = '',
}: {
  value: PeriodPill
  onChange: (p: PeriodPill) => void
  className?: string
}) {
  return (
    <div className={`flex gap-0.5 p-0.5 bg-slate-100 rounded-xl border border-slate-200 ${className}`}>
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            value === p
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

export function filterByPeriodLegacy<T extends { createdAt?: string; submittedAt?: string; dueDate?: string }>(
  items: T[],
  period: PeriodPill,
  dateKey: keyof T = 'dueDate' as keyof T,
): T[] {
  if (period === 'ALL') return items
  const now = Date.now()
  const ms: Record<Exclude<PeriodPill, 'ALL'>, number> = {
    '7D':  7  * 86400000,
    '30D': 30 * 86400000,
    '3M':  90 * 86400000,
    '6M':  180 * 86400000,
    '1Y':  365 * 86400000,
  }
  const cutoff = now - ms[period as Exclude<PeriodPill, 'ALL'>]
  return items.filter(item => {
    const raw = item[dateKey] as string | undefined
    if (!raw) return true
    return new Date(raw).getTime() >= cutoff
  })
}

export function sliceTrendByPeriod<T>(data: T[], period: PeriodPill): T[] {
  const counts: Record<PeriodPill, number> = { '7D': 1, '30D': 2, '3M': 3, '6M': 6, '1Y': 10, 'ALL': 10 }
  return data.slice(-counts[period])
}
