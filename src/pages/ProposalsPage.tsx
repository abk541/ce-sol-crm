import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Download, UserPlus, X, Check, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { OppStatus, Opportunity } from '../types'
import toast from 'react-hot-toast'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'

type Tab = { key: OppStatus | 'ALL'; label: string }

const TABS: Tab[] = [
  { key: 'ACTIVE',        label: 'Active' },
  { key: 'SUBMITTED',     label: 'Submitted' },
  { key: 'DISCUSSION',    label: 'Discussion' },
  { key: 'WON',           label: 'Won' },
  { key: 'LOST',          label: 'Lost' },
  { key: 'CANCELED',      label: 'Canceled' },
  { key: 'NOT_SUBMITTED', label: 'Not Submitted' },
  { key: 'NEW_ASSIGNMENT',label: 'New Assignment' },
  { key: 'TERMINATED',    label: 'Terminated' },
]

const STATUS_BADGE: Record<OppStatus, string> = {
  ACTIVE: 'badge-active', SUBMITTED: 'badge-submitted', WON: 'badge-won', LOST: 'badge-lost',
  DISCUSSION: 'badge-discussion', CANCELED: 'badge-canceled', NOT_SUBMITTED: 'badge-notsubmitted',
  NEW_ASSIGNMENT: 'badge-pending', TERMINATED: 'badge-canceled', DROPPED: 'badge-canceled',
}

const ROLE_LABELS: Record<string, string> = {
  BD_MANAGER: 'BD Manager',
  TEAM_LEAD: 'Team Lead',
  ASSOCIATE: 'Associate',
}
const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  BD_MANAGER: { color: '#4338CA', bg: '#EEF2FF' },
  TEAM_LEAD:  { color: '#1D4ED8', bg: '#EFF6FF' },
  ASSOCIATE:  { color: '#0E7490', bg: '#ECFEFF' },
}

function SortHeader({ col, label, currentKey, dir, onSort }: {
  col: string; label: string; currentKey: string; dir: 'asc' | 'desc'; onSort: (k: string) => void
}) {
  const active = currentKey === col
  return (
    <th className="cursor-pointer select-none hover:bg-slate-50 transition-colors" onClick={() => onSort(col)}>
      <div className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ChevronUp size={11} className="text-indigo-500" /> : <ChevronDown size={11} className="text-indigo-500" />)
          : <ChevronsUpDown size={10} className="text-slate-300" />}
      </div>
    </th>
  )
}

function AssignModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { assignOpportunityToEmployee, employees } = useStore()
  const [selectedEmpId, setSelectedEmpId] = useState<string | undefined>(opp.assignedTo)

  const handleAssign = () => {
    if (!selectedEmpId) { toast.error('Please select an employee'); return }
    assignOpportunityToEmployee(opp.id, selectedEmpId)
    const emp = employees.find(e => e.id === selectedEmpId)
    toast.success(`Assigned to ${emp?.name ?? selectedEmpId}`)
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl"
        style={{ maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Assign Proposal</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-sm">{opp.solicitation}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <HierarchyAssignPicker
            label="Select Employee"
            value={selectedEmpId}
            onChange={setSelectedEmpId}
            deadline={opp.dueDate}
          />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleAssign} disabled={!selectedEmpId}
            className="btn-primary flex-1 justify-center disabled:opacity-40">
            <Check size={13} /> Confirm Assignment
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function ProposalsPage() {
  const { opportunities, employees, updateOpportunity } = useStore()
  const [activeTab, setActiveTab] = useState<OppStatus>('ACTIVE')
  const [search, setSearch] = useState('')
  const [assignTarget, setAssignTarget] = useState<Opportunity | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const counts = useMemo(() =>
    Object.fromEntries(TABS.map(t => [t.key, opportunities.filter(o => o.status === t.key).length])),
    [opportunities]
  )

  const filtered = useMemo(() => {
    let list = opportunities.filter(o => o.status === activeTab)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.solicitation.toLowerCase().includes(q) ||
        o.client.toLowerCase().includes(q) ||
        o.solicitationId.toLowerCase().includes(q)
      )
    }
    if (period) list = list.filter(o => filterByPeriod(o.dueDate, period))
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let av: any = (a as any)[sortKey]
        let bv: any = (b as any)[sortKey]
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [opportunities, activeTab, search, period, sortKey, sortDir])

  return (
    <div className="p-6 page-enter">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Proposals Workspace</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track and manage all government contract proposals</p>
        </div>
        <button className="btn-ghost text-xs"><Download size={12} /> Export</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as OppStatus)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${activeTab === t.key ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-white/5'}`}>
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${activeTab === t.key ? 'bg-indigo-500/30 text-indigo-300' : 'bg-white/5 text-slate-600'}`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Period Filter */}
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-xs" placeholder="Search solicitation, client, ID…" />
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Importance</th>
                <SortHeader col="solicitation" label="Solicitation" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader col="client" label="Client" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Type</th>
                <SortHeader col="dueDate" label="Due Date" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Local Time</th><th>POP</th><th>Location</th><th>Set Aside</th>
                <th>Assigned</th>
                <SortHeader col="status" label="Status" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((o, i) => (
                  <motion.tr key={o.id}
                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} transition={{ delay: i * 0.025 }}>
                    <td>
                      {o.priority === 'HIGH'
                        ? <span className="badge badge-high">HIGH</span>
                        : <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />}
                    </td>
                    <td className="max-w-[180px]">
                      <p className="truncate text-xs text-slate-200 font-medium" title={o.solicitation}>{o.solicitation}</p>
                      <p className="text-[10px] text-slate-600 font-mono">{o.solicitationId}</p>
                    </td>
                    <td className="max-w-[140px]"><p className="truncate text-xs" title={o.client}>{o.client}</p></td>
                    <td><span className="badge badge-discussion text-[10px]">{o.type}</span></td>
                    <td>
                      <span className={`text-xs font-medium ${new Date(o.dueDate) < new Date() ? 'text-rose-400' : 'text-slate-300'}`}>
                        {new Date(o.dueDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs">{o.localTime}</td>
                    <td className="text-slate-500 text-xs max-w-[120px]"><p className="truncate">{o.pop || 'N/A'}</p></td>
                    <td className="text-slate-400 text-xs max-w-[100px]"><p className="truncate">{o.location}</p></td>
                    <td><span className="badge badge-canceled text-[10px]">{o.setAside}</span></td>
                    <td>
                      {(() => {
                        const emp = o.assignedTo ? employees.find(e => e.id === o.assignedTo) : null
                        if (!emp) return <span className="text-slate-400 text-xs">—</span>
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-700">{emp.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ color: ROLE_COLORS[emp.role]?.color ?? '#475569', background: ROLE_COLORS[emp.role]?.bg ?? '#F1F5F9' }}>
                              {ROLE_LABELS[emp.role] ?? emp.role}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status.replace('_',' ')}</span></td>
                    <td>
                      <button onClick={() => setAssignTarget(o)}
                        className="btn-secondary text-xs px-2.5 py-1 gap-1">
                        <UserPlus size={10} /> Assign
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-600 text-sm">No data found.</div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {assignTarget && <AssignModal opp={assignTarget} onClose={() => setAssignTarget(null)} />}
      </AnimatePresence>
    </div>
  )
}
