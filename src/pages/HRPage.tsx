import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  Award,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FileText,
  Pencil,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { hasPermission } from '../lib/permissions'
import { useEscapeKey } from '../lib/utils'
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
  DOCUMENT: 'Document',
  CERTIFICATION: 'Certification',
  PAYROLL: 'Payroll',
  ACCESS: 'Access',
  OTHER: 'Other',
}

const REQUEST_TYPES: EmployeeRequestType[] = ['TIME_OFF', 'DOCUMENT', 'CERTIFICATION', 'PAYROLL', 'ACCESS', 'OTHER']
const REQUEST_STATUSES: EmployeeRequestStatus[] = ['PENDING', 'IN_REVIEW', 'APPROVED', 'DECLINED']

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
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.details.trim()) {
      toast.error('Add a title and request details.')
      return
    }
    submitEmployeeRequest({
      type: form.type,
      priority: form.priority,
      title: form.title.trim(),
      details: form.details.trim(),
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
            <select className="select-field" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as EmployeeRequestType }))}>
              {REQUEST_TYPES.map(type => <option key={type} value={type}>{REQUEST_TYPE_LABEL[type]}</option>)}
            </select>
          </div>
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
  })

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
              <select className="select-field" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as EmployeeRequestType }))}>
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

export default function HRPage() {
  const {
    currentUser,
    employeeRequests,
  } = useStore()
  const [search, setSearch] = useState('')
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [reviewRequest, setReviewRequest] = useState<EmployeeRequest | null>(null)
  const [editRequest, setEditRequest] = useState<EmployeeRequest | null>(null)

  const canReviewRequests = hasPermission(currentUser, 'hr:reviewRequests')

  const visibleRequests = useMemo(() => {
    const scoped = canReviewRequests
      ? employeeRequests
      : employeeRequests.filter(request => request.requesterId === currentUser?.id)
    return scoped.filter(request => {
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
  }, [canReviewRequests, currentUser?.id, employeeRequests, search])

  const ownRequests = employeeRequests.filter(request => request.requesterId === currentUser?.id)
  const pendingReviewCount = employeeRequests.filter(request => request.status === 'PENDING' || request.status === 'IN_REVIEW').length

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
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <FileBadge2 size={16} className="text-cyan-200" />
            <h2 className="text-sm font-black text-white">{canReviewRequests ? 'Employee Requests' : 'My Requests'}</h2>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold text-slate-300">{visibleRequests.length}</span>
          </div>
          <div className="relative w-full lg:w-80">
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

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                <FileBadge2 size={17} />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">{canReviewRequests ? 'Admin request queue' : 'My request dashboard'}</h2>
                <p className="text-xs text-slate-400">{visibleRequests.length} visible requests</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  )
}
