import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TEAM_STATS } from '../data/mock'
import { TrendingUp, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import type { BDSubmission } from '../types'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'

type BDTab = 'SUBMITTED' | 'DISCUSSING' | 'AWARDED' | 'LOST' | 'CANCELED' | 'NOT_SUBMITTED'

const BD_TABS: { key: BDTab; label: string }[] = [
  { key: 'SUBMITTED',     label: 'Submitted' },
  { key: 'DISCUSSING',    label: 'Discussing' },
  { key: 'AWARDED',       label: 'Awarded' },
  { key: 'LOST',          label: 'Lost' },
  { key: 'CANCELED',      label: 'Canceled' },
  { key: 'NOT_SUBMITTED', label: 'Not Submitted' },
]

const STATUS_META: Record<BDTab, { color: string; bg: string; border: string }> = {
  SUBMITTED:     { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  DISCUSSING:    { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  AWARDED:       { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  LOST:          { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  CANCELED:      { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  NOT_SUBMITTED: { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 'All'] as const
type PerPageOption = typeof PER_PAGE_OPTIONS[number]

function CircleProgress({ value, color }: { value: number; color: string }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#E2E8F0" strokeWidth="4" />
      <motion.circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fill={color} fontSize="10" fontWeight="700">{value}%</text>
    </svg>
  )
}

export default function BDTrackerPage() {
  const { bdSubmissions, updateBDSubmission } = useStore()
  const [tab, setTab] = useState<BDTab>('SUBMITTED')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)

  const filtered = useMemo(() => {
    let list = bdSubmissions.filter(s => s.status === tab)
    if (periodFrom && periodTo) {
      const from = new Date(periodFrom)
      const to = new Date(periodTo)
      list = list.filter(s => {
        const d = new Date(s.submittedOn)
        return d >= from && d <= to
      })
    }
    return list
  }, [bdSubmissions, tab, periodFrom, periodTo])

  const totalRows = filtered.length
  const perPageNum = perPage === 'All' ? totalRows : (perPage as number)
  const totalPages = perPage === 'All' ? 1 : Math.max(1, Math.ceil(totalRows / perPageNum))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * perPageNum
  const pageEnd = perPage === 'All' ? totalRows : Math.min(pageStart + perPageNum, totalRows)
  const pageRows = filtered.slice(pageStart, pageEnd)

  const stats = {
    totalUsers: TEAM_STATS.length,
    submissions: bdSubmissions.filter(s => s.status === 'SUBMITTED').length,
    nonSubs: bdSubmissions.filter(s => s.status === 'NOT_SUBMITTED').length,
  }

  return (
    <div className="p-6 page-enter space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · BUSINESS DEV</p>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <TrendingUp size={22} className="text-indigo-500" /> BD Tracker
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Apr 04 – May 03, 2026</p>
      </div>

      {/* Team stats panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-800">BD Team Statistics</h2>
          <span className="text-xs text-slate-400 ml-1">(Apr 04 – May 03)</span>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Users',     value: stats.totalUsers,  color: '#4338CA', bg: '#EEF2FF' },
            { label: 'Submissions',     value: stats.submissions, color: '#15803D', bg: '#DCFCE7' },
            { label: 'Non-Submissions', value: stats.nonSubs,     color: '#DC2626', bg: '#FEE2E2' },
          ].map(s => (
            <div key={s.label} className="text-center p-4 rounded-xl border"
              style={{ background: s.bg, borderColor: s.color + '40' }}>
              <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Per-agent cards */}
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Team Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {TEAM_STATS.map((agent, i) => {
            const color = '#6366F1'
            return (
              <motion.div key={agent.user}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rounded-xl p-4 bg-white border border-slate-200 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600">
                    {agent.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{agent.user}</p>
                    <p className="text-[10px] text-slate-400">{agent.role}</p>
                  </div>
                  <CircleProgress value={agent.successRate} color={color} />
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                  <span className="text-slate-400">Total</span>
                  <span className="text-right font-semibold text-slate-700">{agent.total}</span>
                  <span className="text-slate-400">Submissions</span>
                  <span className="text-right font-semibold text-emerald-600">{agent.submissions}</span>
                  <span className="text-slate-400">Non-Sub</span>
                  <span className="text-right font-semibold text-red-400">{agent.nonSubmissions}</span>
                  <span className="text-slate-400">Success</span>
                  <span className="text-right font-semibold" style={{ color }}>{agent.successRate}%</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <span className="text-xs font-semibold text-slate-500">Filter by Submitted On:</span>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-400 font-medium">From</label>
          <input
            type="date"
            value={periodFrom}
            onChange={e => { setPeriodFrom(e.target.value); setPage(1) }}
            className="input-field text-xs py-1.5 w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-400 font-medium">To</label>
          <input
            type="date"
            value={periodTo}
            onChange={e => { setPeriodTo(e.target.value); setPage(1) }}
            className="input-field text-xs py-1.5 w-36"
          />
        </div>
        {(periodFrom || periodTo) && (
          <button
            onClick={() => { setPeriodFrom(''); setPeriodTo(''); setPage(1) }}
            className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
            Clear
          </button>
        )}
      </div>

      {/* Submissions table */}
      <div>
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-3 border border-slate-200 flex-wrap">
          {BD_TABS.map(t => {
            const cnt = bdSubmissions.filter(s => s.status === t.key).length
            const meta = STATUS_META[t.key]
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
                  tab === t.key
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {tab === t.key && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                )}
                {t.label}
                {cnt > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tab === t.key ? 'text-white' : 'bg-slate-200 text-slate-500'}`}
                    style={tab === t.key ? { background: meta.color } : {}}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th><th>Submitted On</th><th>ID</th>
                  <th>Set Aside</th><th>Type</th><th>Solicitation</th><th>Status</th>
                  <th>Due Date</th><th>Location</th>
                  <th>BDM</th><th>BDS</th><th>Support</th><th>Value</th><th>Comment</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={15} className="text-center py-12 text-slate-400 text-sm">
                      No submissions in this category.
                    </td>
                  </tr>
                )}
                {pageRows.map((s: BDSubmission, i: number) => {
                  const statusMeta = STATUS_META[s.status as BDTab] || STATUS_META.SUBMITTED
                  return (
                    <motion.tr key={s.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}>
                      <td className="text-slate-400 text-xs">{s.id}</td>
                      <td className="text-slate-600 text-xs">{s.submittedOn}</td>
                      <td className="text-indigo-600 text-xs font-mono font-semibold">{s.solicitationId}</td>
                      <td>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{s.setAside}</span>
                      </td>
                      <td>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">{s.type}</span>
                      </td>
                      <td className="max-w-[180px]">
                        <p className="truncate text-xs font-medium text-slate-800">{s.solicitation}</p>
                      </td>
                      <td>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.border}` }}>
                          {s.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{s.dueDate}</td>
                      <td className="text-xs text-slate-500 max-w-[100px]"><p className="truncate">{s.location}</p></td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{s.bdm}</span>
                      </td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{s.bds}</span>
                      </td>
                      <td className="text-xs text-slate-500">{s.supportAgent ?? '—'}</td>
                      <td className="text-xs font-semibold text-emerald-600 whitespace-nowrap">${s.value.toLocaleString()}</td>
                      <td className="text-xs text-slate-400 max-w-[120px]"><p className="truncate">{s.comment ?? '—'}</p></td>
                      <td className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === String(s.id) ? null : String(s.id)) }}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <MoreHorizontal size={14} />
                        </button>
                        <AnimatePresence>
                          {menuOpen === String(s.id) && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-8 z-30 rounded-xl py-1 w-44"
                                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
                                <button
                                  onClick={() => { toast.success('Details: ' + s.solicitation.slice(0, 30)); setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                  View Details
                                </button>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(s.solicitationId); toast.success('Copied: ' + s.solicitationId); setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                  Copy ID
                                </button>
                                {/* Move to... submenu */}
                                <div className="my-1 border-t" style={{ borderColor: 'rgba(0,0,0,0.08)' }} />
                                <p className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Move to…</p>
                                {BD_TABS.filter(t => t.key !== s.status).map(t => {
                                  const meta = STATUS_META[t.key]
                                  return (
                                    <button
                                      key={t.key}
                                      onClick={() => {
                                        updateBDSubmission(s.id, t.key)
                                        toast.success(`Moved to ${t.label}`)
                                        setMenuOpen(null)
                                      }}
                                      className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                      style={{ color: '#475569' }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
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

          {/* Paginator */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Rows per page:</span>
              <div className="flex gap-1">
                {PER_PAGE_OPTIONS.map(opt => (
                  <button
                    key={String(opt)}
                    onClick={() => { setPerPage(opt); setPage(1) }}
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold transition-colors ${
                      perPage === opt
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {totalRows === 0 ? '0 rows' : `${pageStart + 1}–${pageEnd} of ${totalRows} rows`}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={13} />
                </button>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
