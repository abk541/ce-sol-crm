import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FileText,
  Pencil,
  Search,
  Trash2,
  UsersRound,
  UserRound,
  X,
} from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { hasPermission } from '../lib/permissions'
import { useEscapeKey } from '../lib/utils'
import { approvedTimeOffDays, hrRoleGroup, type HRRoleGroup } from '../lib/hr'
import PeriodFilter, { type Period } from '../components/shared/PeriodFilter'
import type {
  CompanyCertification,
  CompanyCertificationStatus,
  EmployeeRequest,
  EmployeeRequestStatus,
  EmployeeRequestType,
} from '../types'

const CERT_STATUS_STYLE: Record<CompanyCertificationStatus, string> = {
  ACTIVE: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/25',
  EXPIRING: 'bg-amber-400/15 text-amber-200 border-amber-400/25',
  EXPIRED: 'bg-red-400/15 text-red-200 border-red-400/25',
}

const REQUEST_STATUS_STYLE: Record<EmployeeRequestStatus, string> = {
  PENDING: 'bg-amber-400/15 text-amber-200 border-amber-400/25',
  IN_REVIEW: 'bg-cyan-400/15 text-cyan-200 border-cyan-400/25',
  APPROVED: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/25',
  DECLINED: 'bg-red-400/15 text-red-200 border-red-400/25',
}

const REQUEST_TYPE_LABEL: Record<EmployeeRequestType, string> = {
  TIME_OFF: 'Time off',
  SICK_LEAVE: 'Sick leave',
  DOCUMENT: 'Document',
  CERTIFICATION: 'Certification',
  PAYROLL: 'Payroll',
  ACCESS: 'Access',
  OTHER: 'Other',
}

const REQUEST_TYPES: EmployeeRequestType[] = ['TIME_OFF', 'SICK_LEAVE', 'DOCUMENT', 'CERTIFICATION', 'PAYROLL', 'ACCESS', 'OTHER']
const REQUEST_STATUSES: EmployeeRequestStatus[] = ['PENDING', 'IN_REVIEW', 'APPROVED', 'DECLINED']
const ROLE_FILTER_LABELS: Record<HRRoleGroup, string> = {
  MANAGER: 'Managers',
  TEAM_LEAD: 'Team leads',
  ASSOCIATE: 'Associates',
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function displayCertStatus(cert: CompanyCertification): CompanyCertificationStatus {
  if (!cert.expirationDate) return 'ACTIVE'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expires = new Date(`${cert.expirationDate}T00:00:00`)
  if (Number.isNaN(expires.getTime())) return cert.status
  if (expires < today) return 'EXPIRED'
  const days = Math.ceil((expires.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  return days <= 45 ? 'EXPIRING' : 'ACTIVE'
}

function daysUntil(value?: string) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${value}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function badgeClass(base: string) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${base}`
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Award
  label: string
  value: string | number
  hint: string
  tone: string
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{hint}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${tone}`}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  )
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const submitEmployeeRequest = useStore(s => s.submitEmployeeRequest)
  const [form, setForm] = useState({
    type: 'DOCUMENT' as EmployeeRequestType,
    priority: 'MEDIUM' as EmployeeRequest['priority'],
    title: '',
    details: '',
    deadline: '',
  })
  const [leavePeriod, setLeavePeriod] = useState<Period | null>(null)
  const needsLeavePeriod = form.type === 'TIME_OFF' || form.type === 'SICK_LEAVE'

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.details.trim()) {
      toast.error('Add a title and request details.')
      return
    }
    if (needsLeavePeriod && !leavePeriod) {
      toast.error('Select the requested leave dates.')
      return
    }
    submitEmployeeRequest({
      type: form.type,
      priority: form.priority,
      title: form.title.trim(),
      details: form.details.trim(),
      deadline: form.deadline || undefined,
      leaveStart: needsLeavePeriod ? leavePeriod?.from : undefined,
      leaveEnd: needsLeavePeriod ? leavePeriod?.to : undefined,
      attachments: [],
    })
    toast.success('Request submitted')
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div key="hr-request-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close request form" />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-modal)] shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Employee request</p>
            <h2 className="mt-1 text-xl font-black text-white">Submit HR Request</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Type</label>
            <select
              className="select-field"
              value={form.type}
              onChange={e => {
                const type = e.target.value as EmployeeRequestType
                setForm(p => ({ ...p, type }))
                if (type !== 'TIME_OFF' && type !== 'SICK_LEAVE') setLeavePeriod(null)
              }}
            >
              {REQUEST_TYPES.map(type => <option key={type} value={type}>{REQUEST_TYPE_LABEL[type]}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Requested completion date</label>
            <input type="date" className="input-field" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
          </div>
          {needsLeavePeriod && (
            <div className="md:col-span-2 rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays size={14} className="text-cyan-200" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Requested leave period *</p>
                  <p className="text-xs text-slate-500">Select the first and last day in one calendar.</p>
                </div>
              </div>
              <PeriodFilter value={leavePeriod} onChange={setLeavePeriod} placeholder="Select leave dates" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Priority</label>
            <select className="select-field" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as EmployeeRequest['priority'] }))}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Title *</label>
            <input className="input-field" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Short request title" required />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Details *</label>
            <textarea className="input-field min-h-36 resize-y" value={form.details} onChange={e => setForm(p => ({ ...p, details: e.target.value }))} placeholder="Give HR the context needed to process this request" required />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-default)] p-5">
          <button type="button" onClick={onClose} className="btn-secondary justify-center">Cancel</button>
          <button type="submit" className="btn-primary justify-center">Submit Request</button>
        </div>
      </motion.form>
    </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

