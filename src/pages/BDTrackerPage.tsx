import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Edit2, Filter, MoreHorizontal, Paperclip, RotateCcw, Search, Trash2, TrendingUp, UploadCloud, Users2, X } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { BDSubmission, ContractType, FileAttachment, Opportunity, SetAside } from '../types'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import { getAssignmentChain } from '../lib/team'
import { formatCurrency } from '../lib/utils'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'
import { hasPermission } from '../lib/permissions'
import DetailDrawer, { DrawerField, DrawerSection } from '../components/shared/DetailDrawer'
import SamGovListingButton from '../components/shared/SamGovListingButton'
import {
  formatOpportunityMoroccoDueDateTime,
  formatOpportunitySourceDueDateTime,
  SourcingModal,
} from './PipelinePage'

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
const CONTRACT_TYPES: ContractType[] = ['OTJ', 'RECURRING', 'BPA', 'IDIQ', 'S&D']
const SET_ASIDES: SetAside[] = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']

function typeLabel(value: string) {
  return value === 'S&D' || value === 'SUPPLY' ? 'S&D' : value
}

function rowOpportunity(row: BDSubmission, opportunities: ReturnType<typeof useStore.getState>['opportunities']) {
  return opportunities.find(o => o.solicitationId === row.solicitationId)
}

function downloadProposalAttachment(att: FileAttachment) {
  if (!att.dataUrl) {
    toast.error('Proposal file has metadata only — re-upload it from the opportunity to download.')
    return
  }
  const link = document.createElement('a')
  link.href = att.dataUrl
  link.download = att.name || 'proposal'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function fileToProposalAttachment(file: File, uploadedBy: string): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        attachedAt: new Date().toISOString(),
        uploadedBy,
        dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
        mimeType: file.type || undefined,
        size: file.size,
      })
    }
    reader.onerror = () => reject(new Error('File could not be read.'))
    reader.readAsDataURL(file)
  })
}

