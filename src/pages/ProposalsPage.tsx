import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Download, UserPlus, X, Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { OppStatus, Opportunity } from '../types'
import toast from 'react-hot-toast'

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
  NEW_ASSIGNMENT: 'badge-pending', TERMINATED: 'badge-canceled',
}

function AssignModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { users, assignOpportunity } = useStore()
  const [bdm, setBdm] = useState(opp.bdm)
  const [bds, setBds] = useState(opp.bds)

  const handleAssign = () => {
    assignOpportunity(opp.id, bdm, bds)
    toast.success(`Assigned to ${bdm}`)
    onClose()
  }

  const agents = users.filter(u => ['BDM','BDS','SUPPORT_AGENT'].includes(u.role))

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'rgba(7,14,34,0.98)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white text-sm">Assign Proposal</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={13} /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4 truncate">{opp.solicitation}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">BDM</label>
            <select value={bdm} onChange={e => setBdm(e.target.value)} className="select-field">
              {agents.map(u => <option key={u.id} value={u.username}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">BDS</label>
            <select value={bds} onChange={e => setBds(e.target.value)} className="select-field">
              {agents.map(u => <option key={u.id} value={u.username}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleAssign} className="btn-primary flex-1 justify-center">
            <Check size={13} /> Assign
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function ProposalsPage() {
  const { opportunities, updateOpportunity } = useStore()
  const [activeTab, setActiveTab] = useState<OppStatus>('ACTIVE')
  const [search, setSearch] = useState('')
  const [assignTarget, setAssignTarget] = useState<Opportunity | null>(null)

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
    return list
  }, [opportunities, activeTab, search])

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

      {/* Search */}
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-xs" placeholder="Search solicitation, client, ID…" />
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Importance</th><th>Solicitation</th><th>Client</th>
                <th>Prime</th><th>Type</th><th>Due Date</th><th>Local Time</th>
                <th>POP</th><th>Location</th><th>Set Aside</th>
                <th>BDM</th><th>BDS</th><th>POC</th><th>Status</th><th>Actions</th>
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
                    <td>
                      <span className={`badge text-[10px] ${o.prime === 'TECH-OR' ? 'badge-medium' : o.prime === 'AYJ-S' ? 'badge-active' : 'badge-submitted'}`}>
                        {o.prime}
                      </span>
                    </td>
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
                    <td><span className="text-xs text-slate-300 bg-white/5 px-2 py-0.5 rounded-md">{o.bdm}</span></td>
                    <td><span className="text-xs text-slate-300 bg-white/5 px-2 py-0.5 rounded-md">{o.bds}</span></td>
                    <td className="text-slate-500 text-xs">{o.poc ?? o.bdm}</td>
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
