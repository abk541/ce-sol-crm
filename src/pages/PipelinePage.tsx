import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, X, ExternalLink, Loader,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Edit2, Users2, Send, Trash2, Clock,
  FileText, PlusCircle, Download, Filter, MoreHorizontal, Trophy,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Opportunity, Priority, OppStatus } from '../types'
import { TIMEZONES } from '../data/mock'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'
import DetailDrawer, { DrawerSection, DrawerField } from '../components/shared/DetailDrawer'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'

// ── Constants ─────────────────────────────────────────────────────────
const PRIMES   = ['All', 'TECH-OR', 'AYJ-S', 'SANFORD', 'SAUDI']
const TYPES    = ['All', 'OTJ', 'RECURRING', 'BPA', 'IDIQ', 'S&D', 'SUPPLY']
const STATUSES: OppStatus[] = ['ACTIVE','SUBMITTED','WON','LOST','DISCUSSION','CANCELED','NOT_SUBMITTED','NEW_ASSIGNMENT','TERMINATED','DROPPED']
const TZ_ABBREVS = Object.keys(TIMEZONES)

// ── Helpers ───────────────────────────────────────────────────────────
function convertTime(time: string, sourceTzAbbrev: string): string {
  const ianaSource = TIMEZONES[sourceTzAbbrev]
  if (!ianaSource || !time) return `${time} ${sourceTzAbbrev}`
  try {
    const today = new Date().toISOString().split('T')[0]
    const guessUTC = new Date(`${today}T${time}:00Z`)
    const fmtd = new Intl.DateTimeFormat('en-US', { timeZone: ianaSource, hour: '2-digit', minute: '2-digit', hour12: false }).format(guessUTC)
    const [fh, fm] = fmtd.split(':').map(Number)
    const [th, tm] = time.split(':').map(Number)
    const offsetMs = ((th - fh) * 60 + (tm - fm)) * 60000
    const actualUTC = new Date(guessUTC.getTime() + offsetMs)
    const localStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(actualUTC)
    const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(actualUTC).find(p => p.type === 'timeZoneName')?.value ?? ''
    return `${localStr} ${tzAbbr} (local)`
  } catch { return `${time} ${sourceTzAbbrev}` }
}