function ProposalCell({ attachments }: { attachments: FileAttachment[] }) {
  const [open, setOpen] = useState(false)
  if (!attachments.length) return <span className="text-xs text-slate-300">—</span>
  if (attachments.length === 1) {
    const att = attachments[0]
    return (
      <button
        type="button"
        onClick={() => downloadProposalAttachment(att)}
        title={att.name}
        className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
      >
        <Paperclip size={11} /> Proposal
      </button>
    )
  }
  return (
    <FloatingActionMenu
      open={open}
      onOpenChange={setOpen}
      trigger={
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100">
          <Paperclip size={11} /> {attachments.length} files
        </span>
      }
    >
      {attachments.map(att => (
        <button
          key={att.id}
          onClick={() => { downloadProposalAttachment(att); setOpen(false) }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          title={att.name}
        >
          <Paperclip size={11} className="text-slate-400" />
          <span className="max-w-[200px] truncate">{att.name}</span>
        </button>
      ))}
    </FloatingActionMenu>
  )
}

function formatSubmittedOn(value: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatStatusLabel(status: BDTab) {
  return BD_TABS.find(tab => tab.key === status)?.label ?? status.replace(/_/g, ' ')
}

function trackerEditInitial(row: BDSubmission, opp?: Opportunity | null) {
  return {
    solicitation: row.solicitation ?? '',
    client: opp?.client ?? '',
    type: row.type,
    setAside: row.setAside,
    naicsCode: opp?.naicsCode ?? '',
    dueDate: row.dueDate ?? '',
    localTime: opp?.localTime ?? row.localTime ?? '',
    timezone: opp?.timezone ?? '',
    location: row.location ?? '',
    value: String(row.value ?? 0),
    comment: row.comment ?? '',
    mandatoryEvents: opp?.mandatoryEvents ?? '',
    proposalAttachments: opp?.proposalAttachments ?? [],
  }
}

type TrackerEditForm = ReturnType<typeof trackerEditInitial>
type TrackerStringField = Exclude<keyof TrackerEditForm, 'proposalAttachments'>

function BDTrackerEditModal({
  row,
  opportunity,
  uploadedBy,
  onClose,
  onSave,
}: {
  row: BDSubmission
  opportunity?: Opportunity | null
  uploadedBy: string
  onClose: () => void
  onSave: (form: TrackerEditForm) => Promise<boolean>
}) {
  const [form, setForm] = useState(() => trackerEditInitial(row, opportunity))
  const [saving, setSaving] = useState(false)
  const update = (key: TrackerStringField, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const addProposalFiles = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const attachments = await Promise.all(Array.from(files).map(file => fileToProposalAttachment(file, uploadedBy)))
      setForm(prev => ({ ...prev, proposalAttachments: [...prev.proposalAttachments, ...attachments] }))
      toast.success(files.length === 1 ? 'Proposal file added.' : `${files.length} proposal files added.`)
    } catch {
      toast.error('Proposal file could not be uploaded.')
    }
  }

  const removeProposalFile = (id: string) => {
    setForm(prev => ({
      ...prev,
      proposalAttachments: prev.proposalAttachments.filter(att => att.id !== id),
    }))
  }

  const save = async () => {
    if (!form.solicitation.trim()) {
      toast.error('Solicitation title is required.')
      return
    }
    setSaving(true)
    const saved = await onSave(form)
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <DetailDrawer
      isOpen
      onClose={onClose}
      title="Edit Tracker Details"
      subtitle={`${row.solicitationId} - ${row.solicitation}`}
      width={840}
      placement="modal"
      showBackdrop
      variant="premium"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#D7BE7A]/20 bg-[#06131F]/90 p-4">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#D7BE7A]">BD Tracker Record</p>
          <p className="text-sm leading-6 text-slate-300">
            These fields update the tracker row. When the original opportunity is still linked, matching opportunity fields are updated too.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Solicitation *</span>
            <input className="input-field w-full" value={form.solicitation} onChange={e => update('solicitation', e.target.value)} />
          </label>
          {opportunity && (
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Agency / Client</span>
              <input className="input-field w-full" value={form.client} onChange={e => update('client', e.target.value)} />
            </label>
          )}
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Contract Type</span>
            <select className="input-field w-full" value={form.type} onChange={e => update('type', e.target.value)}>
              {CONTRACT_TYPES.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Set Aside</span>
            <select className="input-field w-full" value={form.setAside} onChange={e => update('setAside', e.target.value)}>
              {SET_ASIDES.map(setAside => <option key={setAside} value={setAside}>{setAside}</option>)}
            </select>
          </label>
          {opportunity && (
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">NAICS</span>
              <input className="input-field w-full" value={form.naicsCode} onChange={e => update('naicsCode', e.target.value)} />
            </label>
          )}
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Due Date</span>
            <input className="input-field w-full" value={form.dueDate} onChange={e => update('dueDate', e.target.value)} placeholder="YYYY-MM-DD" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Source Time</span>
            <input className="input-field w-full opacity-70" value={form.localTime || '-'} disabled />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Location</span>
            <input className="input-field w-full" value={form.location} onChange={e => update('location', e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Value</span>
            <input className="input-field w-full" type="number" min="0" value={form.value} onChange={e => update('value', e.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Comment</span>
            <textarea className="input-field min-h-[90px] w-full resize-none" value={form.comment} onChange={e => update('comment', e.target.value)} />
          </label>
          {opportunity && (
            <label className="md:col-span-2">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Mandatory Events</span>
              <textarea className="input-field min-h-[90px] w-full resize-none" value={form.mandatoryEvents} onChange={e => update('mandatoryEvents', e.target.value)} />
            </label>
          )}
        </div>

        {opportunity && (
          <div className="rounded-2xl border border-[#D7BE7A]/20 bg-[#06131F]/90 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D7BE7A]">Proposal Files</p>
                <p className="mt-1 text-xs text-slate-400">Upload replacements or remove files before saving.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D7BE7A]/25 bg-[#D7BE7A]/10 px-3 py-2 text-xs font-black text-[#F8FBF7] transition-colors hover:bg-[#D7BE7A]/20">
                <UploadCloud size={14} />
                Add file
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={event => {
                    void addProposalFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>

            {form.proposalAttachments.length > 0 ? (
              <div className="space-y-2">
                {form.proposalAttachments.map(att => (
                  <div key={att.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D7BE7A]/15 bg-white/5 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => downloadProposalAttachment(att)}
                      className="min-w-0 flex-1 text-left text-xs font-semibold text-slate-200 hover:text-[#F8FBF7]"
                      title={att.name}
                    >
                      <Paperclip size={12} className="mr-2 inline text-[#D7BE7A]" />
                      <span className="align-middle">{att.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeProposalFile(att.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-200 transition-colors hover:bg-rose-500/20"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[#D7BE7A]/20 bg-white/5 px-3 py-4 text-center text-xs font-semibold text-slate-400">
                No proposal files attached.
              </p>
            )}
          </div>
        )}

        <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-3 border-t border-[#D7BE7A]/15 bg-[#07131F]/95 px-6 py-4 backdrop-blur">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Details'}</button>
        </div>
      </div>
    </DetailDrawer>
  )
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
      <div className="relative">
        <input value={value} list={id} onChange={e => onChange(e.target.value)} className={`input-field w-full py-1.5 text-xs ${value ? 'pr-7' : ''}`} placeholder={placeholder} />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
            aria-label={`Clear ${label} filter`}
            title={`Clear ${label}`}
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <datalist id={id}>
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

export default function BDTrackerPage() {
  const {
    bdSubmissions,
    updateBDSubmission,
    updateBDSubmissionDetails,
    deleteBDSubmission,
    returnBDSubmissionToPipeline,
    updateOpportunity,
    opportunities,
    employees,
    currentUser,
  } = useStore()
  const canEditOpportunities = hasPermission(currentUser, 'opportunity:edit')
  const canDeleteSubmitted = hasPermission(currentUser, 'opportunity:deleteApprove')
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null)
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [sourcingOpp, setSourcingOpp] = useState<Opportunity | null>(null)
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')
  const globalTab = searchParams.get('tab') as BDTab | null
  const [tab, setTab] = useState<BDTab>('SUBMITTED')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS }))
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)

  useEffect(() => {
    const target = globalRecordId
      ? bdSubmissions.find(row => String(row.id) === globalRecordId || row.solicitationId === globalRecordId)
      : undefined
    const targetTab = target?.status || (globalTab && BD_TABS.some(t => t.key === globalTab) ? globalTab : null)

    if (targetTab) setTab(targetTab)
    if (target) {
      setSearch(target.solicitationId || target.solicitation)
      setFilters({ ...EMPTY_FILTERS })
      setPeriod(null)
      setPage(1)
    }
  }, [globalRecordId, globalTab, bdSubmissions])

  const filterOptions = useMemo(() => {
    return FILTERS.reduce((acc, filter) => {
      const values = bdSubmissions
        .map(row => filterValue(row, filter.key, opportunities, employees).trim())
        .filter(Boolean)
      acc[filter.key] = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
      return acc
    }, {} as Record<FilterKey, string[]>)
  }, [bdSubmissions, opportunities, employees])

  const baseFiltered = useMemo(() => {
    let list = [...bdSubmissions]
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
  }, [bdSubmissions, period, search, filters, opportunities, employees])

  const filtered = useMemo(() => baseFiltered.filter(s => s.status === tab), [baseFiltered, tab])

  const totalRows = filtered.length
  const perPageNum = perPage === 'All' ? totalRows || 1 : (perPage as number)
  const totalPages = perPage === 'All' ? 1 : Math.max(1, Math.ceil(totalRows / perPageNum))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * perPageNum
  const pageRows = perPage === 'All' ? filtered : filtered.slice(pageStart, pageStart + perPageNum)
  const selectedRow = selectedRowId === null ? null : bdSubmissions.find(row => row.id === selectedRowId) ?? null
  const selectedOpportunity = selectedRow ? rowOpportunity(selectedRow, opportunities) ?? null : null
  const editingRow = editingRowId === null ? null : bdSubmissions.find(row => row.id === editingRowId) ?? null
  const editingOpportunity = editingRow ? rowOpportunity(editingRow, opportunities) ?? null : null

  const outcomeChart = useMemo(() => {
    const submitted = baseFiltered.filter(row => !['NOT_SUBMITTED', 'DROPPED'].includes(row.status)).length
    const nonSubmitted = baseFiltered.filter(row => row.status === 'NOT_SUBMITTED').length
    const dropped = baseFiltered.filter(row => row.status === 'DROPPED').length
    return [
      { name: 'Submitted', value: submitted, color: STATUS_META.SUBMITTED.color },
      { name: 'Non-Submission', value: nonSubmitted, color: STATUS_META.NOT_SUBMITTED.color },
      { name: 'Dropped', value: dropped, color: STATUS_META.DROPPED.color },
    ].filter(row => row.value > 0)
  }, [baseFiltered])

  const associateOutcomes = useMemo(() => {
    const counts: Record<string, { name: string; submitted: number; nonSubmitted: number; dropped: number; total: number }> = {}
    baseFiltered.forEach(row => {
      const opp = rowOpportunity(row, opportunities)
      const chain = getAssignmentChain(employees, opp?.assignedTo)
      const key = chain.associate?.name || row.supportAgent || 'Unassigned'
      const current = counts[key] || { name: key, submitted: 0, nonSubmitted: 0, dropped: 0, total: 0 }
      if (row.status === 'NOT_SUBMITTED') current.nonSubmitted += 1
      else if (row.status === 'DROPPED') current.dropped += 1
      else current.submitted += 1
      current.total += 1
      counts[key] = current
    })
    return Object.values(counts).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 8)
  }, [baseFiltered, opportunities, employees])

  const clearFilters = () => {
    setSearch('')
    setFilters({ ...EMPTY_FILTERS })
    setPeriod(null)
    setPage(1)
  }

  const openEditForRow = (row: BDSubmission) => {
    setSelectedRowId(null)
    setEditingRowId(row.id)
  }

  const saveTrackerDetails = async (row: BDSubmission, opportunity: Opportunity | null | undefined, form: TrackerEditForm) => {
    const value = Number(form.value) || 0
    if (opportunity) {
      const saved = await updateOpportunity(opportunity.id, {
        solicitation: form.solicitation.trim(),
        client: form.client,
        type: form.type as ContractType,
        setAside: form.setAside as SetAside,
        naicsCode: form.naicsCode,
        dueDate: form.dueDate,
        location: form.location,
        contractAmount: value,
        value,
        mandatoryEvents: form.mandatoryEvents,
        proposalAttachments: form.proposalAttachments,
        proposals: form.proposalAttachments.map(att => att.name).filter(Boolean),
      })
      if (!saved) return false
    }
    updateBDSubmissionDetails(row.id, {
      solicitation: form.solicitation.trim(),
      type: form.type as ContractType,
      setAside: form.setAside as SetAside,
      dueDate: form.dueDate,
      localTime: row.localTime,
      location: form.location,
      value,
      comment: form.comment,
    })
    toast.success('Tracker details updated.')
    return true
  }

  const handleReturnToPipeline = (row: BDSubmission) => {
    if (!confirm(`Move ${row.solicitation} back to General Pipeline?`)) return
    returnBDSubmissionToPipeline(row.id)
    setMenuOpen(null)
    setSelectedRowId(null)
  }

  const handleDeleteSubmitted = (row: BDSubmission) => {
    if (!confirm(`Delete submitted opportunity ${row.solicitation}? This is only for human-error cleanup.`)) return
    deleteBDSubmission(row.id)
    setMenuOpen(null)
    setSelectedRowId(null)
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

      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Associate Outcome Mix</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Submission, non-submission, and dropped outcomes from the current filters.</p>
            <div className="mt-3 h-48">
              {outcomeChart.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] text-xs font-semibold text-[var(--text-muted)]">
                  No tracker data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outcomeChart} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="transparent" strokeWidth={0} isAnimationActive={false}>
                      {outcomeChart.map(d => <Cell key={d.name} fill={d.color} stroke="transparent" strokeWidth={0} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {associateOutcomes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] p-4 text-sm font-semibold text-[var(--text-muted)] sm:col-span-2 xl:col-span-4">
                No associate outcome rows for the current filters.
              </div>
            ) : (
              associateOutcomes.map(row => (
                <div key={row.name} className="rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-3">
                  <p className="truncate text-sm font-black text-[var(--text-primary)]">{row.name}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-base font-black" style={{ color: STATUS_META.SUBMITTED.color }}>{row.submitted}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Submitted</p>
                    </div>
                    <div>
                      <p className="text-base font-black" style={{ color: STATUS_META.NOT_SUBMITTED.color }}>{row.nonSubmitted}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Non-Sub</p>
                    </div>
                    <div>
                      <p className="text-base font-black" style={{ color: STATUS_META.DROPPED.color }}>{row.dropped}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Dropped</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {BD_TABS.map(t => {
            const cnt = baseFiltered.filter(s => s.status === t.key).length
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

        <div className="mb-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                className={`input-field w-full pl-9 text-xs ${search ? 'pr-8' : ''}`} placeholder="Search opportunity, ID, or location..." />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <div className="w-full sm:w-64">
              <PeriodFilter value={period} onChange={value => { setPeriod(value); setPage(1) }} placeholder="All due dates" />
            </div>
            <button onClick={clearFilters} className="btn-secondary text-xs">Clear</button>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-[var(--border-default)] pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                  <th>Proposal</th>
                  <th>Comment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr><td colSpan={14} className="py-12 text-center text-sm text-slate-400">No opportunities in this category.</td></tr>
                )}
                {pageRows.map((s, i) => {
                  const meta = STATUS_META[s.status]
                  const opp = rowOpportunity(s, opportunities)
                  const chain = getAssignmentChain(employees, opp?.assignedTo)
                  const isGlobalTarget = globalRecordId && (String(s.id) === globalRecordId || s.solicitationId === globalRecordId)
                  return (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedRowId(s.id)}
                      className={[
                        'cursor-pointer transition-colors hover:bg-[#D7BE7A]/10',
                        isGlobalTarget ? 'ring-1 ring-[#D7BE7A] ring-inset bg-[#D7BE7A]/10' : '',
                      ].join(' ')}
                    >
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
                      <td onClick={e => e.stopPropagation()}>
                        <ProposalCell attachments={opp?.proposalAttachments ?? []} />
                      </td>
                      <td className="max-w-[140px] text-xs text-slate-400"><p className="truncate">{s.comment ?? '-'}</p></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <SamGovListingButton
                            opportunity={opp ?? { solicitationId: s.solicitationId, solicitation: s.solicitation }}
                            compact
                          />
                          <FloatingActionMenu
                            open={menuOpen === String(s.id)}
                            onOpenChange={open => setMenuOpen(open ? String(s.id) : null)}
                            trigger={<MoreHorizontal size={14} />}
                          >
                                <SamGovListingButton
                                  opportunity={opp ?? { solicitationId: s.solicitationId, solicitation: s.solicitation }}
                                  label="Open SAM.gov"
                                  variant="menu"
                                  onOpened={() => setMenuOpen(null)}
                                />
                                {opp && (
                                  <button
                                    onClick={() => {
                                      setSourcingOpp(opp)
                                      setMenuOpen(null)
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                                  >
                                    <Users2 size={13} /> Sourcing
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    openEditForRow(s)
                                    setMenuOpen(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                                >
                                  <Edit2 size={13} /> Edit Values
                                </button>
                                {canEditOpportunities && (
                                  <button
                                    onClick={() => handleReturnToPipeline(s)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                                  >
                                    <RotateCcw size={13} /> Move to General Pipeline
                                  </button>
                                )}
                                {canDeleteSubmitted && (
                                  <button
                                    onClick={() => handleDeleteSubmitted(s)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 size={13} /> Delete Submitted Opportunity
                                  </button>
                                )}
                                <div className="my-1 border-t border-slate-100" />
                                <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Move to</p>
                                {BD_TABS.filter(t => t.key !== s.status && t.key !== 'NOT_SUBMITTED' && t.key !== 'DROPPED').map(t => {
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
                          </FloatingActionMenu>
                        </div>
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

      <DetailDrawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRowId(null)}
        title={selectedRow?.solicitation ?? ''}
        subtitle={selectedRow ? `${selectedRow.solicitationId} - ${formatStatusLabel(selectedRow.status)}` : ''}
        width={1040}
        placement="modal"
        showBackdrop
        variant="premium"
      >
        {selectedRow && (
          <>
            {(() => {
              const meta = STATUS_META[selectedRow.status]
              const chain = getAssignmentChain(employees, selectedOpportunity?.assignedTo)
              const proposalAttachments = selectedOpportunity?.proposalAttachments ?? []
              return (
                <>
                  <div className="mb-6 rounded-3xl border border-[#D7BE7A]/20 bg-gradient-to-r from-[#102820]/90 via-[#0A2327]/90 to-[#0A1D2B]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
                        {formatStatusLabel(selectedRow.status)}
                      </span>
                      <span className="rounded-lg border border-[#7DD3FC]/30 bg-[#7DD3FC]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#BAE6FD]">{typeLabel(selectedRow.type)}</span>
                      <span className="rounded-lg border border-[#D7BE7A]/25 bg-[#D7BE7A]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[#F8FBF7]">{selectedRow.solicitationId}</span>
                      <SamGovListingButton
                        opportunity={selectedOpportunity ?? { solicitationId: selectedRow.solicitationId, solicitation: selectedRow.solicitation }}
                        label="Open SAM.gov"
                        variant="premium"
                      />
                    </div>
                    <div className="mt-3 grid gap-3 text-xs text-slate-300 md:grid-cols-4">
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Submitted</p>
                        <p className="truncate font-semibold text-[#F8FBF7]">{formatSubmittedOn(selectedRow.submittedOn)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Due</p>
                        <p className="truncate font-semibold text-[#F8FBF7]">
                          {selectedOpportunity ? formatOpportunitySourceDueDateTime(selectedOpportunity) : selectedRow.dueDate}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Location</p>
                        <p className="truncate font-semibold text-[#F8FBF7]" title={selectedRow.location}>{selectedRow.location || '-'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Value</p>
                        <p className="truncate font-semibold text-emerald-300">{formatCurrency(selectedRow.value)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <DrawerSection title="Tracker Details" variant="premium">
                      <DrawerField label="Solicitation ID" value={selectedRow.solicitationId} variant="premium" />
                      <DrawerField label="Solicitation" value={selectedRow.solicitation} variant="premium" />
                      <DrawerField label="Status" value={formatStatusLabel(selectedRow.status)} variant="premium" />
                      <DrawerField label="Type" value={typeLabel(selectedRow.type)} variant="premium" />
                      <DrawerField label="Set Aside" value={selectedRow.setAside} variant="premium" />
                      <DrawerField label="Comment" value={selectedRow.comment || '-'} variant="premium" />
                    </DrawerSection>

                    <DrawerSection title="Opportunity Details" variant="premium">
                      <DrawerField label="Agency / Client" value={selectedOpportunity?.client || '-'} variant="premium" />
                      <DrawerField label="NAICS" value={selectedOpportunity?.naicsCode || '-'} variant="premium" />
                      <DrawerField label="Priority" value={selectedOpportunity?.priority || '-'} variant="premium" />
                      <DrawerField label="Captured On" value={selectedOpportunity?.capturedOn || '-'} variant="premium" />
                      <DrawerField
                        label="SAM.gov Listing"
                        value={<SamGovListingButton opportunity={selectedOpportunity ?? { solicitationId: selectedRow.solicitationId, solicitation: selectedRow.solicitation }} label="Open SAM.gov" variant="premium" />}
                        variant="premium"
                      />
                    </DrawerSection>

                    <DrawerSection title="Schedule" variant="premium">
                      <DrawerField label="Due Date" value={selectedRow.dueDate || '-'} variant="premium" />
                      <DrawerField label="Source Time" value={selectedOpportunity ? formatOpportunitySourceDueDateTime(selectedOpportunity) : (selectedRow.localTime || '-')} variant="premium" />
                      <DrawerField label="Morocco Time" value={selectedOpportunity ? (formatOpportunityMoroccoDueDateTime(selectedOpportunity) || '-') : '-'} variant="premium" />
                      <DrawerField label="Submitted On" value={formatSubmittedOn(selectedRow.submittedOn)} variant="premium" />
                    </DrawerSection>

                    <DrawerSection title="Team" variant="premium">
                      <DrawerField label="Manager" value={chain.manager?.name || selectedRow.bdm || '-'} variant="premium" />
                      <DrawerField label="Team Lead" value={chain.teamLead?.name || selectedRow.bds || '-'} variant="premium" />
                      <DrawerField label="Associate" value={chain.associate?.name || selectedRow.supportAgent || '-'} variant="premium" />
                    </DrawerSection>
                  </div>

                  {proposalAttachments.length > 0 && (
                    <DrawerSection title={`Proposal Files (${proposalAttachments.length})`} variant="premium">
                      <div className="space-y-2 py-3">
                        {proposalAttachments.map(att => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => downloadProposalAttachment(att)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#D7BE7A]/15 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition-colors hover:border-[#D7BE7A]/35 hover:bg-[#D7BE7A]/10"
                          >
                            <span className="min-w-0 truncate"><Paperclip size={12} className="mr-2 inline text-[#D7BE7A]" />{att.name}</span>
                            <span className="text-[10px] uppercase tracking-wide text-[#D7BE7A]">Open</span>
                          </button>
                        ))}
                      </div>
                    </DrawerSection>
                  )}

                  {selectedOpportunity?.mandatoryEvents && (
                    <DrawerSection title="Mandatory Events" variant="premium">
                      <p className="py-3 text-sm leading-6 text-slate-200">{selectedOpportunity.mandatoryEvents}</p>
                    </DrawerSection>
                  )}

                  {selectedOpportunity?.comments?.length ? (
                    <DrawerSection title={`Comments (${selectedOpportunity.comments.length})`} variant="premium">
                      {selectedOpportunity.comments.map(comment => (
                        <div key={comment.id} className="border-b border-[#D7BE7A]/15 py-3 last:border-0">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-[#F8FBF7]">{comment.author}</span>
                            <span className="text-[10px] font-medium text-slate-400">{formatSubmittedOn(comment.createdAt)}</span>
                          </div>
                          <p className="text-xs leading-5 text-slate-300">{comment.text}</p>
                        </div>
                      ))}
                    </DrawerSection>
                  ) : null}

                  {(selectedOpportunity || canEditOpportunities) && (
                    <div className="sticky bottom-0 -mx-6 -mb-5 mt-4 flex justify-end gap-2 border-t border-[#D7BE7A]/15 bg-[#07131F]/95 px-6 py-4 backdrop-blur">
                      {selectedOpportunity && (
                        <button className="btn-secondary gap-2 text-xs" onClick={() => setSourcingOpp(selectedOpportunity)}>
                          <Users2 size={13} /> Sourcing
                        </button>
                      )}
                      {canEditOpportunities && (
                        <button className="btn-primary gap-2 text-xs" onClick={() => openEditForRow(selectedRow)}>
                          <Edit2 size={13} /> Edit Record
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </DetailDrawer>

      {editingRow && (
        <BDTrackerEditModal
          row={editingRow}
          opportunity={editingOpportunity}
          uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
          onClose={() => setEditingRowId(null)}
          onSave={form => saveTrackerDetails(editingRow, editingOpportunity, form)}
        />
      )}

      {sourcingOpp && (
        <SourcingModal
          opp={sourcingOpp}
          onClose={() => setSourcingOpp(null)}
        />
      )}
    </div>
  )
}
