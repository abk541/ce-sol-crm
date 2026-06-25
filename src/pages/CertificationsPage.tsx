import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Award, Clock3, Download, Paperclip, Pencil, Plus, Search, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { hasPermission } from '../lib/permissions'
import { useEscapeKey } from '../lib/utils'
import type { CompanyCertification, CompanyCertificationStatus, FileAttachment } from '../types'

const CERT_STATUS_STYLE: Record<CompanyCertificationStatus, string> = {
  ACTIVE: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/25',
  EXPIRING: 'bg-amber-400/15 text-amber-200 border-amber-400/25',
  EXPIRED: 'bg-red-400/15 text-red-200 border-red-400/25',
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function fileToCertificationAttachment(file: File, uploadedBy: string): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      id: `cert-att-${crypto.randomUUID()}`,
      name: file.name,
      attachedAt: new Date().toISOString(),
      uploadedBy,
      dataUrl: String(reader.result || ''),
      mimeType: file.type || undefined,
      size: file.size,
    })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function downloadCertificationAttachment(cert: CompanyCertification, attachment = cert.attachments?.[0]) {
  if (!attachment) {
    toast.error('No certification attachment was uploaded.')
    return
  }
  if (!attachment.dataUrl) {
    toast.error('This certification only has file metadata. Re-upload the attachment to download it.')
    return
  }
  const link = document.createElement('a')
  link.href = attachment.dataUrl
  link.download = attachment.name || `${cert.name}.pdf`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
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
  const { addCompanyCertification, updateCompanyCertification, currentUser } = useStore()
  const [form, setForm] = useState({
    name: cert?.name ?? '',
    issuer: cert?.issuer ?? '',
    certificateNumber: cert?.certificateNumber ?? '',
    issuedDate: cert?.issuedDate ?? '',
    expirationDate: cert?.expirationDate ?? '',
    notes: cert?.notes ?? '',
  })
  const [attachments, setAttachments] = useState<FileAttachment[]>(cert?.attachments ?? [])
  const isEdit = Boolean(cert)

  const handleFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    try {
      const uploadedBy = currentUser?.username ?? currentUser?.name ?? 'current_user'
      const next = await Promise.all(list.map(file => fileToCertificationAttachment(file, uploadedBy)))
      setAttachments(prev => [...prev, ...next])
      toast.success(list.length === 1 ? 'Certification file attached' : `${list.length} certification files attached`)
    } catch (error) {
      console.error(error)
      toast.error('Certification attachment could not be uploaded.')
    }
  }

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
      attachments,
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

  useEscapeKey(onClose)

  return createPortal(
    <AnimatePresence>
      <motion.div key="cert-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
          <div className="md:col-span-2">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Certification attachments</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D7BE7A]/35 bg-white/[0.04] px-4 py-5 text-sm font-bold text-slate-200 transition-colors hover:border-[#D7BE7A]/60 hover:bg-[#D7BE7A]/10">
              <UploadCloud size={16} className="text-[#D7BE7A]" />
              Upload certification file
              <input
                type="file"
                className="hidden"
                multiple
                onChange={event => {
                  handleFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
            </label>
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-white/[0.04] px-3 py-2">
                    <Paperclip size={13} className="text-[#D7BE7A]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">{att.name}</p>
                      <p className="text-[10px] text-slate-400">{formatDate(att.attachedAt)} | {att.uploadedBy}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter(item => item.id !== att.id))}
                      className="rounded-lg border border-red-400/30 px-2 py-1 text-[10px] font-bold text-red-200 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-default)] p-5">
          <button type="button" onClick={onClose} className="btn-secondary justify-center">Cancel</button>
          <button type="submit" className="btn-primary justify-center">{isEdit ? 'Save Changes' : 'Add Certification'}</button>
        </div>
      </motion.form>
    </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

export default function CertificationsPage() {
  const { currentUser, companyCertifications, deleteCompanyCertification } = useStore()
  const [search, setSearch] = useState('')
  const [certModal, setCertModal] = useState<{ cert: CompanyCertification | null } | null>(null)

  const canManageCertifications = hasPermission(currentUser, 'hr:manageCertifications')

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

  const activeCertCount = companyCertifications.filter(cert => displayCertStatus(cert) === 'ACTIVE').length
  const expiringCertCount = companyCertifications.filter(cert => displayCertStatus(cert) === 'EXPIRING').length
  const expiredCertCount = companyCertifications.filter(cert => displayCertStatus(cert) === 'EXPIRED').length

  const handleDeleteCert = (cert: CompanyCertification) => {
    deleteCompanyCertification(cert.id)
    toast.success(`${cert.name} deleted`)
  }

  return (
    <div className="page-enter p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">CES - Databases</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Company Certifications</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Track every credential, registration, and accreditation the company holds. Renewal dates surface here first.
          </p>
        </div>
        {canManageCertifications && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setCertModal({ cert: null })} className="btn-primary justify-center">
              <Plus size={14} /> Add Certification
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={ShieldCheck} label="Active certifications" value={activeCertCount} hint="Current company credentials" tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200" />
        <StatCard icon={Clock3} label="Expiring soon" value={expiringCertCount} hint="Within the next 45 days" tone="border-amber-400/20 bg-amber-400/10 text-amber-200" />
        <StatCard icon={Award} label="Expired" value={expiredCertCount} hint="Need renewal action" tone="border-red-400/20 bg-red-400/10 text-red-200" />
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            {companyCertifications.length} total · {visibleCertifications.length} shown
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`input-field pl-9 ${search ? 'pr-9' : ''}`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search certifications..."
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

        <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
          <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.7fr_0.8fr_auto] gap-3 border-b border-[var(--border-default)] bg-[#07131F]/90 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-amber-200">
            <span>Name</span>
            <span>Issuer</span>
            <span>Number</span>
            <span>Expires</span>
            <span>File</span>
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
                <div key={cert.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.7fr_0.8fr_auto] items-center gap-3 border-b border-[var(--border-default)] px-4 py-4 last:border-b-0">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => downloadCertificationAttachment(cert)}
                      className="block max-w-full truncate text-left text-sm font-bold text-white transition-colors hover:text-[#D7BE7A]"
                      title={cert.attachments?.length ? `Download ${cert.attachments[0].name}` : 'No attachment uploaded'}
                    >
                      {cert.name}
                    </button>
                    {cert.notes && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{cert.notes}</p>}
                  </div>
                  <p className="truncate text-sm text-slate-300">{cert.issuer}</p>
                  <p className="truncate font-mono text-xs text-slate-300">{cert.certificateNumber}</p>
                  <div>
                    <p className="text-sm font-semibold text-white">{formatDate(cert.expirationDate)}</p>
                    {remaining !== null && remaining >= 0 && <p className="text-[10px] text-slate-400">{remaining} days left</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCertificationAttachment(cert)}
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${
                      cert.attachments?.length
                        ? 'border-[#D7BE7A]/35 bg-[#D7BE7A]/10 text-[#F8E8B8] hover:bg-[#D7BE7A]/18'
                        : 'border-slate-700 bg-slate-900/30 text-slate-500'
                    }`}
                  >
                    {cert.attachments?.length ? <Download size={11} /> : <Paperclip size={11} />}
                    {cert.attachments?.length ? `${cert.attachments.length} file${cert.attachments.length === 1 ? '' : 's'}` : 'None'}
                  </button>
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
      </div>

      {certModal && <CertificationModal cert={certModal.cert} onClose={() => setCertModal(null)} />}
    </div>
  )
}