function ReviewModal({
  request,
  onClose,
}: {
  request: EmployeeRequest
  onClose: () => void
}) {
  const reviewEmployeeRequest = useStore(s => s.reviewEmployeeRequest)
  const [status, setStatus] = useState<EmployeeRequestStatus>(request.status === 'PENDING' ? 'IN_REVIEW' : request.status)
  const [reviewNote, setReviewNote] = useState(request.reviewNote ?? '')

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    reviewEmployeeRequest(request.id, status, reviewNote.trim())
    toast.success('Request updated')
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div key="hr-review-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close review form" />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-modal)] shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Review request</p>
            <h2 className="mt-1 text-xl font-black text-white">{request.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{request.requesterName} submitted {formatDateTime(request.submittedAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{REQUEST_TYPE_LABEL[request.type]}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{request.details}</p>
            {(request.deadline || request.leaveStart) && (
              <div className="mt-4 grid gap-3 border-t border-[var(--border-default)] pt-3 text-xs sm:grid-cols-2">
                {request.deadline && <p className="text-slate-400">Requested by <span className="font-semibold text-slate-100">{formatDate(request.deadline)}</span></p>}
                {request.leaveStart && <p className="text-slate-400">Leave period <span className="font-semibold text-slate-100">{formatDate(request.leaveStart)} - {formatDate(request.leaveEnd)}</span></p>}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Decision</label>
            <select className="select-field" value={status} onChange={e => setStatus(e.target.value as EmployeeRequestStatus)}>
              {REQUEST_STATUSES.map(item => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Review note</label>
            <textarea className="input-field min-h-28 resize-y" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional note shown to the employee" />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-default)] p-5">
          <button type="button" onClick={onClose} className="btn-secondary justify-center">Cancel</button>
          <button type="submit" className="btn-primary justify-center">Save Review</button>
        </div>
      </motion.form>
    </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

function EditRequestModal({
  request,
  onClose,
}: {
  request: EmployeeRequest
  onClose: () => void
}) {
  const updateEmployeeRequest = useStore(s => s.updateEmployeeRequest)
  const [form, setForm] = useState({
    title: request.title,
    type: request.type,
    priority: request.priority,
    details: request.details,
    deadline: request.deadline ?? '',
  })
  const [leavePeriod, setLeavePeriod] = useState<Period | null>(
    request.leaveStart && request.leaveEnd
      ? { label: `${formatDate(request.leaveStart)} - ${formatDate(request.leaveEnd)}`, from: request.leaveStart, to: request.leaveEnd }
      : null,
  )
  const needsLeavePeriod = form.type === 'TIME_OFF' || form.type === 'SICK_LEAVE'

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.details.trim()) {
      toast.error('Title and details are required')
      return
    }
    updateEmployeeRequest(request.id, {
      title: form.title.trim(),
      type: form.type,
      priority: form.priority,
      details: form.details.trim(),
      deadline: form.deadline || undefined,
      leaveStart: needsLeavePeriod ? leavePeriod?.from : undefined,
      leaveEnd: needsLeavePeriod ? leavePeriod?.to : undefined,
    })
    toast.success('Request updated')
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div key="hr-edit-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close edit form" />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-modal)] shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Edit request</p>
            <h2 className="mt-1 text-xl font-black text-white">Fix request fields</h2>
            <p className="mt-1 text-xs text-slate-400">Submitted by {request.requesterName}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Title</label>
            <input className="input-field" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Type</label>
              <select
                className="select-field"
                value={form.type}
                onChange={e => {
                  const type = e.target.value as EmployeeRequestType
                  setForm(p => ({ ...p, type }))
                  if (type !== 'TIME_OFF' && type !== 'SICK_LEAVE') setLeavePeriod(null)
                }}
              >
                {REQUEST_TYPES.map(t => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Priority</label>
              <select className="select-field" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as EmployeeRequest['priority'] }))}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Details</label>
            <textarea className="input-field min-h-32 resize-y" value={form.details} onChange={e => setForm(p => ({ ...p, details: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Requested completion date</label>
            <input type="date" className="input-field" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
          </div>
          {needsLeavePeriod && (
            <div className="rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-4">
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Requested leave period</label>
              <PeriodFilter value={leavePeriod} onChange={setLeavePeriod} placeholder="Select leave dates" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-default)] p-5">
          <button type="button" onClick={onClose} className="btn-secondary justify-center">Cancel</button>
          <button type="submit" className="btn-primary justify-center">Save Changes</button>
        </div>
      </motion.form>
    </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

function DeleteRequestModal({ request, onClose }: { request: EmployeeRequest; onClose: () => void }) {
  const deleteEmployeeRequest = useStore(s => s.deleteEmployeeRequest)
  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div key="hr-delete-modal" className="fixed inset-0 z-[70] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <button className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close delete confirmation" />
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-rose-400/25 bg-[var(--bg-modal)] p-5 shadow-[var(--shadow-modal)]"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-400/25 bg-rose-400/10 text-rose-200">
              <Trash2 size={17} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Delete this HR request?</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">“{request.title}” will be removed from the employee’s history and the shared database.</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary justify-center">Keep Request</button>
            <button
              type="button"
              onClick={() => {
                deleteEmployeeRequest(request.id)
                toast.success('Request deleted')
                onClose()
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-sm font-bold text-rose-100 transition-colors hover:bg-rose-500/25"
            >
              <Trash2 size={14} /> Delete Request
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

export default function HRPage() {
  const {
    currentUser,
    employeeRequests,
    users,
  } = useStore()
  const [search, setSearch] = useState('')
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [reviewRequest, setReviewRequest] = useState<EmployeeRequest | null>(null)
  const [editRequest, setEditRequest] = useState<EmployeeRequest | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<EmployeeRequest | null>(null)
  const [roleFilter, setRoleFilter] = useState<'ALL' | HRRoleGroup>('ALL')
  const [employeeFilter, setEmployeeFilter] = useState('ALL')

  const canReviewRequests = hasPermission(currentUser, 'hr:reviewRequests')
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const requestRole = (request: EmployeeRequest) => request.requesterRole ?? userById.get(request.requesterId)?.role

  const dashboardPeople = useMemo(() => {
    const active = users.filter(user => user.status === 'active')
    const scoped = roleFilter === 'ALL'
      ? active
      : active.filter(user => hrRoleGroup(user.role) === roleFilter)
    return canReviewRequests ? scoped : scoped.filter(user => user.id === currentUser?.id)
  }, [canReviewRequests, currentUser?.id, roleFilter, users])

  const scopedRequests = useMemo(() => {
    let scoped = canReviewRequests
      ? employeeRequests
      : employeeRequests.filter(request => request.requesterId === currentUser?.id)
    if (roleFilter !== 'ALL') scoped = scoped.filter(request => hrRoleGroup(requestRole(request)) === roleFilter)
    if (canReviewRequests && employeeFilter !== 'ALL') scoped = scoped.filter(request => request.requesterId === employeeFilter)
    return scoped
  }, [canReviewRequests, currentUser?.id, employeeFilter, employeeRequests, roleFilter, userById])

  const visibleRequests = useMemo(() => {
    return scopedRequests.filter(request => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [
        request.title,
        request.details,
        request.requesterName,
        request.requesterEmail,
        REQUEST_TYPE_LABEL[request.type],
        request.status,
      ].some(value => value.toLowerCase().includes(q))
    })
  }, [scopedRequests, search])

  const ownRequests = employeeRequests.filter(request => request.requesterId === currentUser?.id)
  const pendingReviewCount = employeeRequests.filter(request => request.status === 'PENDING' || request.status === 'IN_REVIEW').length
  const leaveDashboardPeople = employeeFilter !== 'ALL'
    ? dashboardPeople.filter(person => person.id === employeeFilter)
    : dashboardPeople
  const currentYear = new Date().getFullYear()
  const usedLeaveDays = leaveDashboardPeople.reduce(
    (sum, person) => sum + approvedTimeOffDays(employeeRequests.filter(request => request.requesterId === person.id), currentYear),
    0,
  )
  const leaveAllowance = Math.max(18, leaveDashboardPeople.length * 18)
  const remainingLeaveDays = Math.max(0, leaveAllowance - usedLeaveDays)
  const leaveChartData = [
    { name: 'Used', value: usedLeaveDays, color: '#D7BE7A' },
    { name: 'Remaining', value: remainingLeaveDays, color: '#1C4B4B' },
  ]

  return (
    <div className="page-enter p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">CES - Human Resources</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">HR Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Submit and review employee HR requests. Employees only see their own. Company certifications now live under Databases &gt; Company Certifications.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setRequestModalOpen(true)} className="btn-secondary justify-center">
            <FileText size={14} /> New Request
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={UserRound} label="My requests" value={ownRequests.length} hint="Requests tied to your account" tone="border-cyan-400/20 bg-cyan-400/10 text-cyan-200" />
        <StatCard icon={CheckCircle2} label="Pending review" value={canReviewRequests ? pendingReviewCount : ownRequests.filter(request => request.status === 'PENDING' || request.status === 'IN_REVIEW').length} hint={canReviewRequests ? 'Admin queue' : 'Awaiting HR'} tone="border-violet-400/20 bg-violet-400/10 text-violet-200" />
        <StatCard icon={Clock3} label="Total visible" value={visibleRequests.length} hint={canReviewRequests ? 'Across the company' : 'Your active history'} tone="border-amber-400/20 bg-amber-400/10 text-amber-200" />
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <FileBadge2 size={16} className="text-cyan-200" />
            <h2 className="text-sm font-black text-white">{canReviewRequests ? 'Employee Requests' : 'My Requests'}</h2>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold text-slate-300">{visibleRequests.length}</span>
          </div>
          <div className={canReviewRequests
            ? 'grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[150px_210px_300px]'
            : 'w-full xl:w-80'}>
            {canReviewRequests && (
              <select
                className="select-field"
                value={roleFilter}
                onChange={event => {
                  setRoleFilter(event.target.value as 'ALL' | HRRoleGroup)
                  setEmployeeFilter('ALL')
                }}
                aria-label="Filter by employee role"
              >
                <option value="ALL">All roles</option>
                {Object.entries(ROLE_FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
            {canReviewRequests && (
              <select className="select-field" value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)} aria-label="Filter by employee">
                <option value="ALL">All employees</option>
                {dashboardPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            )}
            <div className={`relative w-full ${canReviewRequests ? 'sm:col-span-2 xl:col-span-1' : ''}`}>
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`input-field pl-9 ${search ? 'pr-9' : ''}`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search requests..."
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                <UsersRound size={17} />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">{canReviewRequests ? 'Employee request dashboard' : 'My request dashboard'}</h2>
                <p className="text-xs text-slate-400">{employeeFilter === 'ALL' ? 'Current filtered workforce' : userById.get(employeeFilter)?.name}</p>
              </div>
            </div>

            <div className="grid items-center gap-4 border-y border-[var(--border-default)] py-4 sm:grid-cols-[150px_1fr]">
              <div className="relative h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={leaveChartData} dataKey="value" nameKey="name" innerRadius={43} outerRadius={62} paddingAngle={usedLeaveDays > 0 ? 2 : 0} stroke="none">
                      {leaveChartData.map(item => <Cell key={item.name} fill={item.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-2xl font-black text-white">{usedLeaveDays}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">days used</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">{currentYear} time off</p>
                <p className="mt-2 text-sm font-bold text-white">{remainingLeaveDays} of {leaveAllowance} days remaining</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Only approved time-off requests count toward the 18-day annual allowance for each employee.</p>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300"><span className="h-2 w-2 rounded-full bg-[#D7BE7A]" /> Used</span>
                  <span className="flex items-center gap-1.5 text-slate-300"><span className="h-2 w-2 rounded-full bg-[#1C4B4B]" /> Remaining</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {REQUEST_STATUSES.map(status => {
                const count = visibleRequests.filter(request => request.status === status).length
                return (
                  <div key={status} className="rounded-xl border border-[var(--border-default)] bg-[#07131F]/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{status.replace('_', ' ')}</p>
                    <p className="mt-2 text-2xl font-black text-white">{count}</p>
                  </div>
                )
              })}
            </div>

            {canReviewRequests && dashboardPeople.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Employee overview</p>
                <div className="max-h-52 divide-y divide-[var(--border-default)] overflow-y-auto pr-1">
                  {dashboardPeople.map(person => {
                    const personRequests = employeeRequests.filter(request => request.requesterId === person.id)
                    const days = approvedTimeOffDays(personRequests, currentYear)
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setEmployeeFilter(current => current === person.id ? 'ALL' : person.id)}
                        className={`flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:text-white ${employeeFilter === person.id ? 'text-amber-100' : 'text-slate-300'}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">{person.name}</span>
                          <span className="block text-[10px] text-slate-500">{ROLE_FILTER_LABELS[hrRoleGroup(person.role) ?? 'ASSOCIATE']}</span>
                        </span>
                        <span className="shrink-0 text-right text-[10px] text-slate-400">
                          <span className="block font-bold text-slate-200">{personRequests.length} requests</span>
                          <span>{days}/18 days used</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {visibleRequests.length === 0 ? (
              <div className="rounded-xl border border-[var(--border-default)] py-16 text-center text-sm text-slate-400">
                No HR requests found.
              </div>
            ) : (
              visibleRequests.map(request => (
                <div key={request.id} className="rounded-xl border border-[var(--border-default)] bg-[#07131F]/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={badgeClass(REQUEST_STATUS_STYLE[request.status])}>{request.status.replace('_', ' ')}</span>
                        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">{REQUEST_TYPE_LABEL[request.type]}</span>
                        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">{request.priority}</span>
                        {canReviewRequests && hrRoleGroup(requestRole(request)) && (
                          <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">{ROLE_FILTER_LABELS[hrRoleGroup(requestRole(request))!]}</span>
                        )}
                      </div>
                      <h3 className="text-sm font-black text-white">{request.title}</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {canReviewRequests ? `${request.requesterName} - ${request.requesterEmail}` : request.requesterEmail}
                      </p>
                    </div>
                    {canReviewRequests && (
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => setEditRequest(request)} className="btn-secondary justify-center px-3 py-2 text-xs" title="Edit request fields">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => setDeleteRequest(request)} className="btn-ghost justify-center px-3 py-2 text-xs text-rose-200" title="Delete request">
                          <Trash2 size={12} /> Delete
                        </button>
                        <button onClick={() => setReviewRequest(request)} className="btn-primary justify-center px-3 py-2 text-xs">
                          Review
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{request.details}</p>
                  <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Submitted: <span className="font-semibold text-slate-200">{formatDateTime(request.submittedAt)}</span></p>
                    <p>Reviewed: <span className="font-semibold text-slate-200">{formatDateTime(request.reviewedAt)}</span></p>
                    {request.deadline && <p>Requested by: <span className="font-semibold text-slate-200">{formatDate(request.deadline)}</span></p>}
                    {request.leaveStart && <p>Leave period: <span className="font-semibold text-slate-200">{formatDate(request.leaveStart)} - {formatDate(request.leaveEnd)}</span></p>}
                  </div>
                  {request.reviewNote && (
                    <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-white/[0.03] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Review note</p>
                      <p className="mt-1 text-sm text-slate-200">{request.reviewNote}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {requestModalOpen && <RequestModal onClose={() => setRequestModalOpen(false)} />}
      {reviewRequest && <ReviewModal request={reviewRequest} onClose={() => setReviewRequest(null)} />}
      {editRequest && <EditRequestModal request={editRequest} onClose={() => setEditRequest(null)} />}
      {deleteRequest && <DeleteRequestModal request={deleteRequest} onClose={() => setDeleteRequest(null)} />}
    </div>
  )
}
