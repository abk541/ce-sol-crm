import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, MoreHorizontal, FileCheck2, UserPlus, Building2,
  AlertTriangle, ListChecks, ChevronRight, X, Save, Plus,
  ArrowRight, CheckCircle2, Info, DollarSign, MapPin, Calendar,
  Phone, Mail, Clock, Shield, FileText, Trash2, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type {
  Contract, ContractStatus, ContractPoC, LockedSubcontractor,
  GovernmentWarning, GovWarningType, FreshAward,
} from '../types'
import { formatCurrency } from '../lib/utils'

// ── Status config ───────────────────────────────────────────────────────
const STATUS_META: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
  KICK_OFF:        { label: 'Kick-Off',        color: '#4338CA', bg: '#EEF2FF',  border: '#C7D2FE' },
  LOCKING_SUB:     { label: 'Locking Sub',     color: '#D97706', bg: '#FEF3C7',  border: '#FDE68A' },
  ACTIVE:          { label: 'Active',          color: '#15803D', bg: '#DCFCE7',  border: '#86EFAC' },
  ON_GOING:        { label: 'On-Going',        color: '#0E7490', bg: '#ECFEFF',  border: '#A5F3FC' },
  PERFORMING:      { label: 'Performing',      color: '#7C3AED', bg: '#F5F3FF',  border: '#DDD6FE' },
  PENDING_PAYMENT: { label: 'Pending Payment', color: '#C2410C', bg: '#FFF7ED',  border: '#FED7AA' },
  ARCHIVED:        { label: 'Archived',        color: '#64748B', bg: '#F1F5F9',  border: '#E2E8F0' },
  TERMINATED:      { label: 'Terminated',      color: '#DC2626', bg: '#FEE2E2',  border: '#FECACA' },
  CANCELED:        { label: 'Canceled',        color: '#64748B', bg: '#F1F5F9',  border: '#E2E8F0' },
}

const STATUS_FLOW: Record<ContractStatus, ContractStatus | null> = {
  KICK_OFF: 'LOCKING_SUB', LOCKING_SUB: 'PERFORMING',
  ACTIVE: 'ON_GOING', ON_GOING: 'PERFORMING',
  PERFORMING: 'PENDING_PAYMENT', PENDING_PAYMENT: 'ARCHIVED',
  ARCHIVED: null, TERMINATED: null, CANCELED: null,
}

const GOV_WARNING_META: Record<GovWarningType, { label: string; severity: 'RED' | 'YELLOW' | 'INFO' }> = {
  CURE_NOTICE:       { label: 'Cure Notice',         severity: 'RED' },
  LETTER_OF_CONCERN: { label: 'Letter of Concern',   severity: 'YELLOW' },
  NCR:               { label: 'Non-Conformance Rpt', severity: 'YELLOW' },
  SHOW_CAUSE:        { label: 'Show Cause',           severity: 'RED' },
  STOP_WORK_ORDER:   { label: 'Stop Work Order',      severity: 'RED' },
}

const SEV_COLORS = {
  RED:    { color: '#DC2626', bg: '#FEE2E2' },
  YELLOW: { color: '#D97706', bg: '#FEF3C7' },
  INFO:   { color: '#0891B2', bg: '#ECFEFF' },
}

// ── Tab definitions ─────────────────────────────────────────────────────
type CTab = 'ALL' | 'ACTIVE_GROUP' | 'KICK_OFF' | 'LOCKING_SUB' | 'PERFORMING' | 'PENDING_PAYMENT' | 'ARCHIVED' | 'TERMINATED' | 'FRESH_AWARDS'

