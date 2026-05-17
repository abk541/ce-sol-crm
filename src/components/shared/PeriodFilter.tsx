export const PERIODS = ['7D', '30D', '3M', '6M', '1Y', 'ALL'] as const
export type Period = typeof PERIODS[number]

interface Props {
  value: Period
  onChange: (p: Period) => void
  className?: string
}

export default function PeriodFilter({ value, onChange, className = '' }: Props) {
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

export function filterByPeriod<T extends { createdAt?: string; submittedAt?: string; dueDate?: string }>(
  items: T[],
  period: Period,
  dateKey: keyof T = 'dueDate' as keyof T,
): T[] {
  if (period === 'ALL') return items
  const now = Date.now()
  const ms: Record<Exclude<Period, 'ALL'>, number> = {
    '7D':  7  * 86400000,
    '30D': 30 * 86400000,
    '3M':  90 * 86400000,
    '6M':  180 * 86400000,
    '1Y':  365 * 86400000,
  }
  const cutoff = now - ms[period as Exclude<Period, 'ALL'>]
  return items.filter(item => {
    const raw = item[dateKey] as string | undefined
    if (!raw) return true
    return new Date(raw).getTime() >= cutoff
  })
}

export function sliceTrendByPeriod<T>(data: T[], period: Period): T[] {
  const counts: Record<Period, number> = { '7D': 1, '30D': 2, '3M': 3, '6M': 6, '1Y': 10, 'ALL': 10 }
  return data.slice(-counts[period])
}
