import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface Period { label: string; from: string; to: string }

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromYMD(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatDate(value: string): string {
  if (!value) return ''
  return fromYMD(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function rangeLabel(from: string, to: string): string {
  if (!from || !to) return 'Select dates'
  if (from === to) return formatDate(from)
  return `${formatDate(from)} - ${formatDate(to)}`
}

function calendarDays(viewDate: Date) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      value: toYMD(date),
      inMonth: date.getMonth() === month,
    }
  })
}

export function normalizePeriodDate(dateStr: string | undefined): string | null {
  const value = dateStr?.trim()
  if (!value) return null

  const yearFirst = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (yearFirst) {
    const [, year, month, day] = yearFirst
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashDate) {
    const [, first, second, year] = slashDate
    const firstNumber = Number(first)
    const secondNumber = Number(second)
    const month = firstNumber > 12 ? secondNumber : firstNumber
    const day = firstNumber > 12 ? firstNumber : secondNumber
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return toYMD(parsed)
}

export function filterByPeriod(dateStr: string | undefined, period: Period | null): boolean {
  if (!period) return true
  const d = normalizePeriodDate(dateStr)
  if (!d) return false
  return d >= period.from && d <= period.to
}

/** Keep records whose date range overlaps any part of the selected period. */
export function filterRangeByPeriod(
  startDate: string | undefined,
  endDate: string | undefined,
  period: Period | null,
): boolean {
  if (!period) return true
  const normalizedStart = normalizePeriodDate(startDate)
  const normalizedEnd = normalizePeriodDate(endDate)
  if (!normalizedStart && !normalizedEnd) return false
  const rangeStart = normalizedStart ?? normalizedEnd!
  const rangeEnd = normalizedEnd ?? normalizedStart!
  const from = rangeStart <= rangeEnd ? rangeStart : rangeEnd
  const to = rangeStart <= rangeEnd ? rangeEnd : rangeStart
  return from <= period.to && to >= period.from
}

export default function PeriodFilter({
  value,
  onChange,
  placeholder = 'Period',
}: {
  value: Period | null
  onChange: (p: Period | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [viewDate, setViewDate] = useState(() => value?.from ? fromYMD(value.from) : new Date())
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })

  const days = useMemo(() => calendarDays(viewDate), [viewDate])
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = toYMD(new Date())
  const isActive = !!value

  useEffect(() => {
    if (!open) return
    setDraftFrom(value?.from ?? '')
    setDraftTo(value?.to ?? '')
    setViewDate(value?.from ? fromYMD(value.from) : new Date())
  }, [open, value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!open || !ref.current) return
    const update = () => {
      const rect = ref.current!.getBoundingClientRect()
      const width = 320
      const estimatedHeight = 420
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))
      const top = Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 8)
      setPanelPos({ top: Math.max(12, top), left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  const changeMonth = (delta: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const clear = () => {
    setDraftFrom('')
    setDraftTo('')
    onChange(null)
  }

  const selectDay = (day: string) => {
    if (!draftFrom || draftTo) {
      setDraftFrom(day)
      setDraftTo('')
      return
    }

    const from = day < draftFrom ? day : draftFrom
    const to = day < draftFrom ? draftFrom : day
    setDraftFrom(from)
    setDraftTo(to)
    onChange({ label: rangeLabel(from, to), from, to })
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex w-full items-center rounded-xl border transition-all"
        style={isActive
          ? { background: 'rgba(184,145,78,0.18)', color: '#F8FBF7', borderColor: '#D7BE7A' }
          : { background: 'rgba(255,255,255,0.065)', color: '#C7D7D3', borderColor: 'rgba(215,190,122,0.22)' }}
      >
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex flex-1 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
        >
          <Calendar size={12} />
          <span>{isActive ? value!.label : placeholder}</span>
          {!isActive && <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
        {isActive && (
          <button
            type="button"
            onClick={clear}
            className="mr-2 flex h-5 w-5 items-center justify-center rounded-md text-[#D7BE7A] hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Clear date range"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {createPortal((
        <AnimatePresence>
          {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="modal-panel fixed z-[9999] w-[320px] rounded-2xl border p-4 shadow-xl"
            style={{ top: panelPos.top, left: panelPos.left, background: 'var(--bg-modal)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-white/10 hover:text-stone-100 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <div className="text-sm font-bold text-stone-100">{monthLabel}</div>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-white/10 hover:text-stone-100 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={`${d}-${i}`} className="h-7 flex items-center justify-center text-[10px] font-bold text-stone-500">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                const isStart = draftFrom === day.value
                const isEnd = draftTo === day.value
                const inRange = !!draftFrom && !!draftTo && day.value >= draftFrom && day.value <= draftTo
                const isEdge = isStart || isEnd
                const isToday = day.value === today
                return (
                  <button
                    type="button"
                    key={day.value}
                    onClick={() => selectDay(day.value)}
                    className={`h-9 rounded-lg text-xs font-semibold transition-all ${
                      isEdge
                        ? 'bg-[#0F4F59] text-white shadow-sm'
                        : inRange
                          ? 'bg-[#D7BE7A]/20 text-[#F8FBF7]'
                          : day.inMonth
                            ? 'text-stone-200 hover:bg-white/10'
                            : 'text-stone-600 hover:bg-white/5'
                    } ${isToday && !isEdge ? 'ring-1 ring-[#D7BE7A]' : ''}`}
                  >
                    {day.date.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border-default)' }}>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Selected range</p>
                <p className="truncate text-xs font-semibold text-stone-200">
                  {draftFrom && draftTo ? rangeLabel(draftFrom, draftTo) : draftFrom ? `${formatDate(draftFrom)} - choose end date` : 'All dates'}
                </p>
              </div>
              <button
                type="button"
                onClick={clear}
                className="flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold text-stone-400 hover:bg-white/10 hover:text-stone-100 transition-colors"
                style={{ borderColor: 'var(--border-default)' }}
              >
                Clear
              </button>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      ), document.body)}
    </div>
  )
}

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
    <div className={`flex gap-0.5 p-0.5 rounded-xl border ${className}`} style={{ background: 'rgba(255,255,255,0.045)', borderColor: 'rgba(215,190,122,0.16)' }}>
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            value === p
              ? 'text-white shadow-sm border border-[#D7BE7A]/40 bg-[#B8914E]/20'
              : 'text-stone-400 hover:text-stone-100 hover:bg-white/10'
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
    '7D': 7 * 86400000,
    '30D': 30 * 86400000,
    '3M': 90 * 86400000,
    '6M': 180 * 86400000,
    '1Y': 365 * 86400000,
  }
  const cutoff = now - ms[period as Exclude<PeriodPill, 'ALL'>]
  return items.filter(item => {
    const raw = item[dateKey] as string | undefined
    const normalized = normalizePeriodDate(raw)
    if (!normalized) return false
    return new Date(`${normalized}T00:00:00`).getTime() >= cutoff
  })
}

export function sliceTrendByPeriod<T>(data: T[], period: PeriodPill): T[] {
  const counts: Record<PeriodPill, number> = { '7D': 1, '30D': 2, '3M': 3, '6M': 6, '1Y': 10, 'ALL': 10 }
  return data.slice(-counts[period])
}