const C_TABS: { key: CTab; label: string; statuses: ContractStatus[] }[] = [
  { key: 'ALL',           label: 'All',            statuses: ['KICK_OFF','LOCKING_SUB','ACTIVE','ON_GOING','PERFORMING','PENDING_PAYMENT','ARCHIVED','TERMINATED','CANCELED'] },
  { key: 'ACTIVE_GROUP',  label: 'Active',         statuses: ['ACTIVE','ON_GOING'] },
  { key: 'KICK_OFF',      label: 'Kick-Off',       statuses: ['KICK_OFF'] },
  { key: 'LOCKING_SUB',   label: 'Locking Sub',    statuses: ['LOCKING_SUB'] },
  { key: 'PERFORMING',    label: 'Performing',     statuses: ['PERFORMING'] },
  { key: 'PENDING_PAYMENT',label:'Pend. Payment',  statuses: ['PENDING_PAYMENT'] },
  { key: 'ARCHIVED',      label: 'Archived',       statuses: ['ARCHIVED'] },
  { key: 'TERMINATED',    label: 'Terminated',     statuses: ['TERMINATED','CANCELED'] },
  { key: 'FRESH_AWARDS',  label: 'Fresh Awards',   statuses: [] },
]

const POC_ROLE_LABELS = { KO: 'Contracting Officer', COR: 'COR', END_USER: 'End User' }

