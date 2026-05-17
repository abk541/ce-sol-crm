import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ListChecks, Send, Trash2, CheckCircle2, XCircle,
  ChevronDown, AlertTriangle, Search, Clock, RotateCcw, MoreHorizontal,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatCurrency } from '../lib/utils'
import type { OppStatus } from '../types'
import toast from 'react-hot-toast'
import DetailDrawer, { DrawerSection, DrawerField } from '../components/shared/DetailDrawer'
import type { Opportunity } from '../types'

const stagger = { animate: { transition: { staggerChildren: 0.05 } } }
const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

// Only statuses reachable via normal submission workflow.
// NOT_SUBMITTED and DROPPED are set exclusively by the non-sub-report review flow.
// WON is handled specially below (calls markOpportunityWon to create the FreshAward).
const EDITABLE_STATUSES: OppStatus[] = ['SUBMITTED', 'DISCUSSION', 'WON', 'LOST', 'CANCELED']

const STATUS_META: Record<string, { color: string; bg: string; border: string }> = {
  SUBMITTED:     { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  WON:           { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
  LOST:          { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  DISCUSSION:    { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  CANCELED:      { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  NOT_SUBMITTED: { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  DROPPED:       { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  TERMINATED:    { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  ACTIVE:        { color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.CANCELED
  return (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
      {status}
    </span>
  )
}

function StatusDropdown({ oppId, current, canEdit }: { oppId: string; current: OppStatus; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const { updateOpportunity, markOpportunityWon, freshAwards, currentUser } = useStore()
  const isAdmin = [‘ADMIN’, ‘BDM’].includes(currentUser?.role ?? ‘’)

  if (!isAdmin || !canEdit) return <StatusBadge status={current} />

  // Only show statuses that differ from current and are valid submission-workflow transitions
  const options = EDITABLE_STATUSES.filter(s => s !== current)

  const handleChange = (s: OppStatus) => {
    if (s === ‘WON’) {
      // Guard: create a FreshAward only if one doesn’t already exist for this opportunity
      const alreadyAwarded = freshAwards.some(fa => fa.opportunityId === oppId)
      if (alreadyAwarded) {
        updateOpportunity(oppId, { status: ‘WON’ })
      } else {
        markOpportunityWon(oppId)  // sets status WON + creates FreshAward
      }
    } else {
      updateOpportunity(oppId, { status: s })
    }
    setOpen(false)
    toast.success(`Status updated to ${s}`)
  }

  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all"
        style={{
          color: STATUS_META[current]?.color ?? ‘#64748B’,
          background: STATUS_META[current]?.bg ?? ‘#F8FAFC’,
          border: `1px solid ${STATUS_META[current]?.border ?? ‘#E2E8F0’}`,
        }}>
        {current}
        <ChevronDown size={9} className={open ? ‘rotate-180’ : ‘’} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden min-w-[150px]"
            style={{ background: ‘#FFFFFF’, border: ‘1px solid rgba(0,0,0,0.10)’, boxShadow: ‘0 8px 24px rgba(0,0,0,0.10)’ }}>
            {options.map(s => (
              <button key={s}
                onClick={e => { e.stopPropagation(); handleChange(s) }}
                className="block w-full text-left px-3 py-2 text-[10px] font-bold transition-colors hover:bg-slate-50"
                style={{ color: STATUS_META[s]?.color ?? ‘#64748B’ }}>
                {s === ‘WON’ ? ‘🏆 ‘ : ‘’}{s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

type PerPage = number | 'all'
const PER_PAGE_OPTS: PerPage[] = [10, 25, 50, 100, 'all']

function Paginator({ total, perPage, page, onPage, onPerPage }: {
  total: number; perPage: PerPage; page: number
  onPage: (p: number) => void; onPerPage: (pp: PerPage) => void
}) {
  const totalPages = perPage === 'all' ? 1 : Math.ceil(total / (perPage as number))
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        Rows per page:
        <select value={String(perPage)}
          onChange={e => { const v = e.target.value === 'all' ? 'all' : Number(e.target.value) as PerPage; onPerPage(v); onPage(1) }}
          className="border border-slate-200 rounded-lg px-2 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300">
          {PER_PAGE_OPTS.map(o => <option key={String(o)} value={String(o)}>{o === 'all' ? 'All' : o}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {perPage === 'all'
          ? `All ${total} rows`
          : `${Math.min((page - 1) * (perPage as number) + 1, total)}–${Math.min(page * (perPage as number), total)} of ${total}`}
        <div className="flex gap-1">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition-colors">
            <ChevronLeft size={12} />
          </button>
          <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TrackerPage() {
  const { opportunities, deletionRequests, reviewDeletionRequest, currentUser } = useStore()
  const [tab, setTab] = useState<'submitted' | 'deleted' | 'pending'>('submitted')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPage>(25)

  const isAdmin = currentUser?.role === 'ADMIN'
  const isManager = ['ADMIN', 'BDM'].includes(currentUser?.role ?? '')

  const submitted = useMemo(() =>
    opportunities.filter(o =>
      !o.isDeleted &&
      ['SUBMITTED', 'WON', 'LOST', 'CANCELED', 'NOT_SUBMITTED', 'DROPPED', 'TERMINATED', 'DISCUSSION'].includes(o.status) &&
      (search ? o.solicitation.toLowerCase().includes(search.toLowerCase()) || o.solicitationId.toLowerCase().includes(search.toLowerCase()) : true)
    ).sort((a, b) => new Date(b.submittedAt || b.dueDate).getTime() - new Date(a.submittedAt || a.dueDate).getTime()),
    [opportunities, search]
  )

  const paginatedSubmitted = useMemo(() => {
    if (perPage === 'all') return submitted
    const start = (page - 1) * (perPage as number)
    return submitted.slice(start, start + (perPage as number))
  }, [submitted, page, perPage])

  const deleted = useMemo(() =>
    opportunities.filter(o =>
      o.isDeleted &&
      (search ? o.solicitation.toLowerCase().includes(search.toLowerCase()) : true)
    ),
    [opportunities, search]
  )

  const pending = useMemo(() =>
    deletionRequests.filter(r => r.status === 'PENDING'),
    [deletionRequests]
  )

  const tabs = [
    { id: 'submitted' as const, label: 'Submitted Contracts', count: submitted.length, icon: Send },
    { id: 'deleted'   as const, label: 'Deleted Opportunities', count: deleted.length, icon: Trash2 },
    ...(isAdmin ? [{ id: 'pending' as const, label: 'Deletion Requests', count: pending.length, icon: AlertTriangle }] : []),
  ]

  return (
    <div className="p-6 space-y-5 page-enter">
      {/* Header */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · TRACKER</p>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              <ListChecks size={22} className="text-indigo-500" /> Opportunity Tracker
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Submitted contracts, pipeline outcomes, deletion workflow</p>
          </div>
        </div>
      </motion.div>

      {/* Tabs + search */}
      <motion.div variants={fadeUp} initial="initial" animate="animate"
        className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={12} />
              {t.label}
              {t.count > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 w-64 text-xs" placeholder="Search opportunitiesâ€¦" />
        </div>
      </motion.div>

      {/* Submitted contracts */}
      {tab === 'submitted' && (
        <motion.div variants={stagger} initial="initial" animate="animate"
          className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600">{submitted.length} opportunities tracked</p>
          </div>
          {submitted.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No submitted contracts found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Solicitation</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>BDS</th>
                    <th>Value</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSubmitted.map((o, i) => (
                    <motion.tr key={o.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelected(o)}
                      className="cursor-pointer">
                      <td>
                        <p className="font-semibold text-slate-800 truncate max-w-[220px]">{o.solicitation}</p>
                        <p className="text-[10px] text-slate-400">{o.solicitationId}</p>
                      </td>
                      <td className="text-slate-600 text-xs">{o.client}</td>
                      <td>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{o.type}</span>
                      </td>
                      <td className="text-slate-600 text-xs">{o.bds}</td>
                      <td className="text-slate-700 text-xs font-semibold">
                        {o.value ? formatCurrency(o.value) : 'â€”'}
                      </td>
                      <td className="text-slate-500 text-xs">
                        {o.submittedAt
                          ? new Date(o.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : new Date(o.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <StatusDropdown oppId={o.id} current={o.status} canEdit={isManager} />
                      </td>
                      <td onClick={e => e.stopPropagation()} className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === o.id ? null : o.id) }}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <MoreHorizontal size={14} />
                        </button>
                        <AnimatePresence>
                          {menuOpen === o.id && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-8 z-30 rounded-xl py-1 w-40"
                                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
                                <button
                                  onClick={() => { setSelected(o); setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                  View Details
                                </button>
                                <button
                                  onClick={() => { setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                  Change Status
                                </button>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(o.solicitationId); toast.success('Copied: ' + o.solicitationId); setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                                  Copy ID
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {submitted.length > 0 && (
            <Paginator
              total={submitted.length}
              perPage={perPage}
              page={page}
              onPage={p => setPage(p)}
              onPerPage={pp => { setPerPage(pp); setPage(1) }}
            />
          )}
        </motion.div>
      )}

      {/* Deleted */}
      {tab === 'deleted' && (
        <motion.div variants={stagger} initial="initial" animate="animate"
          className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-600">{deleted.length} deleted opportunities</p>
          </div>
          {deleted.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No deleted opportunities</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {deleted.map((o, i) => {
                const req = deletionRequests.find(r => r.opportunityId === o.id)
                return (
                  <motion.div key={o.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelected(o)}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50 border border-red-100">
                      <Trash2 size={14} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{o.solicitation}</p>
                      <p className="text-[10px] text-slate-500">{o.solicitationId} Â· {o.type} Â· {o.client}</p>
                      {req && (
                        <p className="text-[11px] text-slate-500 mt-1 italic">
                          "{req.reason.slice(0, 120)}{req.reason.length > 120 ? 'â€¦' : ''}"
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {req && (
                        <>
                          <p className="text-[10px] text-slate-500">Deleted by {req.requestedBy}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Pending deletion requests */}
      {tab === 'pending' && isAdmin && (
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
          {pending.length === 0 ? (
            <div className="glass rounded-2xl py-16 text-center text-slate-400 text-sm">
              No pending deletion requests
            </div>
          ) : (
            pending.map((req, i) => {
              const opp = opportunities.find(o => o.id === req.opportunityId)
              return (
                <motion.div key={req.id} variants={fadeUp}
                  className="glass rounded-2xl p-5 border-l-4 border-amber-400">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-200">
                      <AlertTriangle size={16} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{opp?.solicitation ?? 'Unknown Opportunity'}</p>
                      <p className="text-[11px] text-slate-500">{opp?.solicitationId} Â· Requested by {req.requestedBy}</p>
                      <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-700 leading-relaxed">{req.reason}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(req.requestedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => { reviewDeletionRequest(req.id, 'APPROVED', currentUser?.username ?? ''); toast.success('Deletion approved') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        onClick={() => { reviewDeletionRequest(req.id, 'DECLINED', currentUser?.username ?? ''); toast.success('Deletion declined') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                        <XCircle size={12} /> Decline
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </motion.div>
      )}

      {/* Detail Drawer */}
      <DetailDrawer
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.solicitation ?? ''}
        subtitle={selected ? `${selected.solicitationId} Â· ${selected.client}` : ''}
        width={480}
      >
        {selected && (
          <>
            <DrawerSection title="Overview">
              <DrawerField label="Status"      value={<StatusBadge status={selected.status} />} />
              <DrawerField label="Client"      value={selected.client} />
              <DrawerField label="Type"        value={selected.type} />
              <DrawerField label="Set-Aside"   value={selected.setAside} />
              <DrawerField label="NAICS"       value={selected.naicsCode} />
            </DrawerSection>
            <DrawerSection title="Team">
              <DrawerField label="BDM"           value={selected.bdm} />
              <DrawerField label="BDS"           value={selected.bds} />
              <DrawerField label="Support Agent" value={selected.supportAgent ?? 'â€”'} />
            </DrawerSection>
            <DrawerSection title="Financials">
              <DrawerField label="Value"            value={selected.value ? formatCurrency(selected.value) : 'â€”'} />
              <DrawerField label="Contract Amount"  value={selected.contractAmount ? formatCurrency(selected.contractAmount) : 'â€”'} />
              <DrawerField label="Period of Perf."  value={selected.pop ?? 'â€”'} />
            </DrawerSection>
            <DrawerSection title="Dates">
              <DrawerField label="Due Date"      value={new Date(selected.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
              <DrawerField label="Submitted"     value={selected.submittedAt ? new Date(selected.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'â€”'} />
              <DrawerField label="Captured On"   value={selected.capturedOn ?? 'â€”'} />
            </DrawerSection>
            {selected.subcontractors && selected.subcontractors.length > 0 && (
              <DrawerSection title={`Subcontractors (${selected.subcontractors.length})`}>
                {selected.subcontractors.map(s => (
                  <div key={s.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <p className="text-sm font-semibold text-slate-800">{s.companyName}</p>
                    <p className="text-xs text-slate-500">{s.contactName} Â· {s.setAside}</p>
                  </div>
                ))}
              </DrawerSection>
            )}
          </>
        )}
      </DetailDrawer>
    </div>
  )
}
