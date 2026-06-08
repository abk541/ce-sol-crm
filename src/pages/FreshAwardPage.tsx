import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, UserPlus, ArrowRight, CheckCircle2, Clock,
  Building2, DollarSign, MapPin, Calendar, Briefcase,
  ChevronRight, X, Check, MoreHorizontal, Pencil, Paperclip,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { hasPermission } from '../lib/permissions'
import type { FreshAward, ContractType, SetAside, FileAttachment } from '../types'
import { formatCurrency, useEscapeKey } from '../lib/utils'
import toast from 'react-hot-toast'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'

const STATUS_META = {
  PENDING_ASSIGNMENT: { label: 'Pending Assignment', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  ASSIGNED:           { label: 'Assigned',           color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  MOVED_TO_ACTIVE:    { label: 'Moved to Active',    color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
}

type OperationsRole = 'OPERATIONS_MANAGER' | 'OPERATIONS_TEAM_LEAD' | 'CONTRACT_SPECIALIST'

interface OperationsPerson {
  id: string
  name: string
  role: OperationsRole
  managerId: string | null
}

const OPERATIONS_PEOPLE: OperationsPerson[] = [
  { id: 'ops-mgr-1', name: 'Nadia El Mansouri', role: 'OPERATIONS_MANAGER', managerId: null },
  { id: 'ops-mgr-2', name: 'Youssef Benali', role: 'OPERATIONS_MANAGER', managerId: null },
  { id: 'ops-tl-1', name: 'Salma Idrissi', role: 'OPERATIONS_TEAM_LEAD', managerId: 'ops-mgr-1' },
  { id: 'ops-tl-2', name: 'Omar Haddad', role: 'OPERATIONS_TEAM_LEAD', managerId: 'ops-mgr-1' },
  { id: 'ops-tl-3', name: 'Leila Berrada', role: 'OPERATIONS_TEAM_LEAD', managerId: 'ops-mgr-2' },
  { id: 'ops-tl-4', name: 'Karim Alaoui', role: 'OPERATIONS_TEAM_LEAD', managerId: 'ops-mgr-2' },
  { id: 'ops-cs-1', name: 'Hiba Amrani', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-1' },
  { id: 'ops-cs-2', name: 'Adam Chraibi', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-1' },
  { id: 'ops-cs-3', name: 'Ines Tazi', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-2' },
  { id: 'ops-cs-4', name: 'Rayan El Fassi', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-2' },
  { id: 'ops-cs-5', name: 'Sara Lahlou', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-3' },
  { id: 'ops-cs-6', name: 'Mehdi Skalli', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-3' },
  { id: 'ops-cs-7', name: 'Amine Belkadi', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-4' },
  { id: 'ops-cs-8', name: 'Meryem Rami', role: 'CONTRACT_SPECIALIST', managerId: 'ops-tl-4' },
]

const OPERATION_MANAGERS = OPERATIONS_PEOPLE.filter(person => person.role === 'OPERATIONS_MANAGER')

const OPS_ROLE_LABEL: Record<OperationsRole, string> = {
  OPERATIONS_MANAGER: 'Operations Manager',
  OPERATIONS_TEAM_LEAD: 'Operations Team Lead',
  CONTRACT_SPECIALIST: 'Contract Specialist',
}

const OPS_ROLE_AVATAR_CLS: Record<OperationsRole, string> = {
  OPERATIONS_MANAGER: 'bg-[#102820] text-[#D7BE7A] border-[#D7BE7A]/40',
  OPERATIONS_TEAM_LEAD: 'bg-[#0A1D2B] text-[#7DD3FC] border-[#7DD3FC]/35',
  CONTRACT_SPECIALIST: 'bg-[#082F49] text-[#A5F3FC] border-[#A5F3FC]/35',
}

const OPS_COLUMN_DEFS: { role: OperationsRole; header: string }[] = [
  { role: 'OPERATIONS_MANAGER', header: 'Operations Managers' },
  { role: 'OPERATIONS_TEAM_LEAD', header: 'Operations Team Leads' },
  { role: 'CONTRACT_SPECIALIST', header: 'Contract Specialists' },
]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')

interface AssignModalProps {
  award: FreshAward
  onClose: () => void
  onMove: (id: string, assignments?: Partial<FreshAward>) => void
}

function OperationsAssignPicker({
  managerId,
  teamLeadId,
  specialistId,
  onManagerChange,
  onTeamLeadChange,
  onSpecialistChange,
}: {
  managerId: string
  teamLeadId: string
  specialistId: string
  onManagerChange: (id: string) => void
  onTeamLeadChange: (id: string) => void
  onSpecialistChange: (id: string) => void
}) {
  const selectionChain = [managerId || undefined, teamLeadId || undefined, specialistId || undefined]
  const selectedPerson = specialistId
    ? OPERATIONS_PEOPLE.find(person => person.id === specialistId)
    : teamLeadId
      ? OPERATIONS_PEOPLE.find(person => person.id === teamLeadId)
      : managerId
        ? OPERATIONS_PEOPLE.find(person => person.id === managerId)
        : undefined

  const getColumnItems = (colIdx: number) => {
    const role = OPS_COLUMN_DEFS[colIdx].role
    const allAtTier = OPERATIONS_PEOPLE.filter(person => person.role === role)

    if (colIdx === 0) {
      return allAtTier.map(person => ({ person, enabled: true }))
    }

    const parentId = selectionChain[colIdx - 1]
    if (!parentId) {
      return allAtTier.map(person => ({ person, enabled: false }))
    }

    return allAtTier
      .filter(person => person.managerId === parentId)
      .map(person => ({ person, enabled: true }))
  }

  const handleSelect = (person: OperationsPerson, enabled: boolean) => {
    if (!enabled) return

    if (person.role === 'OPERATIONS_MANAGER') {
      onManagerChange(person.id)
      onTeamLeadChange('')
      onSpecialistChange('')
      return
    }

    if (person.role === 'OPERATIONS_TEAM_LEAD') {
      onTeamLeadChange(person.id)
      onSpecialistChange('')
      return
    }

    onSpecialistChange(person.id)
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        Select Operations Team
      </label>

      <div className="grid overflow-hidden rounded-2xl border border-[#D7BE7A]/20 bg-[#06131F]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-3">
        {OPS_COLUMN_DEFS.map((col, colIdx) => {
          const items = getColumnItems(colIdx)
          const selectedId = selectionChain[colIdx]

          return (
            <div
              key={col.role}
              className="min-w-0 border-b border-[#D7BE7A]/20 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:border-[#D7BE7A]/20"
            >
              <div className="border-b border-[#D7BE7A]/20 bg-[#0A1D2B] px-4 py-3">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">
                  {col.header}
                </p>
              </div>

              <div className="max-h-[min(34vh,320px)] min-h-[210px] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-8 text-center text-[11px] text-slate-500">No options</div>
                )}
                {items.map(({ person, enabled }) => {
                  const isSelected = selectedId === person.id

                  return (
                    <button
                      key={person.id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => handleSelect(person, enabled)}
                      className={[
                        'w-full border-b border-[#D7BE7A]/10 px-4 py-3 text-left transition-all last:border-b-0',
                        enabled ? 'cursor-pointer hover:bg-[#D7BE7A]/10' : 'cursor-default opacity-35',
                        isSelected ? 'border-l-2 border-l-[#D7BE7A] bg-[#D7BE7A]/20 shadow-[inset_0_0_0_1px_rgba(215,190,122,0.10)]' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${OPS_ROLE_AVATAR_CLS[person.role]}`}>
                          {initials(person.name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${isSelected ? 'text-[#F8FBF7]' : 'text-slate-100'}`}>
                            {person.name}
                          </p>
                          <p className="truncate text-[10px] font-medium text-slate-400">{OPS_ROLE_LABEL[person.role]}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                              Operations
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selectedPerson && (
        <div
          className="mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ background: 'rgba(184,145,78,0.12)', borderColor: 'rgba(215,190,122,0.28)' }}
        >
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${OPS_ROLE_AVATAR_CLS[selectedPerson.role]}`}>
            {initials(selectedPerson.name)}
          </div>
          <p className="min-w-0 text-sm font-bold text-[#F8FBF7]">
            Assigned to: {selectedPerson.name}
            {' - '}{OPS_ROLE_LABEL[selectedPerson.role]}
          </p>
        </div>
      )}
    </div>
  )
}

// Edit modal for fixing typos / metadata after award creation
const FA_TYPES: ContractType[] = ['OTJ', 'RECURRING', 'BPA', 'IDIQ', 'S&D', 'SUPPLY']
const FA_SETASIDES: SetAside[] = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']

function EditModal({ award, onClose }: { award: FreshAward; onClose: () => void }) {
  const updateFreshAward = useStore(s => s.updateFreshAward)
  const [form, setForm] = useState({
    solicitation: award.solicitation,
    solicitationId: award.solicitationId,
    client: award.client,
    type: award.type,
    setAside: award.setAside,
    naicsCode: award.naicsCode,
    contractAmount: award.contractAmount?.toString() ?? '',
    baseAmount: award.baseAmount?.toString() ?? '',
    monthlyPayment: award.monthlyPayment?.toString() ?? '',
    pop: award.pop ?? '',
    location: award.location ?? '',
    awardedDate: award.awardedDate,
    notes: award.notes ?? '',
  })
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const parseNum = (v: string): number | undefined => {
    if (v.trim() === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  const handleSave = () => {
    if (!form.solicitation.trim() || !form.solicitationId.trim() || !form.client.trim() || !form.awardedDate) {
      toast.error('Solicitation, ID, Client and Awarded Date are required')
      return
    }
    const numFields = ['contractAmount', 'baseAmount', 'monthlyPayment'] as const
    for (const k of numFields) {
      const raw = form[k]
      if (raw.trim() !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
        toast.error(`${k} must be a non-negative number`)
        return
      }
    }
    const patch: Partial<FreshAward> = {
      solicitation: form.solicitation.trim(),
      solicitationId: form.solicitationId.trim(),
      client: form.client.trim(),
      type: form.type,
      setAside: form.setAside,
      naicsCode: form.naicsCode.trim(),
      contractAmount: parseNum(form.contractAmount),
      baseAmount: parseNum(form.baseAmount),
      monthlyPayment: parseNum(form.monthlyPayment),
      pop: form.pop.trim() || undefined,
      location: form.location.trim() || undefined,
      awardedDate: form.awardedDate,
      notes: form.notes.trim() || undefined,
    }
    updateFreshAward(award.id, patch)
    toast.success('Fresh award updated')
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="fa-edit-modal"
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ y: 16, scale: 0.97, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 12, scale: 0.97, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Pencil size={15} className="text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Edit Fresh Award</p>
              <h2 className="text-sm font-bold text-slate-800 truncate">{award.solicitation}</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>

          <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Solicitation *</label>
              <input value={form.solicitation} onChange={e => set('solicitation', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Solicitation ID *</label>
              <input value={form.solicitationId} onChange={e => set('solicitationId', e.target.value)} className="input-field text-xs py-2 w-full font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Client *</label>
              <input value={form.client} onChange={e => set('client', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className="input-field text-xs py-2 w-full">
                {FA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Set-Aside</label>
              <select value={form.setAside} onChange={e => set('setAside', e.target.value)} className="input-field text-xs py-2 w-full">
                {FA_SETASIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NAICS Code</label>
              <input value={form.naicsCode} onChange={e => set('naicsCode', e.target.value)} className="input-field text-xs py-2 w-full font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Awarded Date *</label>
              <input type="date" value={form.awardedDate} onChange={e => set('awardedDate', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Amount</label>
              <input type="number" min="0" step="0.01" value={form.contractAmount} onChange={e => set('contractAmount', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Base Amount</label>
              <input type="number" min="0" step="0.01" value={form.baseAmount} onChange={e => set('baseAmount', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Payment</label>
              <input type="number" min="0" step="0.01" value={form.monthlyPayment} onChange={e => set('monthlyPayment', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Period of Performance</label>
              <input value={form.pop} onChange={e => set('pop', e.target.value)} className="input-field text-xs py-2 w-full" placeholder="e.g. 12 months" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)} className="input-field text-xs py-2 w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field text-xs py-2 w-full resize-none" />
            </div>
          </div>

          <div className="flex gap-2 border-t border-slate-200 px-5 py-4 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary flex-1 text-xs justify-center">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1 text-xs gap-1.5 justify-center">
              <Check size={12} /> Save Changes
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

function AssignModal({ award, onClose, onMove }: AssignModalProps) {
  const existingManager = OPERATION_MANAGERS.find(person => person.name === award.assignedBDM)
  const existingTeamLead = OPERATIONS_PEOPLE.find(person => person.role === 'OPERATIONS_TEAM_LEAD' && person.name === award.assignedBDS)
  const existingSpecialist = OPERATIONS_PEOPLE.find(person => person.role === 'CONTRACT_SPECIALIST' && person.name === award.assignedSupportAgent)
  const [operationsManagerId, setOperationsManagerId] = useState(existingManager?.id || '')
  const [operationsTeamLeadId, setOperationsTeamLeadId] = useState(
    existingTeamLead && existingTeamLead.managerId === existingManager?.id ? existingTeamLead.id : '',
  )
  const [contractSpecialistId, setContractSpecialistId] = useState(
    existingSpecialist && existingSpecialist.managerId === existingTeamLead?.id ? existingSpecialist.id : '',
  )

  const selectedManager = OPERATIONS_PEOPLE.find(person => person.id === operationsManagerId)
  const selectedTeamLead = OPERATIONS_PEOPLE.find(person => person.id === operationsTeamLeadId)
  const selectedSpecialist = OPERATIONS_PEOPLE.find(person => person.id === contractSpecialistId)
  const allAssigned = selectedManager && selectedTeamLead && selectedSpecialist

  useEscapeKey(onClose)

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] grid place-items-center px-4 py-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#020B12]/75 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative z-10 flex max-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#D7BE7A]/25 bg-[#07131F] shadow-[0_28px_90px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.04)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#D7BE7A]/15 bg-gradient-to-r from-[#0B1B2A] via-[#0A2327] to-[#102820] px-6 py-5">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D7BE7A]">Assignment</p>
            <h2 className="text-xl font-black tracking-tight text-[#F8FBF7]">Assign Fresh Award</h2>
            <p className="max-w-3xl truncate text-sm text-slate-300" title={award.solicitation}>{award.solicitation}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-all hover:border-[#D7BE7A]/35 hover:bg-[#D7BE7A]/10 hover:text-white"
            aria-label="Close assignment modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 grid gap-3 rounded-2xl border border-[#D7BE7A]/20 bg-white/[0.035] p-4 text-xs text-slate-300 md:grid-cols-4">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Solicitation ID</p>
              <p className="truncate font-mono text-[#F8FBF7]">{award.solicitationId || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Agency</p>
              <p className="truncate text-[#F8FBF7]">{award.client || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Awarded Date</p>
              <p className="truncate text-[#F8FBF7]">{award.awardedDate ? new Date(award.awardedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Value</p>
              <p className="truncate font-bold text-emerald-300">{formatCurrency(award.contractAmount || 0)}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</p>
              <p className="truncate text-[#F8FBF7]">{award.type || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Set Aside</p>
              <p className="truncate text-[#F8FBF7]">{award.setAside || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">NAICS</p>
              <p className="truncate font-mono text-[#F8FBF7]">{award.naicsCode || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Location</p>
              <p className="truncate text-[#F8FBF7]">{award.location || '-'}</p>
            </div>
          </div>

          <OperationsAssignPicker
            managerId={operationsManagerId}
            teamLeadId={operationsTeamLeadId}
            specialistId={contractSpecialistId}
            onManagerChange={setOperationsManagerId}
            onTeamLeadChange={setOperationsTeamLeadId}
            onSpecialistChange={setContractSpecialistId}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-[#D7BE7A]/15 bg-[#07131F]/95 px-6 py-4 sm:flex-row">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button
            disabled={!allAssigned}
            onClick={() => {
              const assignments = {
                assignedBDM: selectedManager?.name,
                assignedBDS: selectedTeamLead?.name,
                assignedSPM: undefined,
                assignedPM: undefined,
                assignedSupportAgent: selectedSpecialist?.name,
              }
              onMove(award.id, assignments)
              toast.success('Assigned and moved to Contract Admin')
              onClose()
            }}
            className="btn-primary flex-1 justify-center disabled:opacity-40"
          >
            <Check size={14} /> Confirm Assignment
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export default function FreshAwardPage() {
  const { freshAwards, moveFreshAwardToActive, currentUser, opportunities } = useStore()
  const canEdit = hasPermission(currentUser, 'opportunity:edit')
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')
  const [selected, setSelected] = useState<FreshAward | null>(null)
  const [editTarget, setEditTarget] = useState<FreshAward | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'MOVED_TO_ACTIVE'>('ALL')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!globalRecordId) return
    const target = freshAwards.find(fa => fa.id === globalRecordId || fa.solicitationId === globalRecordId)
    if (!target) return
    setFilter(target.status)
    setSelected(target)
  }, [globalRecordId, freshAwards])

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
          const sourceOpp = fa.opportunityId ? opportunities.find(o => o.id === fa.opportunityId) : undefined
          const proposalAttachments: FileAttachment[] = sourceOpp?.proposalAttachments ?? []
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
                    <FloatingActionMenu
                      open={menuOpen === fa.id}
                      onOpenChange={open => setMenuOpen(open ? fa.id : null)}
                      trigger={<MoreHorizontal size={13} />}
                      triggerClassName="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                              <button
                                onClick={() => { setSelected(fa); setMenuOpen(null) }}
                                className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                                style={{ color: '#475569' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                              >
                                Assign Operations
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => { setEditTarget(fa); setMenuOpen(null) }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors"
                                  style={{ color: '#B45309' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                                >
                                  <Pencil size={11} /> Edit Details
                                </button>
                              )}
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
                    </FloatingActionMenu>
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
                  {proposalAttachments.length > 0 && (
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <Paperclip size={11} /> Proposal
                      </span>
                      {proposalAttachments.map(att => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => {
                            if (!att.dataUrl) {
                              toast.error('Proposal file has metadata only — re-upload it from the opportunity.')
                              return
                            }
                            const link = document.createElement('a')
                            link.href = att.dataUrl
                            link.download = att.name || 'proposal'
                            link.rel = 'noopener'
                            document.body.appendChild(link)
                            link.click()
                            link.remove()
                          }}
                          title={att.name}
                          className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                        >
                          <span className="truncate">{att.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assigned team (if any) */}
                {fa.status !== 'PENDING_ASSIGNMENT' && (
                  <div className="mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Team</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      {fa.assignedBDM && <div><span className="text-slate-400">Operations Manager:</span> <span className="font-semibold text-slate-700">{fa.assignedBDM}</span></div>}
                      {fa.assignedBDS && <div><span className="text-slate-400">Operations Team Lead:</span> <span className="font-semibold text-slate-700">{fa.assignedBDS}</span></div>}
                      {fa.assignedSupportAgent && <div><span className="text-slate-400">Contract Specialist:</span> <span className="font-semibold text-slate-700">{fa.assignedSupportAgent}</span></div>}
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
                        {fa.status === 'PENDING_ASSIGNMENT' ? 'Assign Operations' : 'Edit Assignment'}
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
            onMove={moveFreshAwardToActive}
          />
        )}
      </AnimatePresence>

      {editTarget && (
        <EditModal award={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}
