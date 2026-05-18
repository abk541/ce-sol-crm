import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, UserPlus, ArrowRight, CheckCircle2, Clock,
  Building2, DollarSign, MapPin, Calendar, Briefcase,
  ChevronRight, X, Save, MoreHorizontal,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { FreshAward } from '../types'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

const STATUS_META = {
  PENDING_ASSIGNMENT: { label: 'Pending Assignment', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  ASSIGNED:           { label: 'Assigned',           color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  MOVED_TO_ACTIVE:    { label: 'Moved to Active',    color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
}

const USERS_LIST = [
  'MehdiY', 'Nissrine', 'MehdiA', 'Aymane', 'Maroua',
  'Sirraj', 'Oussama', 'Anas', 'Zoubair', 'Mahmoud', 'Zakaria',
]

interface AssignModalProps {
  award: FreshAward
  onClose: () => void
  onAssign: (id: string, assignments: Partial<FreshAward>) => void
  onMove: (id: string) => void
}

function AssignModal({ award, onClose, onAssign, onMove }: AssignModalProps) {
  const [bdm, setBdm] = useState(award.assignedBDM || '')
  const [bds, setBds] = useState(award.assignedBDS || '')
  const [spm, setSpm] = useState(award.assignedSPM || '')
  const [pm, setPm] = useState(award.assignedPM || '')
  const [agent, setAgent] = useState(award.assignedSupportAgent || '')

  const allAssigned = bdm && bds && spm && pm

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="rounded-2xl w-full max-w-lg overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <UserPlus size={16} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Assign Team</h2>
            <p className="text-xs text-slate-500 truncate max-w-xs">{award.solicitation}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Award summary */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-400">Client</span><p className="font-semibold text-slate-700">{award.client}</p></div>
            <div><span className="text-slate-400">Value</span><p className="font-semibold text-emerald-600">{formatCurrency(award.contractAmount || 0)}</p></div>
            <div><span className="text-slate-400">Type</span><p className="font-semibold text-slate-700">{award.type}</p></div>
            <div><span className="text-slate-400">Set-Aside</span><p className="font-semibold text-slate-700">{award.setAside}</p></div>
          </div>

          {/* Assignment dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Manager *', value: bdm, setter: setBdm },
              { label: 'Team Lead *', value: bds, setter: setBds },
              { label: 'SPM *', value: spm, setter: setSpm },
              { label: 'PM *',  value: pm,  setter: setPm  },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <select value={f.value} onChange={e => f.setter(e.target.value)} className="input-field text-xs py-2 w-full">
                  <option value="">— Select —</option>
                  {USERS_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Associate (optional)</label>
            <select value={agent} onChange={e => setAgent(e.target.value)} className="input-field text-xs py-2 w-full">
              <option value="">— None —</option>
              {USERS_LIST.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button
            disabled={!allAssigned}
            onClick={() => {
              onAssign(award.id, {
                assignedBDM: bdm, assignedBDS: bds,
                assignedSPM: spm, assignedPM: pm,
                assignedSupportAgent: agent || undefined,
              })
              onClose()
            }}
            className="btn-primary flex-1 text-xs gap-1.5 disabled:opacity-40"
          >
            <Save size={12} /> Save Assignment
          </button>
          {award.status === 'ASSIGNED' && (
            <button
              onClick={() => { onMove(award.id); onClose() }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              <ArrowRight size={12} /> Move to Active
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function FreshAwardPage() {
  const { freshAwards, assignFreshAward, moveFreshAwardToActive } = useStore()
  const [selected, setSelected] = useState<FreshAward | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'MOVED_TO_ACTIVE'>('ALL')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const visible = freshAwards.filter(fa => filter === 'ALL' || fa.status === filter)

  const counts = {
    ALL: freshAwards.length,
    PENDING_ASSIGNMENT: freshAwards.filter(f => f.status === 'PENDING_ASSIGNMENT').length,
    ASSIGNED: freshAwards.filter(f => f.status === 'ASSIGNED').length,
    MOVED_TO_ACTIVE: freshAwards.filter(f => f.status === 'MOVED_TO_ACTIVE').length,
  }

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · BUSINESS DEV</p>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <Trophy size={22} className="text-amber-500" /> Fresh Awards
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Newly awarded contracts — assign teams and move to Active Contracts</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 border border-slate-200 w-fit">
        {(['ALL', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'MOVED_TO_ACTIVE'] as const).map(s => {
          const labels = { ALL: 'All', PENDING_ASSIGNMENT: 'Pending', ASSIGNED: 'Assigned', MOVED_TO_ACTIVE: 'Active' }
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filter === s
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {labels[s]}
              {counts[s] > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${filter === s ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
            No fresh awards in this category.
          </div>
        )}
        {visible.map((fa, i) => {
          const meta = STATUS_META[fa.status]
          return (
            <motion.div
              key={fa.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* Status bar */}
              <div className="h-1" style={{ background: meta.color }} />

              <div className="p-5">
                {/* Title + status + menu */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">{fa.solicitation}</h3>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                      {meta.label}
                    </span>
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === fa.id ? null : fa.id) }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      <AnimatePresence>
                        {menuOpen === fa.id && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-7 z-30 rounded-xl py-1 w-44"
                              style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                            >
                              <button
                                onClick={() => { setSelected(fa); setMenuOpen(null) }}
                                className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                style={{ color: '#475569' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                              >
                                Assign Team
                              </button>
                              {fa.status === 'ASSIGNED' && (
                                <button
                                  onClick={() => { moveFreshAwardToActive(fa.id); toast.success('Moved to Active Contracts'); setMenuOpen(null) }}
                                  className="block w-full text-left px-3 py-2 text-xs font-medium text-emerald-600 transition-colors"
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                                >
                                  Move to Active
                                </button>
                              )}
                              <button
                                onClick={() => { navigator.clipboard.writeText(fa.solicitationId || fa.id); toast.success('ID copied'); setMenuOpen(null) }}
                                className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                style={{ color: '#475569' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                              >
                                Copy ID
                              </button>
                              <button
                                onClick={() => { toast.success('Details: ' + fa.solicitation.slice(0, 30)); setMenuOpen(null) }}
                                className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                style={{ color: '#475569' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                              >
                                View Details
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Building2 size={11} className="text-slate-400" />
                    <span className="truncate">{fa.client}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <DollarSign size={11} className="text-slate-400" />
                    <span className="font-semibold text-emerald-600">{formatCurrency(fa.contractAmount || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Briefcase size={11} className="text-slate-400" />
                    <span>{fa.type} · {fa.setAside}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Calendar size={11} className="text-slate-400" />
                    <span>{fa.awardedDate}</span>
                  </div>
                  {fa.location && (
                    <div className="flex items-center gap-1.5 text-slate-500 col-span-2">
                      <MapPin size={11} className="text-slate-400" />
                      <span className="truncate">{fa.location}</span>
                    </div>
                  )}
                </div>

                {/* Assigned team (if any) */}
                {fa.status !== 'PENDING_ASSIGNMENT' && (
                  <div className="mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Team</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      {fa.assignedBDM && <div><span className="text-slate-400">Manager:</span> <span className="font-semibold text-slate-700">{fa.assignedBDM}</span></div>}
                      {fa.assignedBDS && <div><span className="text-slate-400">Team Lead:</span> <span className="font-semibold text-slate-700">{fa.assignedBDS}</span></div>}
                      {fa.assignedSPM && <div><span className="text-slate-400">SPM:</span> <span className="font-semibold text-slate-700">{fa.assignedSPM}</span></div>}
                      {fa.assignedPM && <div><span className="text-slate-400">PM:</span> <span className="font-semibold text-slate-700">{fa.assignedPM}</span></div>}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {fa.status === 'MOVED_TO_ACTIVE' ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 size={12} /> Moved to Active Contracts
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelected(fa)}
                        className="flex-1 btn-secondary text-xs gap-1.5"
                      >
                        <UserPlus size={12} />
                        {fa.status === 'PENDING_ASSIGNMENT' ? 'Assign Team' : 'Edit Assignment'}
                      </button>
                      {fa.status === 'ASSIGNED' && (
                        <button
                          onClick={() => moveFreshAwardToActive(fa.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                        >
                          <ArrowRight size={12} /> Move to Active
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Assign Modal */}
      <AnimatePresence>
        {selected && (
          <AssignModal
            award={selected}
            onClose={() => setSelected(null)}
            onAssign={assignFreshAward}
            onMove={moveFreshAwardToActive}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