// ─────────────────────────────────────────────────────────────────────────
// Detail Drawer
// ─────────────────────────────────────────────────────────────────────────
const ROLE_LABEL_C: Record<string, string> = {
  MANAGER: 'Manager',
  OPERATIONS_MANAGER: 'Ops Manager',
  TEAM_MANAGER: 'Team Manager',
  ASSOCIATE: 'Associate',
}
const ROLE_COLOR_C: Record<string, { color: string; bg: string; border: string }> = {
  MANAGER:            { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  OPERATIONS_MANAGER: { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  TEAM_MANAGER:       { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  ASSOCIATE:          { color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
}

function ContractDetailDrawer({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { updateContract, addContractPoC, removeContractPoC, addLockedSubcontractor, addGovernmentWarning, resolveGovernmentWarning, advanceContractStatus, terminateContract, currentUser, employees } = useStore()
  const [tab, setTab] = useState<'overview' | 'poc' | 'subk' | 'warnings' | 'deliverables'>('overview')

  // Terminate form
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateType, setTerminateType] = useState<'T4C' | 'T4D' | 'CANCELED'>('T4C')
  const [terminateReason, setTerminateReason] = useState('')

  // PoC form
  const [addingPoC, setAddingPoC] = useState(false)
  const [pocForm, setPocForm] = useState({ role: 'KO' as ContractPoC['role'], name: '', email: '', phone: '', notes: '' })

  // Locked sub form
  const [addingSub, setAddingSub] = useState(false)
  const [subForm, setSubForm] = useState({ companyName: '', contactName: '', email: '', phone: '', setAside: '', notes: '' })

  // Gov warning form
  const [addingWarning, setAddingWarning] = useState(false)
  const [warnForm, setWarnForm] = useState({ type: 'CURE_NOTICE' as GovWarningType, issuedDate: '', description: '' })

  // Edit status
  const [editingStatus, setEditingStatus] = useState(false)

  const nextStatus = STATUS_FLOW[contract.status]
  const meta = STATUS_META[contract.status]

  return (
    <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'none' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.10)',
          boxShadow: '0 20px 48px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.08)',
          pointerEvents: 'all',
        }}
      >
      {/* Header */}
      <div className="flex-shrink-0 p-5 flex items-start gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
          <FileCheck2 size={16} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-900 truncate">{contract.title}</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs font-mono mt-0.5 text-slate-400">{contract.contractId}</p>
        </div>
        <button onClick={onClose} className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-slate-400 hover:text-slate-700"
        ><X size={15} /></button>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex gap-0.5 px-3 py-2 overflow-x-auto" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        {[
          { key: 'overview', label: 'Overview', icon: Info },
          { key: 'poc', label: `PoC (${(contract.pocs || []).length})`, icon: UserPlus },
          { key: 'subk', label: `Subk (${(contract.lockedSubcontractors || []).length})`, icon: Building2 },
          { key: 'warnings', label: `Warnings (${(contract.governmentWarnings || []).filter(w => !w.resolvedAt).length})`, icon: AlertTriangle },
          { key: 'deliverables', label: `Deliverables`, icon: ListChecks },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
            style={tab === t.key
              ? { background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }
              : { color: '#64748B', border: '1px solid transparent' }
            }
            onMouseEnter={e => { if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
            onMouseLeave={e => { if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.color = '#64748B' }}
          >
            <t.icon size={11} /> {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Contract Value</p>
                <p className="text-lg font-black text-emerald-600">{formatCurrency(contract.value)}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Prime</p>
                <p className="text-sm font-bold text-indigo-600">{contract.prime}</p>
              </div>
              {contract.baseAmount && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Base Amount</p>
                  <p className="text-sm font-semibold text-slate-700">{formatCurrency(contract.baseAmount)}</p>
                </div>
              )}
              {contract.monthlyPayment && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Monthly Payment</p>
                  <p className="text-sm font-semibold text-slate-700">{formatCurrency(contract.monthlyPayment)}</p>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              {[
                { icon: MapPin, label: 'Location', value: contract.location },
                { icon: Calendar, label: 'PoP', value: `${contract.popStart} → ${contract.popEnd}` },
                { icon: FileText, label: 'Type', value: `${contract.type}${contract.financeType ? ` · ${contract.financeType}` : ''}` },
                { icon: Shield, label: 'Set-Aside', value: contract.setAside || '—' },
                { icon: Building2, label: 'Client', value: contract.client || '—' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2.5 text-slate-600">
                  <f.icon size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-slate-400 w-16 flex-shrink-0">{f.label}</span>
                  <span className="text-xs font-medium text-slate-700">{f.value}</span>
                </div>
              ))}
            </div>

            {/* Team */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Team</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Support', value: contract.supportAgent },
                ].filter(t => t.value).map(t => (
                  <div key={t.label} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] text-slate-400 w-10 flex-shrink-0">{t.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{t.value}</span>
                  </div>
                ))}
              </div>
              {contract.assignedTo && (() => {
                const emp = employees.find(e => e.id === contract.assignedTo)
                if (!emp) return null
                const rc = ROLE_COLOR_C[emp.role] ?? ROLE_COLOR_C.ASSOCIATE
                return (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                    <span className="text-[10px] text-slate-400 w-16 flex-shrink-0">Assigned To</span>
                    <span className="text-xs font-semibold text-slate-700">{emp.name}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: rc.color, background: rc.bg, border: `1px solid ${rc.border}` }}>
                      {ROLE_LABEL_C[emp.role] ?? emp.role}
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* Billing notes */}
            {contract.billingNotes && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Billing Notes</p>
                <p className="text-xs text-amber-800">{contract.billingNotes}</p>
              </div>
            )}

            {/* Option years */}
            {contract.optionYears !== undefined && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Option Years</p>
                <p className="text-xs text-blue-800">{contract.optionYears} option year(s) remaining</p>
                {contract.optionYearDeadline && (
                  <p className="text-xs text-blue-600 mt-0.5">Deadline to exercise: {contract.optionYearDeadline}</p>
                )}
              </div>
            )}

            {/* Termination */}
            {(contract.status === 'TERMINATED' || contract.status === 'CANCELED') && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">
                  {contract.terminationType || 'Terminated'}
                </p>
                {contract.terminationDate && <p className="text-xs text-red-700">Date: {contract.terminationDate}</p>}
                {contract.terminationReason && <p className="text-xs text-red-700 mt-0.5">{contract.terminationReason}</p>}
              </div>
            )}

            {/* Status advance */}
            {nextStatus && (
              <button
                onClick={() => advanceContractStatus(contract.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: STATUS_META[nextStatus].bg, color: STATUS_META[nextStatus].color, border: `1px solid ${STATUS_META[nextStatus].border}` }}
              >
                <ArrowRight size={12} />
                Advance to {STATUS_META[nextStatus].label}
              </button>
            )}

            {/* Terminate button */}
            {!['TERMINATED','ARCHIVED','CANCELED'].includes(contract.status) && (
              <button
                onClick={() => setShowTerminate(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={12} /> Terminate Contract
              </button>
            )}
          </div>
        )}

        {/* POC TAB */}
        {tab === 'poc' && (
          <div className="space-y-3">
            {(contract.pocs || []).length === 0 && !addingPoC && (
              <p className="text-sm text-slate-400 text-center py-8">No points of contact added yet.</p>
            )}
            {(contract.pocs || []).map(poc => (
              <div key={poc.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {POC_ROLE_LABELS[poc.role]}
                  </span>
                  <button onClick={() => removeContractPoC(contract.id, poc.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-sm font-semibold text-slate-800">{poc.name}</p>
                {poc.email && <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1"><Mail size={10} />{poc.email}</p>}
                {poc.phone && <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5"><Phone size={10} />{poc.phone}</p>}
                {poc.notes && <p className="text-xs text-slate-500 mt-1">{poc.notes}</p>}
                {poc.contactedAt && <p className="text-[10px] text-slate-400 mt-1">Last contacted: {poc.contactedAt}</p>}
              </div>
            ))}

            {addingPoC ? (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 space-y-3">
                <p className="text-xs font-bold text-indigo-700">Add Point of Contact</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Role</label>
                    <select value={pocForm.role} onChange={e => setPocForm(p => ({ ...p, role: e.target.value as any }))} className="input-field text-xs py-1.5 w-full">
                      <option value="KO">Contracting Officer (KO)</option>
                      <option value="COR">COR</option>
                      <option value="END_USER">End User</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Name *</label>
                    <input value={pocForm.name} onChange={e => setPocForm(p => ({ ...p, name: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Email</label>
                    <input value={pocForm.email} onChange={e => setPocForm(p => ({ ...p, email: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Phone</label>
                    <input value={pocForm.phone} onChange={e => setPocForm(p => ({ ...p, phone: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Notes</label>
                  <input value={pocForm.notes} onChange={e => setPocForm(p => ({ ...p, notes: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingPoC(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                  <button
                    disabled={!pocForm.name}
                    onClick={() => {
                      addContractPoC(contract.id, { ...pocForm })
                      setPocForm({ role: 'KO', name: '', email: '', phone: '', notes: '' })
                      setAddingPoC(false)
                    }}
                    className="btn-primary flex-1 text-xs py-1.5 disabled:opacity-40">
                    Save PoC
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingPoC(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 hover:text-indigo-600 hover:border-indigo-400 transition-colors">
                <Plus size={12} /> Add Point of Contact
              </button>
            )}
          </div>
        )}

        {/* LOCKED SUBK TAB */}
        {tab === 'subk' && (
          <div className="space-y-3">
            {(contract.lockedSubcontractors || []).length === 0 && !addingSub && (
              <p className="text-sm text-slate-400 text-center py-8">No locked subcontractors.</p>
            )}
            {(contract.lockedSubcontractors || []).map(sub => (
              <div key={sub.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{sub.companyName}</p>
                    <p className="text-xs text-slate-500">{sub.contactName}</p>
                  </div>
                  {sub.setAside && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{sub.setAside}</span>
                  )}
                </div>
                {sub.email && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Mail size={10} />{sub.email}</p>}
                {sub.notes && <p className="text-xs text-slate-500 mt-1">{sub.notes}</p>}

                {/* Attachments */}
                <div className="mt-2 flex gap-2 flex-wrap">
                  {[
                    { label: 'Invoices', count: (sub.invoices || []).length },
                    { label: 'Sub Agreements', count: (sub.subAgreements || []).length },
                    { label: 'Quotes', count: (sub.quotes || []).length },
                  ].map(att => (
                    <div key={att.label} className="flex items-center gap-1 text-[10px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1">
                      <FileText size={9} /> {att.label} ({att.count})
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {addingSub ? (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 space-y-3">
                <p className="text-xs font-bold text-indigo-700">Lock Subcontractor</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Company Name *', key: 'companyName' },
                    { label: 'Contact Name', key: 'contactName' },
                    { label: 'Email', key: 'email' },
                    { label: 'Phone', key: 'phone' },
                    { label: 'Set-Aside', key: 'setAside' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">{f.label}</label>
                      <input value={(subForm as any)[f.key]} onChange={e => setSubForm(p => ({ ...p, [f.key]: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Notes</label>
                  <input value={subForm.notes} onChange={e => setSubForm(p => ({ ...p, notes: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingSub(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                  <button
                    disabled={!subForm.companyName}
                    onClick={() => {
                      addLockedSubcontractor(contract.id, {
                        companyName: subForm.companyName,
                        contactName: subForm.contactName,
                        email: subForm.email || undefined,
                        phone: subForm.phone || undefined,
                        setAside: subForm.setAside || undefined,
                        notes: subForm.notes || undefined,
                        createdAt: new Date().toISOString(),
                        createdBy: 'current_user',
                      })
                      setSubForm({ companyName: '', contactName: '', email: '', phone: '', setAside: '', notes: '' })
                      setAddingSub(false)
                    }}
                    className="btn-primary flex-1 text-xs py-1.5 disabled:opacity-40">
                    Lock Sub
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingSub(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 hover:text-indigo-600 hover:border-indigo-400 transition-colors">
                <Plus size={12} /> Lock Subcontractor
              </button>
            )}
          </div>
        )}

        {/* GOVERNMENT WARNINGS TAB */}
        {tab === 'warnings' && (
          <div className="space-y-3">
            {(contract.governmentWarnings || []).length === 0 && !addingWarning && (
              <p className="text-sm text-slate-400 text-center py-8">No government warnings on record.</p>
            )}
            {(contract.governmentWarnings || []).map(w => {
              const sev = SEV_COLORS[w.severity]
              return (
                <div key={w.id} className="p-4 rounded-xl border"
                  style={{ background: sev.bg, borderColor: sev.color + '40' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: sev.color }}>
                      {GOV_WARNING_META[w.type]?.label || w.type}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: sev.color + '20', color: sev.color }}>
                      {w.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mb-1">{w.description}</p>
                  <p className="text-[10px] text-slate-400">Issued: {w.issuedDate}</p>
                  {w.resolvedAt ? (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600">
                      <CheckCircle2 size={10} /> Resolved {w.resolvedAt.slice(0, 10)} — {w.resolvedNote}
                    </div>
                  ) : (
                    <button
                      onClick={() => resolveGovernmentWarning(contract.id, w.id, 'Issue resolved.')}
                      className="mt-2 text-[10px] text-emerald-600 hover:underline flex items-center gap-1">
                      <CheckCircle2 size={10} /> Mark as Resolved
                    </button>
                  )}
                </div>
              )
            })}

            {addingWarning ? (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50 space-y-3">
                <p className="text-xs font-bold text-red-700">Issue Government Warning</p>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Warning Type</label>
                  <select value={warnForm.type} onChange={e => setWarnForm(p => ({ ...p, type: e.target.value as GovWarningType }))} className="input-field text-xs py-1.5 w-full">
                    {(Object.keys(GOV_WARNING_META) as GovWarningType[]).map(t => (
                      <option key={t} value={t}>{GOV_WARNING_META[t].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Issued Date</label>
                  <input type="date" value={warnForm.issuedDate} onChange={e => setWarnForm(p => ({ ...p, issuedDate: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Description *</label>
                  <textarea rows={2} value={warnForm.description} onChange={e => setWarnForm(p => ({ ...p, description: e.target.value }))} className="input-field text-xs py-1.5 w-full resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingWarning(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                  <button
                    disabled={!warnForm.description || !warnForm.issuedDate}
                    onClick={() => {
                      const severity = GOV_WARNING_META[warnForm.type].severity
                      addGovernmentWarning(contract.id, {
                        type: warnForm.type,
                        issuedDate: warnForm.issuedDate,
                        description: warnForm.description,
                        severity,
                      })
                      setWarnForm({ type: 'CURE_NOTICE', issuedDate: '', description: '' })
                      setAddingWarning(false)
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40">
                    Issue Warning
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingWarning(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-red-300 text-xs text-red-500 hover:border-red-400 hover:text-red-600 transition-colors">
                <AlertTriangle size={12} /> Issue Government Warning
              </button>
            )}
          </div>
        )}

        {/* DELIVERABLES TAB */}
        {tab === 'deliverables' && (
          <div className="space-y-3">
            {(contract.deliverables || []).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No deliverables tracked.</p>
            )}
            {(contract.deliverables || []).map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <CheckCircle2 size={14} className="text-indigo-500 flex-shrink-0" />
                <span className="text-sm text-slate-700">{d}</span>
              </div>
            ))}
            <button
              onClick={() => {
                const item = window.prompt('Add deliverable:')
                if (item) updateContract(contract.id, { deliverables: [...(contract.deliverables || []), item] })
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 hover:text-indigo-600 hover:border-indigo-400 transition-colors">
              <Plus size={12} /> Add Deliverable
            </button>
          </div>
        )}

      </div>
      </motion.div>

      {/* Terminate Contract Modal */}
      <AnimatePresence>
        {showTerminate && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setShowTerminate(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl"
              style={{ border: '1px solid rgba(0,0,0,0.10)' }}
            >
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Terminate Contract</h3>
                <p className="text-xs text-slate-500 mt-0.5">{contract.title}</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Termination Type</label>
                  <select value={terminateType} onChange={e => setTerminateType(e.target.value as any)} className="select-field">
                    <option value="T4C">T4C — Termination for Convenience</option>
                    <option value="T4D">T4D — Termination for Default</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Reason *</label>
                  <textarea
                    value={terminateReason}
                    onChange={e => setTerminateReason(e.target.value)}
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Explain the reason for termination…"
                  />
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button onClick={() => setShowTerminate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    if (!terminateReason.trim()) { return }
                    terminateContract(contract.id, terminateType, terminateReason.trim())
                    toast.success('Contract terminated and archived to Past Performances')
                    setShowTerminate(false)
                    onClose()
                  }}
                  className="btn-danger flex-1 flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} /> Confirm Termination
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// Fresh Awards Tab
// ─────────────────────────────────────────────────────────────────────────
const FA_STATUS_META: Record<FreshAward['status'], { label: string; color: string; bg: string; border: string }> = {
  PENDING_ASSIGNMENT: { label: 'Pending Assignment', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  ASSIGNED:           { label: 'Assigned',           color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  MOVED_TO_ACTIVE:    { label: 'Moved to Active',    color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
}

function AssignModal({ award, onClose }: { award: FreshAward; onClose: () => void }) {
  const { assignFreshAward } = useStore()
  const [form, setForm] = useState({
    assignedBDM: award.assignedBDM ?? '',
    assignedBDS: award.assignedBDS ?? '',
    assignedSPM: award.assignedSPM ?? '',
    assignedPM: award.assignedPM ?? '',
    assignedSupportAgent: award.assignedSupportAgent ?? '',
  })

  const handleSave = () => {
    assignFreshAward(award.id, {
      assignedBDM: form.assignedBDM || undefined,
      assignedBDS: form.assignedBDS || undefined,
      assignedSPM: form.assignedSPM || undefined,
      assignedPM: form.assignedPM || undefined,
      assignedSupportAgent: form.assignedSupportAgent || undefined,
      status: 'ASSIGNED',
    })
    toast.success('Team assigned to fresh award')
    onClose()
  }

  const fields: { label: string; key: keyof typeof form }[] = [
    { label: 'BDM', key: 'assignedBDM' },
    { label: 'BDS', key: 'assignedBDS' },
    { label: 'SPM', key: 'assignedSPM' },
    { label: 'PM',  key: 'assignedPM'  },
    { label: 'Support Agent', key: 'assignedSupportAgent' },
  ]

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
        onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)' }}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Assign Team</h2>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{award.solicitation}</p>
        </div>
        <div className="p-6 space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
              <input
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="input-field w-full text-xs py-1.5"
                placeholder={`Assign ${f.label}…`}
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1 justify-center">
              <Save size={13} /> Save Assignment
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function FreshAwardsTab() {
  const { freshAwards, moveFreshAwardToActive } = useStore()
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const assigningAward = assigningId ? freshAwards.find(fa => fa.id === assigningId) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileCheck2 size={14} className="text-emerald-500" />
        <p className="text-sm font-bold text-slate-700">Fresh Awards</p>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{freshAwards.length}</span>
      </div>

      {freshAwards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
          No fresh awards yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Solicitation</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Awarded Date</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {freshAwards.map((fa, i) => {
                  const meta = FA_STATUS_META[fa.status]
                  return (
                    <motion.tr key={fa.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}>
                      <td className="max-w-[200px]">
                        <p className="truncate text-xs font-semibold text-slate-800">{fa.solicitation}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{fa.solicitationId}</p>
                      </td>
                      <td className="text-xs text-slate-600">{fa.client || '—'}</td>
                      <td>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                          {fa.type}
                        </span>
                      </td>
                      <td className="text-xs font-semibold text-emerald-600 whitespace-nowrap">
                        {fa.contractAmount != null ? formatCurrency(fa.contractAmount) : '—'}
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {fa.awardedDate
                          ? new Date(fa.awardedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="text-xs">
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          {fa.assignedBDM && <span><span className="text-slate-400">BDM:</span> {fa.assignedBDM}</span>}
                          {fa.assignedBDS && <span><span className="text-slate-400">BDS:</span> {fa.assignedBDS}</span>}
                          {fa.assignedSPM && <span><span className="text-slate-400">SPM:</span> {fa.assignedSPM}</span>}
                          {fa.assignedPM  && <span><span className="text-slate-400">PM:</span>  {fa.assignedPM}</span>}
                          {!fa.assignedBDM && !fa.assignedBDS && !fa.assignedSPM && !fa.assignedPM && (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {fa.status !== 'MOVED_TO_ACTIVE' && (
                            <button
                              onClick={() => setAssigningId(fa.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors whitespace-nowrap">
                              <UserPlus size={9} /> Assign Team
                            </button>
                          )}
                          {fa.status === 'ASSIGNED' && (
                            <button
                              onClick={() => {
                                moveFreshAwardToActive(fa.id)
                                toast.success('Moved to Active Contracts')
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap">
                              <ArrowRight size={9} /> Move to Active
                            </button>
                          )}
                          {fa.status === 'MOVED_TO_ACTIVE' && (
                            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 size={10} /> In Contracts
                            </span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {assigningAward && (
          <AssignModal award={assigningAward} onClose={() => setAssigningId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ContractsPage() {
  const { contracts, employees, freshAwards } = useStore()
  const [tab, setTab] = useState<CTab>('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contract | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const tabDef = C_TABS.find(t => t.key === tab)!

  const filtered = useMemo(() => {
    if (tab === 'FRESH_AWARDS') return []
    let list = contracts.filter(c => tabDef.statuses.includes(c.status))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.contractId.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        (c.spm ?? '').toLowerCase().includes(q) ||
        (c.pm ?? '').toLowerCase().includes(q)
      )
    }
    if (period) list = list.filter(c => filterByPeriod(c.popEnd, period))
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
  }, [contracts, tab, search, period, sortKey, sortDir])

  const totalValue = contracts.reduce((s, c) => s + c.value, 0)
  const activeCount = contracts.filter(c => ['ACTIVE', 'ON_GOING', 'PERFORMING', 'KICK_OFF', 'LOCKING_SUB'].includes(c.status)).length
  const warningCount = contracts.reduce((s, c) => s + (c.governmentWarnings || []).filter(w => !w.resolvedAt).length, 0)

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · CONTRACT ADMIN</p>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <FileCheck2 size={22} className="text-indigo-500" /> Active Contracts
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">FY 2026 portfolio · {contracts.length} total</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Portfolio Value', value: formatCurrency(totalValue), sub: `${contracts.length} contracts`, color: '#34D399', bg: 'rgba(16,185,129,0.10)' },
          { label: 'Active/In-Progress', value: activeCount.toString(), sub: 'Currently executing', color: '#818CF8', bg: 'rgba(99,102,241,0.10)' },
          { label: 'Pending Payment', value: contracts.filter(c => c.status === 'PENDING_PAYMENT').length.toString(), sub: 'Awaiting payment', color: '#FDA47A', bg: 'rgba(249,115,22,0.10)' },
          { label: 'Gov. Warnings', value: warningCount.toString(), sub: 'Active unresolved', color: warningCount > 0 ? '#FCA5A5' : '#94A3B8', bg: warningCount > 0 ? 'rgba(239,68,68,0.10)' : 'rgba(100,116,139,0.10)' },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-2xl border" style={{ background: s.bg, borderColor: s.color + '40' }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">{s.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
          {C_TABS.map(t => {
            const cnt = t.key === 'FRESH_AWARDS'
              ? freshAwards.length
              : contracts.filter(c => t.statuses.includes(c.status)).length
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  tab === t.key
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
                {cnt > 0 && (
                  <span className={`text-[9px] font-black px-1 rounded-full ${tab === t.key ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{cnt}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-xs py-2 w-56" placeholder="Search contracts…" />
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Fresh Awards Tab */}
      {tab === 'FRESH_AWARDS' && <FreshAwardsTab />}

      {/* Table */}
      {tab !== 'FRESH_AWARDS' && <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader col="prime" label="Prime" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader col="title" label="Title" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Contract ID</th>
                <th>Type</th>
                <SortHeader col="status" label="Status" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader col="location" label="Location" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>POP</th>
                <SortHeader col="value" label="Value" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Assigned</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400 text-sm">
                    No contracts in this category.
                  </td>
                </tr>
              )}
              {filtered.map((c, i) => {
                const meta = STATUS_META[c.status]
                const activeWarnings = (c.governmentWarnings || []).filter(w => !w.resolvedAt)
                const isExpired = c.popEnd && new Date(c.popEnd) < new Date()
                return (
                  <motion.tr key={c.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="cursor-pointer"
                    onClick={() => { setSelected(c); setMenuOpen(null) }}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ background: '#6366F1' }}>
                        {c.prime}
                      </span>
                    </td>
                    <td className="max-w-[180px]">
                      <p className="truncate text-xs font-semibold text-slate-800" title={c.title}>{c.title}</p>
                    </td>
                    <td className="text-indigo-600 text-xs font-mono font-semibold whitespace-nowrap">{c.contractId}</td>
                    <td>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{c.type}</span>
                    </td>
                    <td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500 max-w-[100px]">
                      <p className="truncate">{c.location}</p>
                    </td>
                    <td>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${isExpired ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                        {c.popStart}<br /><span className="text-[10px]">→ {c.popEnd}</span>
                      </span>
                    </td>
                    <td className="text-xs font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(c.value)}</td>
                    <td className="text-xs">
                      {(() => {
                        const emp = c.assignedTo ? employees.find(e => e.id === c.assignedTo) : null
                        if (!emp) return <span className="text-slate-400">—</span>
                        const rc = ROLE_COLOR_C[emp.role] ?? ROLE_COLOR_C.ASSOCIATE
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-700 font-medium whitespace-nowrap">{emp.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
                              style={{ color: rc.color, background: rc.bg, border: `1px solid ${rc.border}` }}>
                              {ROLE_LABEL_C[emp.role] ?? emp.role}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="text-xs" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {activeWarnings.length > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
                            <AlertTriangle size={10} /> {activeWarnings.length}
                          </span>
                        )}
                        {(c.pocs || []).length > 0 && (
                          <span className="text-[10px] text-indigo-500 font-bold">
                            {(c.pocs || []).length}P
                          </span>
                        )}
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        <AnimatePresence>
                          {menuOpen === c.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -5 }}
                              className="absolute right-0 top-8 z-30 rounded-xl py-1 w-44"
                            style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                            >
                              {[
                                { label: 'View Details', icon: ChevronRight, action: () => { setSelected(c); setMenuOpen(null) } },
                                { label: 'Add PoC', icon: UserPlus, action: () => { setSelected(c); setMenuOpen(null) } },
                                { label: 'Lock Subk', icon: Building2, action: () => { setSelected(c); setMenuOpen(null) } },
                                { label: 'Issue Warning', icon: AlertTriangle, action: () => { setSelected(c); setMenuOpen(null) } },
                              ].map(item => (
                                <button key={item.label} onClick={item.action}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#475569' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}
                                >
                                  <item.icon size={11} className="text-slate-400" />
                                  {item.label}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}
              onClick={() => setSelected(null)} />
            <ContractDetailDrawer
              contract={contracts.find(c => c.id === selected.id) || selected}
              onClose={() => setSelected(null)}
            />
          </>
        )}
      </AnimatePresence>

      {/* Close menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  )
}
