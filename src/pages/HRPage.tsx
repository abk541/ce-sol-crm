import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FileText,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { hasPermission } from '../lib/permissions'
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

function CertificationModal({
  cert,
  onClose,
}: {
  cert: CompanyCertification | null
  onClose: () => void
}) {
  const { addCompanyCertification, updateCompanyCertification } = useStore()
  const [form, setForm] = useState({
    name: cert?.name ?? '',
    issuer: cert?.issuer ?? '',
    certificateNumber: cert?.certificateNumber ?? '',
    issuedDate: cert?.issuedDate ?? '',
    expirationDate: cert?.expirationDate ?? '',
    notes: cert?.notes ?? '',
  })
  const isEdit = Boolean(cert)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.issuer.trim() || !form.certificateNumber.trim() || !form.issuedDate) {
      toast.error('Fill the required certification fields.')
      return
    }

    const payload = {
      name: form.name.trim(),
      issuer: form.issuer.trim(),
      certificateNumber: form.certificateNumber.trim(),
      issuedDate: form.issuedDate,
      expirationDate: form.expirationDate || undefined,
      notes: form.notes.trim() || undefined,
      attachments: cert?.attachments ?? [],
    }

    if (cert) {
      updateCompanyCertification(cert.id, payload)
      toast.success('Certification updated')
    } else {
      addCompanyCertification(payload)
      toast.success('Certification added')
    }
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close certification form" />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-modal)] shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Company certification</p>
            <h2 className="mt-1 text-xl font-black text-white">{isEdit ? 'Edit Certification' : 'Add Certification'}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Certification name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. ISO 9001" required />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Issuer *</label>
            <input className="input-field" value={form.issuer} onChange={e => setForm(p => ({ ...p, issuer: e.target.value }))} placeholder="Issuing organization" required />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Certificate number *</label>
            <input className="input-field" value={form.certificateNumber} onChange={e => setForm(p => ({ ...p, certificateNumber: e.target.value }))} placeholder="Certificate ID" required />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Issued date *</label>
            <input type="date" className="input-field" value={form.issuedDate} onChange={e => setForm(p => ({ ...p, issuedDate: e.target.value }))} required />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Expiration date</label>
            <input type="date" className="input-field" value={form.expirationDate} onChange={e => setForm(p => ({ ...p, expirationDate: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Notes</label>
            <textarea className="input-field min-h-28 resize-y" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Internal notes, renewal steps, or audit comments" />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-default)] p-5">
          <button type="button" onClick={onClose} className="btn-secondary justify-center">Cancel</button>
          <button type="submit" className="btn-primary justify-center">{isEdit ? 'Save Changes' : 'Add Certification'}</button>
        </div>
      </motion.form>
    </motion.div>
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

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
  )
}

export default function HRPage() {
  const {
    currentUser,
    companyCertifications,
    employeeRequests,
    deleteCompanyCertification,
  } = useStore()
  const [tab, setTab] = useState<'certifications' | 'requests'>('certifications')
  const [search, setSearch] = useState('')
  const [certModal, setCertModal] = useState<{ cert: CompanyCertification | null } | null>(null)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [reviewRequest, setReviewRequest] = useState<EmployeeRequest | null>(null)

  const canManageCertifications = hasPermission(currentUser, 'hr:manageCertifications')
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

  const visibleCertifications = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companyCertifications.filter(cert => {
      if (!q) return true
      return [
        cert.name,
        cert.issuer,
        cert.certificateNumber,
        cert.notes ?? '',
        displayCertStatus(cert),
      ].some(value => value.toLowerCase().includes(q))
    })
  }, [companyCertifications, search])

  const ownRequests = employeeRequests.filter(request => request.requesterId === currentUser?.id)
  const pendingReviewCount = employeeRequests.filter(request => request.status === 'PENDING' || request.status === 'IN_REVIEW').length
  const activeCertCount = companyCertifications.filter(cert => displayCertStatus(cert) === 'ACTIVE').length
  const expiringCertCount = companyCertifications.filter(cert => displayCertStatus(cert) === 'EXPIRING').length

  const handleDeleteCert = (cert: CompanyCertification) => {
    deleteCompanyCertification(cert.id)
    toast.success(`${cert.name} deleted`)
  }

  return (
    <div className="page-enter p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">CES - Human Resources</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">HR Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Company certifications and employee requests are managed here. Employees only see their own HR requests.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setRequestModalOpen(true)} className="btn-secondary justify-center">
            <FileText size={14} /> New Request
          </button>
          {canManageCertifications && (
            <button onClick={() => setCertModal({ cert: null })} className="btn-primary justify-center">
              <Plus size={14} /> Add Certification
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Active certifications" value={activeCertCount} hint="Current company credentials" tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200" />
        <StatCard icon={Clock3} label="Expiring soon" value={expiringCertCount} hint="Within the next 45 days" tone="border-amber-400/20 bg-amber-400/10 text-amber-200" />
        <StatCard icon={UserRound} label="My requests" value={ownRequests.length} hint="Requests tied to your account" tone="border-cyan-400/20 bg-cyan-400/10 text-cyan-200" />
        <StatCard icon={CheckCircle2} label="Pending review" value={canReviewRequests ? pendingReviewCount : ownRequests.filter(request => request.status === 'PENDING' || request.status === 'IN_REVIEW').length} hint={canReviewRequests ? 'Admin queue' : 'Awaiting HR'} tone="border-violet-400/20 bg-violet-400/10 text-violet-200" />
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-xl border border-[var(--border-default)] bg-white/[0.03] p-1">
            {[
              { id: 'certifications', label: 'Company Certifications', count: companyCertifications.length },
              { id: 'requests', label: canReviewRequests ? 'Employee Requests' : 'My Requests', count: visibleRequests.length },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as typeof tab)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                  tab === item.id
                    ? 'bg-[var(--accent)] text-slate-950 shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
                <span className="ml-2 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px]">{item.count}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'certifications' ? 'Search certifications...' : 'Search requests...'}
            />
          </div>
        </div>

        {tab === 'certifications' ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 border-b border-[var(--border-default)] bg-[#07131F]/90 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-amber-200">
              <span>Name</span>
              <span>Issuer</span>
              <span>Number</span>
              <span>Expires</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {visibleCertifications.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                No company certifications found.
              </div>
            ) : (
              visibleCertifications.map(cert => {
                const status = displayCertStatus(cert)
                const remaining = daysUntil(cert.expirationDate)
                return (
                  <div key={cert.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] items-center gap-3 border-b border-[var(--border-default)] px-4 py-4 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{cert.name}</p>
                      {cert.notes && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{cert.notes}</p>}
                    </div>
                    <p className="truncate text-sm text-slate-300">{cert.issuer}</p>
                    <p className="truncate font-mono text-xs text-slate-300">{cert.certificateNumber}</p>
                    <div>
                      <p className="text-sm font-semibold text-white">{formatDate(cert.expirationDate)}</p>
                      {remaining !== null && remaining >= 0 && <p className="text-[10px] text-slate-400">{remaining} days left</p>}
                    </div>
                    <span className={badgeClass(CERT_STATUS_STYLE[status])}>{status}</span>
                    <div className="flex justify-end gap-2">
                      {canManageCertifications ? (
                        <>
                          <button onClick={() => setCertModal({ cert })} className="btn-secondary px-3 py-2" title="Edit certification">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDeleteCert(cert)} className="btn-secondary border-red-400/30 px-3 py-2 text-red-200 hover:bg-red-500/10" title="Delete certification">
                            <Trash2 size={13} />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">Read only</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
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
                        <button onClick={() => setReviewRequest(request)} className="btn-primary shrink-0 justify-center px-3 py-2 text-xs">
                          Review
                        </button>
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
        )}
      </div>

      <AnimatePresence>
        {certModal && <CertificationModal cert={certModal.cert} onClose={() => setCertModal(null)} />}
        {requestModalOpen && <RequestModal onClose={() => setRequestModalOpen(false)} />}
        {reviewRequest && <ReviewModal request={reviewRequest} onClose={() => setReviewRequest(null)} />}
      </AnimatePresence>
    </div>
  )
}