// ── Badges ────────────────────────────────────────────────────────────
const PRIORITY_META: Record<Priority, { color: string; bg: string; border: string }> = {
  HIGH:   { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  MEDIUM: { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  LOW:    { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
}
const STATUS_META: Record<string, { color: string; bg: string; border: string }> = {
  ACTIVE:         { color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  SUBMITTED:      { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  WON:            { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  LOST:           { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  DISCUSSION:     { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  CANCELED:       { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  NOT_SUBMITTED:  { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  NEW_ASSIGNMENT: { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  TERMINATED:     { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  DROPPED:        { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
}
const PRIME_META: Record<string, { color: string; bg: string; border: string }> = {
  'TECH-OR': { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  'AYJ-S':   { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
  'SANFORD': { color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  'SAUDI':   { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
}

function PriorityBadge({ p }: { p: Priority }) {
  const m = PRIORITY_META[p]
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{p}</span>
}
function StatusBadge({ s }: { s: OppStatus }) {
  const m = STATUS_META[s] ?? STATUS_META.CANCELED
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{s}</span>
}
function PrimeBadge({ p }: { p: string }) {
  const m = PRIME_META[p] ?? { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' }
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{p}</span>
}
function dueDateColor(d: string) {
  const diff = new Date(d).getTime() - Date.now()
  if (diff < 0) return 'text-red-600 font-bold'
  if (diff < 48 * 3600000) return 'text-amber-600 font-semibold'
  return 'text-slate-500'
}

// ── Modal Wrapper ─────────────────────────────────────────────────────
function ModalWrap({ onClose, title, subtitle, children, maxW = 'max-w-2xl' }: {
  onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; maxW?: string
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <motion.div
        className={`relative z-10 w-full ${maxW} max-h-[90vh] overflow-y-auto rounded-2xl`}
        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)' }}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 z-10" style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

// ── Shared: tabbed opportunity modal shell ────────────────────────────
type OppFormTab = 'details' | 'schedule' | 'team' | 'assign'
const OPP_FORM_TABS: { id: OppFormTab; label: string }[] = [
  { id: 'details',  label: 'Opportunity' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'team',     label: 'Team & Finance' },
  { id: 'assign',   label: 'Assignment' },
]

function OppModalShell({ title, subtitle, tab, setTab, onClose, extraHeader, footer, children }: {
  title: string; subtitle?: string
  tab: OppFormTab; setTab: (t: OppFormTab) => void
  onClose: () => void
  extraHeader?: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <motion.div
        className="relative z-10 w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        style={{ height: 'min(88vh, 760px)' }}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}>

        {/* ── Top header ── */}
        <div className="flex-shrink-0 border-b border-slate-200">
          <div className="flex items-start justify-between px-7 pt-5 pb-3 gap-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-slate-900 leading-tight">{title}</h2>
              {subtitle && (
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">{subtitle}</p>
              )}
            </div>
            <button onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all mt-0.5">
              <X size={14} />
            </button>
          </div>

          {/* Optional row (SAM import, etc.) */}
          {extraHeader && <div className="px-7 pb-3">{extraHeader}</div>}

          {/* Tab bar */}
          <div className="flex px-7 gap-0.5">
            {OPP_FORM_TABS.map((t, i) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={[
                  'px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5',
                  tab === t.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200',
                ].join(' ')}>
                <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${tab === t.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  {i + 1}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {children}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-7 py-4 bg-slate-50/80 border-t border-slate-200">
          {footer}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────
function EditModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { updateOpportunity, requestDeletion, deletionRequests, currentUser } = useStore()
  const [tab, setTab] = useState<OppFormTab>('details')
  const [form, setForm] = useState<Partial<Opportunity>>({ ...opp })
  const [showDeleteReq, setShowDeleteReq] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

  const isManager = ['ADMIN', 'BDM'].includes(currentUser?.role ?? '')
  const hasPendingDelete = deletionRequests.some(r => r.opportunityId === opp.id && r.status === 'PENDING')
  const set = (k: keyof Opportunity, v: any) => setForm(p => ({ ...p, [k]: v }))
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  const handleSave = () => {
    if (!form.solicitation?.trim()) { toast.error('Solicitation title is required'); setTab('details'); return }
    if (!form.dueDate) { toast.error('Due date is required'); setTab('schedule'); return }
    updateOpportunity(opp.id, form)
    toast.success('Opportunity updated')
    onClose()
  }

  const submitDeleteReq = () => {
    if (deleteReason.trim().length < 10) { toast.error('Please provide a reason (min 10 chars)'); return }
    requestDeletion(opp.id, currentUser?.username ?? '', deleteReason.trim())
    toast.success('Deletion request submitted')
    setShowDeleteReq(false); onClose()
  }

  return (
    <OppModalShell
      title="Edit Opportunity"
      subtitle={opp.solicitation}
      tab={tab} setTab={setTab}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {isManager && !hasPendingDelete && (
            <button type="button" onClick={() => setShowDeleteReq(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
              <Trash2 size={12} /> Request Deletion
            </button>
          )}
          {hasPendingDelete && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
              ⚠ Deletion pending review
            </span>
          )}
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} className="btn-primary">Save Changes</button>
          </div>
        </div>
      }
    >
      {/* ── Details tab ── */}
      {tab === 'details' && (
        <div className="space-y-5">
          <div>
            <label className={lbl}>Solicitation Title *</label>
            <input value={form.solicitation ?? ''} onChange={e => set('solicitation', e.target.value)} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Solicitation ID</label>
              <input value={form.solicitationId ?? ''} onChange={e => set('solicitationId', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className={lbl}>Client / Agency</label>
              <input value={form.client ?? ''} onChange={e => set('client', e.target.value)} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {([
              { label: 'Contract Type', key: 'type',     opts: ['OTJ','RECURRING','BPA','IDIQ','S&D','SUPPLY'] },
              { label: 'Prime',         key: 'prime',    opts: ['TECH-OR','AYJ-S','SANFORD','SAUDI'] },
              { label: 'Set Aside',     key: 'setAside', opts: ['SB','SDVOSB','WOSB','HUBZone','VOSB','8(a)','UNRES'] },
            ] as const).map(f => (
              <div key={f.key}>
                <label className={lbl}>{f.label}</label>
                <select value={(form as any)[f.key] ?? f.opts[0]} onChange={e => set(f.key as keyof Opportunity, e.target.value)} className="select-field">
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className={lbl}>NAICS Code</label>
              <input value={form.naicsCode ?? ''} onChange={e => set('naicsCode', e.target.value)} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Status</label>
              <select value={form.status ?? 'ACTIVE'} onChange={e => set('status', e.target.value as OppStatus)} className="select-field">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select value={form.priority ?? 'MEDIUM'} onChange={e => set('priority', e.target.value as Priority)} className="select-field">
                {['HIGH','MEDIUM','LOW'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Location</label>
              <input value={form.location ?? ''} onChange={e => set('location', e.target.value)} className="input-field" placeholder="City, State" />
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule tab ── */}
      {tab === 'schedule' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Due Date *</label>
              <input type="date" value={form.dueDate ?? ''} onChange={e => set('dueDate', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className={lbl}>Local Time (HH:MM)</label>
              <input value={form.localTime ?? ''} onChange={e => set('localTime', e.target.value)} className="input-field" placeholder="17:00" />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <select value={form.timezone ?? 'EST'} onChange={e => set('timezone', e.target.value)} className="select-field">
                {TZ_ABBREVS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {form.localTime && form.timezone && (
            <p className="text-[11px] text-indigo-600 -mt-2 flex items-center gap-1 font-medium">
              <Clock size={10} /> Your local: {convertTime(form.localTime, form.timezone)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Period of Performance</label>
              <input value={form.pop ?? ''} onChange={e => set('pop', e.target.value)} className="input-field" placeholder="1 base yr + 4 option yrs" />
            </div>
            <div>
              <label className={lbl}>SAM.gov Link</label>
              <input value={form.link ?? ''} onChange={e => set('link', e.target.value)} className="input-field" placeholder="https://sam.gov/opp/…" />
            </div>
            <div>
              <label className={lbl}>POC</label>
              <input value={form.poc ?? ''} onChange={e => set('poc', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className={lbl}>Mandatory Events</label>
              <input value={form.mandatoryEvents ?? ''} onChange={e => set('mandatoryEvents', e.target.value)} className="input-field" />
            </div>
          </div>
        </div>
      )}

      {/* ── Team & Finance tab ── */}
      {tab === 'team' && (
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Team Members</p>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lbl}>BDM</label><input value={form.bdm ?? ''} onChange={e => set('bdm', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>BDS</label><input value={form.bds ?? ''} onChange={e => set('bds', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Support Agent</label><input value={form.supportAgent ?? ''} onChange={e => set('supportAgent', e.target.value)} className="input-field" /></div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Contract Value</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Contract Amount ($)</label>
                <input type="number" value={form.contractAmount ?? ''} onChange={e => set('contractAmount', Number(e.target.value))} className="input-field" />
              </div>
              <div>
                <label className={lbl}>Base Amount ($)</label>
                <input type="number" value={form.baseAmount ?? ''} onChange={e => set('baseAmount', Number(e.target.value))} className="input-field" />
              </div>
              <div>
                <label className={lbl}>Monthly Payment ($)</label>
                <input type="number" value={form.monthlyPayment ?? ''} onChange={e => set('monthlyPayment', Number(e.target.value))} className="input-field" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assignment tab ── */}
      {tab === 'assign' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Assign to a team member</p>
            <p className="text-xs text-slate-400 mb-4">
              Select anyone in the hierarchy. The ⚠ badge shows when they already have a contract ending on the same due date.
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || opp.dueDate || undefined}
          />
        </div>
      )}

      {/* Delete request panel */}
      <AnimatePresence>
        {showDeleteReq && (
          <motion.div className="mt-5 border border-red-200 rounded-xl p-4 bg-red-50"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <p className="text-xs font-bold text-red-600 mb-2">Reason for deletion request</p>
            <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3}
              className="input-field w-full resize-none text-sm" placeholder="Explain why this opportunity should be deleted…" />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setShowDeleteReq(false)} className="btn-secondary text-xs">Cancel</button>
              <button type="button" onClick={submitDeleteReq}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-100 border border-red-200 hover:bg-red-200 transition-colors">
                <Trash2 size={11} /> Submit Request
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </OppModalShell>
  )
}

// ── Subcontractor Modal ───────────────────────────────────────────────
function SubcontractorModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { subcontractors, addSubcontractor, deleteSubcontractor, currentUser } = useStore()
  const [tab, setTab] = useState<'list' | 'add'>('list')
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', naicsCode: '', setAside: 'SB', notes: '' })

  const oppSubs = subcontractors.filter(s => s.opportunityId === opp.id)
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyName) return
    addSubcontractor({ ...form, opportunityId: opp.id, createdBy: currentUser?.username ?? '' })
    toast.success('Subcontractor added')
    setForm({ companyName: '', contactName: '', email: '', phone: '', naicsCode: '', setAside: 'SB', notes: '' })
    setTab('list')
  }

  return (
    <ModalWrap onClose={onClose} title="Subcontractors" subtitle={opp.solicitation}>
      <div className="px-6 pt-4 pb-2">
        <div className="flex gap-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200 inline-flex">
          <button onClick={() => setTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'list' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            Registered ({oppSubs.length})
          </button>
          <button onClick={() => setTab('add')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${tab === 'add' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <PlusCircle size={11} /> Add New
          </button>
        </div>
      </div>

      <div className="px-6 pb-6">
        {tab === 'list' && (
          oppSubs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No subcontractors registered yet</div>
          ) : (
            <div className="space-y-3 mt-2">
              {oppSubs.map(s => (
                <motion.div key={s.id} layout
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.companyName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.contactName} · {s.email} · {s.phone}</p>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">NAICS {s.naicsCode}</span>
                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">{s.setAside}</span>
                      </div>
                      {s.notes && <p className="text-xs mt-1.5 italic text-slate-500">"{s.notes}"</p>}
                      <p className="text-[10px] mt-1.5 text-slate-400">Added by {s.createdBy} · {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <button onClick={() => { deleteSubcontractor(s.id); toast.success('Subcontractor removed') }}
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                      <X size={12} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        )}

        {tab === 'add' && (
          <form onSubmit={submit} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Company Name *</label>
                <input value={form.companyName} onChange={e => setF('companyName', e.target.value)} className="input-field" required placeholder="Legal company name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Contact Name</label>
                <input value={form.contactName} onChange={e => setF('contactName', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone</label>
                <input value={form.phone} onChange={e => setF('phone', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">NAICS Code</label>
                <input value={form.naicsCode} onChange={e => setF('naicsCode', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Set Aside</label>
                <select value={form.setAside} onChange={e => setF('setAside', e.target.value)} className="select-field">
                  {['SB','SDVOSB','WOSB','HUBZone','VOSB','8(a)','UNRES'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} className="input-field w-full resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setTab('list')} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary"><PlusCircle size={13} /> Add Subcontractor</button>
            </div>
          </form>
        )}
      </div>
    </ModalWrap>
  )
}

// ── Submit Modal ──────────────────────────────────────────────────────
function SubmitModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { submitOpportunity } = useStore()
  const [proposals, setProposals] = useState<string[]>(opp.proposals ?? [])
  const [newFile, setNewFile] = useState('')

  const addFile = () => { if (!newFile.trim()) return; setProposals(p => [...p, newFile.trim()]); setNewFile('') }
  const confirm = () => { submitOpportunity(opp.id); toast.success('Proposal submitted! Status updated.'); onClose() }

  return (
    <ModalWrap onClose={onClose} title="Submit Proposal" subtitle={opp.solicitation} maxW="max-w-md">
      <div className="p-6 space-y-4">
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-500 mb-1.5">Opportunity details</p>
          <p className="text-sm font-semibold text-slate-800">{opp.solicitation}</p>
          <p className="text-xs text-slate-500 mt-0.5">{opp.solicitationId} · Due: {new Date(opp.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {opp.localTime && `at ${opp.localTime} ${opp.timezone ?? ''}`}</p>
          {opp.contractAmount && <p className="text-xs text-emerald-600 mt-1 font-semibold">{formatCurrency(opp.contractAmount)}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Proposal Files</label>
          {proposals.length === 0 && <p className="text-xs text-slate-400 mb-2">No files attached yet</p>}
          <div className="space-y-1 mb-2">
            {proposals.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                <FileText size={11} className="flex-shrink-0 text-slate-400" />
                <span className="text-xs text-slate-700 flex-1 truncate">{f}</span>
                <button onClick={() => setProposals(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-400 transition-colors">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newFile} onChange={e => setNewFile(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFile())}
              className="input-field flex-1 text-xs" placeholder="e.g. Proposal_Final_v2.pdf" />
            <button type="button" onClick={addFile} className="btn-secondary text-xs px-3">Add</button>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={confirm} className="btn-primary flex-1 justify-center"><Send size={13} /> Confirm Submission</button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ── Create Modal ──────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const { createOpportunity } = useStore()
  const [tab, setTab] = useState<OppFormTab>('details')
  const [samUrl, setSamUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState<Partial<Opportunity>>({
    priority: 'MEDIUM', status: 'ACTIVE', type: 'OTJ', setAside: 'SB',
    prime: 'TECH-OR',
    period: new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase() + ' ' + new Date().getFullYear(),
    capturedOn: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    bdm: '', bds: '', naicsCode: '', solicitationId: '', solicitation: '',
    client: '', location: '', dueDate: '', localTime: '', timezone: 'EST',
    comments: [], proposals: [], subcontractors: [], assignedTo: undefined,
  })
  const set = (k: keyof Opportunity, v: any) => setForm(p => ({ ...p, [k]: v }))
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  const handleImport = async () => {
    if (!samUrl.trim()) return
    setImporting(true)
    await new Promise(r => setTimeout(r, 1300))
    set('solicitation', 'Boiler Room HVAC Maintenance Service')
    set('solicitationId', 'FA' + Math.random().toString(36).slice(2, 10).toUpperCase())
    set('client', 'Andrews Air Force Base')
    set('naicsCode', '238220'); set('setAside', 'SB'); set('type', 'RECURRING')
    set('location', 'Camp Springs, MD'); set('dueDate', '2026-06-15')
    set('localTime', '16:00'); set('timezone', 'EST')
    set('pop', '1 base year + 4 option years')
    setImporting(false)
    toast.success('Details imported from SAM.gov!')
    setTab('details')
  }

  const handleCreate = () => {
    if (!form.solicitation?.trim()) { toast.error('Solicitation title is required'); setTab('details'); return }
    if (!form.dueDate) { toast.error('Due date is required'); setTab('schedule'); return }
    createOpportunity(form as Omit<Opportunity, 'id'>)
    toast.success('Opportunity created!')
    onClose()
  }

  return (
    <OppModalShell
      title="Create New Opportunity"
      tab={tab} setTab={setTab}
      onClose={onClose}
      extraHeader={
        <div className="flex gap-2">
          <input
            value={samUrl} onChange={e => setSamUrl(e.target.value)}
            className="input-field flex-1 text-sm"
            placeholder="Paste a SAM.gov URL to auto-fill all fields…"
          />
          <button type="button" onClick={handleImport} disabled={importing || !samUrl.trim()}
            className="btn-primary flex-shrink-0 disabled:opacity-40">
            {importing ? <Loader size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      }
      footer={
        <div className="flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {OPP_FORM_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`rounded-full transition-all ${tab === t.id ? 'w-6 h-2 bg-indigo-500' : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'}`} />
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleCreate} className="btn-primary">
              <Plus size={14} /> Create Opportunity
            </button>
          </div>
        </div>
      }
    >
      {/* ── Details tab ── */}
      {tab === 'details' && (
        <div className="space-y-5">
          <div>
            <label className={lbl}>Solicitation Title *</label>
            <input value={form.solicitation ?? ''} onChange={e => set('solicitation', e.target.value)} className="input-field" placeholder="Full solicitation title as listed on SAM.gov" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Solicitation ID</label>
              <input value={form.solicitationId ?? ''} onChange={e => set('solicitationId', e.target.value)} className="input-field" placeholder="W912EP-26-R-0001" />
            </div>
            <div>
              <label className={lbl}>Client / Agency</label>
              <input value={form.client ?? ''} onChange={e => set('client', e.target.value)} className="input-field" placeholder="Agency name" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Contract Type</label>
              <select value={form.type ?? 'OTJ'} onChange={e => set('type', e.target.value as any)} className="select-field">
                {['OTJ','RECURRING','BPA','IDIQ','S&D','SUPPLY'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Prime</label>
              <select value={form.prime ?? 'TECH-OR'} onChange={e => set('prime', e.target.value as any)} className="select-field">
                {['TECH-OR','AYJ-S','SANFORD','SAUDI'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Set Aside</label>
              <select value={form.setAside ?? 'SB'} onChange={e => set('setAside', e.target.value as any)} className="select-field">
                {['SB','SDVOSB','WOSB','HUBZone','VOSB','8(a)','UNRES'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>NAICS Code</label>
              <input value={form.naicsCode ?? ''} onChange={e => set('naicsCode', e.target.value)} className="input-field" placeholder="238220" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Priority</label>
              <select value={form.priority ?? 'MEDIUM'} onChange={e => set('priority', e.target.value as any)} className="select-field">
                {['HIGH','MEDIUM','LOW'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={form.status ?? 'ACTIVE'} onChange={e => set('status', e.target.value as OppStatus)} className="select-field">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Location</label>
              <input value={form.location ?? ''} onChange={e => set('location', e.target.value)} className="input-field" placeholder="City, State" />
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule tab ── */}
      {tab === 'schedule' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Due Date *</label>
              <input type="date" value={form.dueDate ?? ''} onChange={e => set('dueDate', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className={lbl}>Local Time (HH:MM)</label>
              <input value={form.localTime ?? ''} onChange={e => set('localTime', e.target.value)} className="input-field" placeholder="17:00" />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <select value={form.timezone ?? 'EST'} onChange={e => set('timezone', e.target.value)} className="select-field">
                {TZ_ABBREVS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {form.localTime && form.timezone && (
            <p className="text-[11px] text-indigo-600 -mt-2 flex items-center gap-1 font-medium">
              <Clock size={10} /> Your local: {convertTime(form.localTime, form.timezone)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Period of Performance</label>
              <input value={form.pop ?? ''} onChange={e => set('pop', e.target.value)} className="input-field" placeholder="1 base yr + 4 option yrs" />
            </div>
            <div>
              <label className={lbl}>SAM.gov Link</label>
              <input value={form.link ?? ''} onChange={e => set('link', e.target.value)} className="input-field" placeholder="https://sam.gov/opp/…" />
            </div>
            <div>
              <label className={lbl}>POC</label>
              <input value={form.poc ?? ''} onChange={e => set('poc', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className={lbl}>Mandatory Events</label>
              <input value={form.mandatoryEvents ?? ''} onChange={e => set('mandatoryEvents', e.target.value)} className="input-field" />
            </div>
          </div>
        </div>
      )}

      {/* ── Team & Finance tab ── */}
      {tab === 'team' && (
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Team Members</p>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lbl}>BDM *</label><input value={form.bdm ?? ''} onChange={e => set('bdm', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>BDS</label><input value={form.bds ?? ''} onChange={e => set('bds', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Support Agent</label><input value={form.supportAgent ?? ''} onChange={e => set('supportAgent', e.target.value)} className="input-field" /></div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Contract Value</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Contract Amount ($)</label>
                <input type="number" value={form.contractAmount ?? ''} onChange={e => set('contractAmount', Number(e.target.value))} className="input-field" />
              </div>
              <div>
                <label className={lbl}>Base Amount ($)</label>
                <input type="number" value={form.baseAmount ?? ''} onChange={e => set('baseAmount', Number(e.target.value))} className="input-field" />
              </div>
              <div>
                <label className={lbl}>Monthly Payment ($)</label>
                <input type="number" value={form.monthlyPayment ?? ''} onChange={e => set('monthlyPayment', Number(e.target.value))} className="input-field" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assignment tab ── */}
      {tab === 'assign' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Assign to a team member</p>
            <p className="text-xs text-slate-400 mb-4">
              Select anyone in the hierarchy. The ⚠ badge appears when they already have a contract ending on the same due date.
              {!form.dueDate && <span className="text-amber-600 font-medium"> — Set a due date in the Schedule tab to enable conflict detection.</span>}
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || undefined}
          />
        </div>
      )}
    </OppModalShell>
  )
}

// ── Row "..." Menu ────────────────────────────────────────────────────
function RowMenu({
  o,
  canSubmit,
  onViewDetails,
  onEdit,
  onSubk,
  onSubmit,
  onRequestDeletion,
  onMarkWon,
}: {
  o: Opportunity
  canSubmit: boolean
  onViewDetails: () => void
  onEdit: () => void
  onSubk: () => void
  onSubmit: () => void
  onRequestDeletion: () => void
  onMarkWon: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const submittable = ['ACTIVE', 'DISCUSSION', 'NEW_ASSIGNMENT'].includes(o.status)

  return (
    <div className="relative inline-block">
      {menuOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
      )}
      <button
        title="More actions"
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors relative z-30">
        <MoreHorizontal size={14} />
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute right-0 top-8 z-30 rounded-xl py-1 w-44"
            style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onViewDetails() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <ExternalLink size={12} /> View Details
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onMarkWon() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <Trophy size={12} /> Mark as WON
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <Edit2 size={12} /> Edit
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onSubk() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <Users2 size={12} /> Subcontractors
            </button>
            {canSubmit && submittable && (
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onSubmit() }}
                className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                <Send size={12} /> Submit
              </button>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onRequestDeletion() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#DC2626' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
              <Trash2 size={12} /> Request Deletion
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────
type SortKey = keyof Opportunity
type SortDir = 'asc' | 'desc'

const ROLE_LABEL: Record<string, string> = {
  MANAGER: 'Manager',
  OPERATIONS_MANAGER: 'Ops Manager',
  TEAM_MANAGER: 'Team Manager',
  ASSOCIATE: 'Associate',
}
const ROLE_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  MANAGER:            { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  OPERATIONS_MANAGER: { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  TEAM_MANAGER:       { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  ASSOCIATE:          { color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
}

export default function PipelinePage() {
  const { opportunities, employees, currentUser, markOpportunityWon } = useStore()
  const [search, setSearch]           = useState('')
  const [primeFilter, setPrimeFilter] = useState('All')
  const [typeFilter, setTypeFilter]   = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [period, setPeriod]           = useState<Period | null>(null)
  const [showCreate, setShowCreate]   = useState(false)
  const [editOpp, setEditOpp]         = useState<Opportunity | null>(null)
  const [subOpp, setSubOpp]           = useState<Opportunity | null>(null)
  const [submitOpp, setSubmitOpp]     = useState<Opportunity | null>(null)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [sort, setSort]               = useState<{ key: SortKey; dir: SortDir }>({ key: 'dueDate', dir: 'asc' })

  const canSubmit = ['ADMIN', 'BDM', 'BDS'].includes(currentUser?.role ?? '')

  const filtered = useMemo(() => {
    let list = opportunities.filter(o => !o.isDeleted)

    // Period filter (by dueDate)
    if (period) list = list.filter(o => filterByPeriod(o.dueDate, period))

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.solicitation.toLowerCase().includes(q) ||
        o.solicitationId.toLowerCase().includes(q) ||
        o.location.toLowerCase().includes(q) ||
        o.client.toLowerCase().includes(q) ||
        o.naicsCode.includes(q)
      )
    }
    if (primeFilter !== 'All') list = list.filter(o => o.prime === primeFilter)
    if (typeFilter !== 'All') list = list.filter(o => o.type === typeFilter)
    if (statusFilter !== 'All') list = list.filter(o => o.status === statusFilter)
    list.sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? ''
      const r = String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? r : -r
    })
    return list
  }, [opportunities, search, primeFilter, typeFilter, statusFilter, sort, period])

  const toggleSort = (key: SortKey) =>
    setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sort.key !== k) return <ChevronsUpDown size={9} className="text-slate-400" />
    return sort.dir === 'asc' ? <ChevronUp size={9} className="text-indigo-500" /> : <ChevronDown size={9} className="text-indigo-500" />
  }

  const hasFilters = search || primeFilter !== 'All' || typeFilter !== 'All' || statusFilter !== 'All'

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · PIPELINE</p>
          <h1 className="text-2xl font-black text-slate-900">General Pipeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={14} /> New Opportunity
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="glass rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-xs" placeholder="Search solicitation, ID, client, NAICS…" />
        </div>

        {/* Prime pills */}
        <div className="flex gap-1 flex-wrap">
          {PRIMES.map(p => (
            <button key={p} onClick={() => setPrimeFilter(p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${primeFilter === p
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'text-slate-500 border-slate-200 bg-white hover:text-slate-700'}`}>
              {p}
            </button>
          ))}
        </div>

        {/* Type pills */}
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${typeFilter === t
                ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                : 'text-slate-500 border-slate-200 bg-white hover:text-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="select-field text-xs py-1.5 w-auto min-w-[130px]">
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(''); setPrimeFilter('All'); setTypeFilter('All'); setStatusFilter('All') }}
            className="btn-ghost text-xs flex items-center gap-1 text-slate-500">
            <X size={11} /> Clear filters
          </button>
        )}

        <button className="btn-secondary ml-auto text-xs flex items-center gap-1.5">
          <Download size={12} /> Export
        </button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <Filter size={12} className="text-slate-400" />
          <p className="text-xs font-semibold text-slate-500">{filtered.length} results · Click any row for details</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { label: 'Prime', k: 'prime' }, { label: 'Priority', k: 'priority' },
                  { label: 'Period', k: 'period' }, { label: 'Captured', k: 'capturedOn' },
                  { label: 'Type', k: 'type' }, { label: 'NAICS', k: 'naicsCode' },
                  { label: 'ID', k: 'solicitationId' }, { label: 'Solicitation', k: 'solicitation' },
                  { label: 'Set Aside', k: 'setAside' }, { label: 'Due Date', k: 'dueDate' },
                  { label: 'Time / TZ', k: 'localTime' }, { label: 'Location', k: 'location' },
                  { label: 'Assigned', k: 'assignedTo' },
                  { label: 'Value', k: 'contractAmount' }, { label: 'Status', k: 'status' },
                  { label: 'Actions', k: '' },
                ].map(col => (
                  <th key={col.k || col.label}>
                    {col.k ? (
                      <button onClick={() => col.k && toggleSort(col.k as SortKey)}
                        className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                        {col.label} {col.k && <SortIcon k={col.k as SortKey} />}
                      </button>
                    ) : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((o, i) => (
                  <motion.tr key={o.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.015, duration: 0.2 }}
                    onClick={() => setSelectedOpp(o)}
                    className={`cursor-pointer ${o.deletionRequested ? 'opacity-50' : ''}`}>
                    <td><PrimeBadge p={o.prime} /></td>
                    <td><PriorityBadge p={o.priority} /></td>
                    <td className="text-slate-500 text-xs">{o.period}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{o.capturedOn}</td>
                    <td>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">{o.type}</span>
                    </td>
                    <td><span className="text-slate-500 text-xs font-mono">{o.naicsCode}</span></td>
                    <td><span className="text-indigo-600 text-xs font-mono font-semibold">{o.solicitationId}</span></td>
                    <td className="max-w-[200px]">
                      <p className="truncate text-xs text-slate-800 font-medium" title={o.solicitation}>{o.solicitation}</p>
                      {o.deletionRequested && <p className="text-[9px] text-amber-600">⚠ Deletion pending</p>}
                    </td>
                    <td>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{o.setAside}</span>
                    </td>
                    <td>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${dueDateColor(o.dueDate)}`}>
                        {new Date(o.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap group relative">
                      <span className="cursor-help">{o.localTime} {o.timezone}</span>
                      {o.localTime && o.timezone && (
                        <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 z-30 rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-lg font-medium" style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6366F1', boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}>
                          <Clock size={9} className="inline mr-1" />{convertTime(o.localTime, o.timezone)}
                        </div>
                      )}
                    </td>
                    <td><span className="text-slate-500 text-xs">{o.location}</span></td>
                    <td>
                      {(() => {
                        const emp = o.assignedTo ? employees.find(e => e.id === o.assignedTo) : null
                        if (!emp) return <span className="text-slate-400 text-xs">—</span>
                        const rc = ROLE_COLOR[emp.role] ?? ROLE_COLOR.ASSOCIATE
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-700 font-medium whitespace-nowrap">{emp.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
                              style={{ color: rc.color, background: rc.bg, border: `1px solid ${rc.border}` }}>
                              {ROLE_LABEL[emp.role] ?? emp.role}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td>
                      <span className="text-slate-700 text-xs font-semibold whitespace-nowrap">
                        {o.contractAmount ? formatCurrency(o.contractAmount) : '—'}
                        {o.monthlyPayment ? <span className="block text-[10px] text-slate-400">{formatCurrency(o.monthlyPayment)}/mo</span> : null}
                      </span>
                    </td>
                    <td><StatusBadge s={o.status} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button title="Edit" onClick={() => setEditOpp(o)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                          <Edit2 size={12} />
                        </button>
                        <button title="Subcontractors" onClick={() => setSubOpp(o)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-all">
                          <Users2 size={12} />
                        </button>
                        {canSubmit && ['ACTIVE', 'DISCUSSION', 'NEW_ASSIGNMENT'].includes(o.status) && (
                          <button title="Submit proposal" onClick={() => setSubmitOpp(o)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                            <Send size={12} />
                          </button>
                        )}
                        <RowMenu
                          o={o}
                          canSubmit={canSubmit}
                          onViewDetails={() => setSelectedOpp(o)}
                          onEdit={() => setEditOpp(o)}
                          onSubk={() => setSubOpp(o)}
                          onSubmit={() => setSubmitOpp(o)}
                          onRequestDeletion={() => setEditOpp(o)}
                          onMarkWon={() => { markOpportunityWon(o.id); toast.success('Marked as WON → moved to Fresh Awards!') }}
                        />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">No opportunities match the current filters</div>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        isOpen={!!selectedOpp}
        onClose={() => setSelectedOpp(null)}
        title={selectedOpp?.solicitation ?? ''}
        subtitle={selectedOpp ? `${selectedOpp.solicitationId} · ${selectedOpp.client}` : ''}
        width={500}
      >
        {selectedOpp && (
          <>
            <div className="flex gap-2 flex-wrap mb-5">
              <StatusBadge s={selectedOpp.status} />
              <PriorityBadge p={selectedOpp.priority} />
              <PrimeBadge p={selectedOpp.prime} />
            </div>

            <DrawerSection title="Overview">
              <DrawerField label="Client"      value={selectedOpp.client} />
              <DrawerField label="Type"        value={selectedOpp.type} />
              <DrawerField label="Set-Aside"   value={selectedOpp.setAside} />
              <DrawerField label="NAICS"       value={selectedOpp.naicsCode} />
              <DrawerField label="Location"    value={selectedOpp.location} />
              <DrawerField label="Period"      value={selectedOpp.period} />
            </DrawerSection>

            <DrawerSection title="Team">
              <DrawerField label="Support Agent" value={selectedOpp.supportAgent ?? '—'} />
              <DrawerField label="Assigned To"   value={(() => {
                const emp = selectedOpp.assignedTo ? employees.find(e => e.id === selectedOpp.assignedTo) : null
                if (!emp) return '—'
                const rc = ROLE_COLOR[emp.role] ?? ROLE_COLOR.ASSOCIATE
                return (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-800">{emp.name}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: rc.color, background: rc.bg, border: `1px solid ${rc.border}` }}>
                      {ROLE_LABEL[emp.role] ?? emp.role}
                    </span>
                  </span>
                )
              })()} />
            </DrawerSection>

            <DrawerSection title="Schedule">
              <DrawerField label="Due Date"  value={new Date(selectedOpp.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
              <DrawerField label="Time"      value={selectedOpp.localTime ? `${selectedOpp.localTime} ${selectedOpp.timezone ?? ''}` : '—'} />
              {selectedOpp.localTime && selectedOpp.timezone && (
                <DrawerField label="Your Local" value={
                  <span className="text-indigo-600 font-semibold">{convertTime(selectedOpp.localTime, selectedOpp.timezone)}</span>
                } />
              )}
              <DrawerField label="Captured"  value={selectedOpp.capturedOn} />
            </DrawerSection>

            <DrawerSection title="Financials">
              <DrawerField label="Contract Amount"  value={selectedOpp.contractAmount ? formatCurrency(selectedOpp.contractAmount) : '—'} />
              <DrawerField label="Base Amount"      value={selectedOpp.baseAmount ? formatCurrency(selectedOpp.baseAmount) : '—'} />
              <DrawerField label="Monthly Payment"  value={selectedOpp.monthlyPayment ? formatCurrency(selectedOpp.monthlyPayment) + '/mo' : '—'} />
              <DrawerField label="Period of Perf."  value={selectedOpp.pop ?? '—'} />
            </DrawerSection>

            {selectedOpp.subcontractors && selectedOpp.subcontractors.length > 0 && (
              <DrawerSection title={`Subcontractors (${selectedOpp.subcontractors.length})`}>
                {selectedOpp.subcontractors.map(s => (
                  <div key={s.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <p className="text-sm font-semibold text-slate-800">{s.companyName}</p>
                    <p className="text-xs text-slate-500">{s.contactName} · {s.setAside}</p>
                  </div>
                ))}
              </DrawerSection>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setEditOpp(selectedOpp) }}>
                <Edit2 size={12} /> Edit
              </button>
              <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSubOpp(selectedOpp) }}>
                <Users2 size={12} /> Subcontractors
              </button>
              {canSubmit && ['ACTIVE', 'DISCUSSION', 'NEW_ASSIGNMENT'].includes(selectedOpp.status) && (
                <button className="btn-primary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSubmitOpp(selectedOpp) }}>
                  <Send size={12} /> Submit Proposal
                </button>
              )}
            </div>
          </>
        )}
      </DetailDrawer>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
        {editOpp && <EditModal opp={editOpp} onClose={() => setEditOpp(null)} />}
        {subOpp && <SubcontractorModal opp={subOpp} onClose={() => setSubOpp(null)} />}
        {submitOpp && <SubmitModal opp={submitOpp} onClose={() => setSubmitOpp(null)} />}
      </AnimatePresence>
    </div>
  )
}
