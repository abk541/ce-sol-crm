import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Filter, MoreHorizontal, Search, TrendingUp } from 'lucide-react'
import type { BDSubmission } from '../types'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import { getAssignmentChain } from '../lib/team'
import { formatCurrency } from '../lib/utils'

type BDTab = BDSubmission['status']

const BD_TABS: { key: BDTab; label: string }[] = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'DISCUSSING', label: 'Discussion' },
  { key: 'AWARDED', label: 'Awarded' },
  { key: 'LOST', label: 'Lost' },
  { key: 'CANCELED', label: 'Canceled' },
  { key: 'DROPPED', label: 'Dropped' },
  { key: 'NOT_SUBMITTED', label: 'Not Submitted' },
]

const STATUS_META: Record<BDTab, { color: string; bg: string; border: string }> = {
  SUBMITTED: { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  DISCUSSING: { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  AWARDED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  LOST: { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  CANCELED: { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  DROPPED: { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  NOT_SUBMITTED: { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 'All'] as const
type PerPageOption = typeof PER_PAGE_OPTIONS[number]

const FILTERS = [
  { key: 'setAside', label: 'Set Aside', placeholder: 'Any set aside' },
  { key: 'type', label: 'Type', placeholder: 'Any type' },
  { key: 'location', label: 'Location', placeholder: 'Any location' },
  { key: 'manager', label: 'Manager', placeholder: 'Any manager' },
  { key: 'teamLead', label: 'Team Lead', placeholder: 'Any team lead' },
  { key: 'associate', label: 'Associate', placeholder: 'Any associate' },
] as const

type FilterKey = typeof FILTERS[number]['key']
type Filters = Record<FilterKey, string>
const EMPTY_FILTERS: Filters = FILTERS.reduce((acc, filter) => ({ ...acc, [filter.key]: '' }), {} as Filters)

function typeLabel(value: string) {
  return value === 'S&D' ? 'Delivery' : value
}

function rowOpportunity(row: BDSubmission, opportunities: ReturnType<typeof useStore.getState>['opportunities']) {
  return opportunities.find(o => o.solicitationId === row.solicitationId)
}

function filterValue(
  row: BDSubmission,
  key: FilterKey,
  opportunities: ReturnType<typeof useStore.getState>['opportunities'],
  employees: ReturnType<typeof useStore.getState>['employees'],
) {
  const opp = rowOpportunity(row, opportunities)
  const chain = getAssignmentChain(employees, opp?.assignedTo)
  if (key === 'type') return typeLabel(row.type)
  if (key === 'manager') return chain.manager?.name ?? ''
  if (key === 'teamLead') return chain.teamLead?.name ?? ''
  if (key === 'associate') return chain.associate?.name ?? row.supportAgent ?? ''
  return String(row[key] ?? '')
}

function FilterInput({
  id,
  label,
  value,
  placeholder,
  suggestions,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  suggestions: string[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <input value={value} list={id} onChange={e => onChange(e.target.value)} className="input-field w-full py-1.5 text-xs" placeholder={placeholder} />
      <datalist id={id}>
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

export default function BDTrackerPage() {
  const { bdSubmissions, updateBDSubmission, opportunities, employees } = useStore()
  const [tab, setTab] = useState<BDTab>('SUBMITTED')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS }))
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)

  const filterOptions = useMemo(() => {
    return FILTERS.reduce((acc, filter) => {
      const values = bdSubmissions
        .map(row => filterValue(row, filter.key, opportunities, employees).trim())
        .filter(Boolean)
      acc[filter.key] = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
      return acc
    }, {} as Record<FilterKey, string[]>)
  }, [bdSubmissions, opportunities, employees])

  const filtered = useMemo(() => {
    let list = bdSubmissions.filter(s => s.status === tab)
    if (period) list = list.filter(s => filterByPeriod(s.dueDate || s.submittedOn, period))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s =>
        s.solicitation.toLowerCase().includes(q) ||
        s.solicitationId.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q)
      )
    }
    FILTERS.forEach(filter => {
      const q = filters[filter.key].trim().toLowerCase()
      if (!q) return
      list = list.filter(s => filterValue(s, filter.key, opportunities, employees).toLowerCase().includes(q))
    })
    return list
  }, [bdSubmissions, tab, period, search, filters, opportunities, employees])

  const totalRows = filtered.length
  const perPageNum = perPage === 'All' ? totalRows || 1 : (perPage as number)
  const totalPages = perPage === 'All' ? 1 : Math.max(1, Math.ceil(totalRows / perPageNum))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * perPageNum
  const pageRows = perPage === 'All' ? filtered : filtered.slice(pageStart, pageStart + perPageNum)

  const stats = {
    submitted: bdSubmissions.filter(s => s.status === 'SUBMITTED').length,
    discussion: bdSubmissions.filter(s => s.status === 'DISCUSSING').length,
    awarded: bdSubmissions.filter(s => s.status === 'AWARDED').length,
    dropped: bdSubmissions.filter(s => s.status === 'DROPPED').length,
  }

  const clearFilters = () => {
    setSearch('')
    setFilters({ ...EMPTY_FILTERS })
    setPeriod(null)
    setPage(1)
  }

  return (
    <div className="p-6 page-enter space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-bold tracking-[0.2em] text-slate-400">CES - BUSINESS DEV</p>
          <h1 className="flex items-center gap-3 text-2xl font-black text-slate-900">
            <TrendingUp size={22} className="text-indigo-500" /> BD Tracker
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Submitted opportunities and outcomes</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Submitted', value: stats.submitted, meta: STATUS_META.SUBMITTED },
          { label: 'Discussion', value: stats.discussion, meta: STATUS_META.DISCUSSING },
          { label: 'Awarded', value: stats.awarded, meta: STATUS_META.AWARDED },
          { label: 'Dropped', value: stats.dropped, meta: STATUS_META.DROPPED },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border p-4 text-center" style={{ background: card.meta.bg, borderColor: card.meta.border }}>
            <p className="text-2xl font-black" style={{ color: card.meta.color }}>{card.value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input-field w-full pl-9 text-xs" placeholder="Search opportunity, ID, or location..." />
          </div>
          <div className="w-full sm:w-64">
            <PeriodFilter value={period} onChange={value => { setPeriod(value); setPage(1) }} placeholder="All due dates" />
          </div>
          <button onClick={clearFilters} className="btn-secondary text-xs">Clear</button>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {FILTERS.map(filter => (
            <FilterInput
              key={filter.key}
              id={`bd-filter-${filter.key}`}
              label={filter.label}
              value={filters[filter.key]}
              placeholder={filter.placeholder}
              suggestions={filterOptions[filter.key] ?? []}
              onChange={value => {
                setFilters(prev => ({ ...prev, [filter.key]: value }))
                setPage(1)
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {BD_TABS.map(t => {
            const cnt = bdSubmissions.filter(s => s.status === t.key).length
            const meta = STATUS_META[t.key]
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1) }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  tab === t.key ? 'border border-slate-200 bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {tab === t.key && <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />}
                {t.label}
                {cnt > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black" style={tab === t.key ? { background: meta.color, color: '#fff' } : { background: '#E2E8F0', color: '#64748B' }}>{cnt}</span>}
              </button>
            )
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Filter size={12} className="text-slate-400" />
            <p className="text-xs font-semibold text-slate-500">{filtered.length} results</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Submitted On</th>
                  <th>ID</th>
                  <th>Solicitation</th>
                  <th>Set Aside</th>
                  <th>Type</th>
                  <th>Due Date</th>
                  <th>Location</th>
                  <th>Manager</th>
                  <th>Team Lead</th>
                  <th>Associate</th>
                  <th>Value</th>
                  <th>Comment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr><td colSpan={13} className="py-12 text-center text-sm text-slate-400">No opportunities in this category.</td></tr>
                )}
                {pageRows.map((s, i) => {
                  const meta = STATUS_META[s.status]
                  const opp = rowOpportunity(s, opportunities)
                  const chain = getAssignmentChain(employees, opp?.assignedTo)
                  return (
                    <motion.tr key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                      <td className="text-xs text-slate-600">{s.submittedOn}</td>
                      <td className="font-mono text-xs font-semibold text-indigo-600">{s.solicitationId}</td>
                      <td className="max-w-[240px]"><p className="truncate text-xs font-medium text-slate-800">{s.solicitation}</p></td>
                      <td><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{s.setAside}</span></td>
                      <td><span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">{typeLabel(s.type)}</span></td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{s.dueDate}</td>
                      <td className="max-w-[120px] text-xs text-slate-500"><p className="truncate">{s.location}</p></td>
                      <td className="text-xs text-slate-600">{chain.manager?.name ?? '-'}</td>
                      <td className="text-xs text-slate-600">{chain.teamLead?.name ?? '-'}</td>
                      <td className="text-xs text-slate-600">{chain.associate?.name ?? s.supportAgent ?? '-'}</td>
                      <td className="whitespace-nowrap text-xs font-semibold text-emerald-600">{formatCurrency(s.value)}</td>
                      <td className="max-w-[140px] text-xs text-slate-400"><p className="truncate">{s.comment ?? '-'}</p></td>
                      <td className="relative">
                        <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === String(s.id) ? null : String(s.id)) }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                          <MoreHorizontal size={14} />
                        </button>
                        <AnimatePresence>
                          {menuOpen === String(s.id) && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                                <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Move to</p>
                                {BD_TABS.filter(t => t.key !== s.status).map(t => {
                                  const itemMeta = STATUS_META[t.key]
                                  return (
                                    <button key={t.key} onClick={() => {
                                      updateBDSubmission(s.id, t.key)
                                      toast.success(`Moved to ${t.label}`)
                                      setMenuOpen(null)
                                    }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                                      <span className="h-2 w-2 rounded-full" style={{ background: itemMeta.color }} />
                                      {t.label}
                                    </button>
                                  )
                                })}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Rows per page:</span>
              {PER_PAGE_OPTIONS.map(opt => (
                <button key={String(opt)} onClick={() => { setPerPage(opt); setPage(1) }}
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${perPage === opt ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {opt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {totalRows === 0 ? '0 rows' : `${pageStart + 1}-${Math.min(pageStart + pageRows.length, totalRows)} of ${totalRows} rows`}
              <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-lg px-2 py-1 hover:bg-slate-100 disabled:opacity-30">Prev</button>
              <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded-lg px-2 py-1 hover:bg-slate-100 disabled:opacity-30">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
