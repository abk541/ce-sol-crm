import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, MoreHorizontal, FileCheck2, UserPlus, Building2,
  AlertTriangle, ListChecks, ChevronRight, X, Save, Plus,
  ArrowRight, CheckCircle2, Info, MapPin, Calendar,
  Phone, Mail, Clock, Shield, FileText, Trash2, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Receipt, Eye, Paperclip, Download,
} from 'lucide-react'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type {
  Contract, ContractStatus, ContractPoC, LockedSubcontractor,
  GovernmentWarning, GovWarningType, FreshAward, FileAttachment, Comment, ContractDeliverable,
  LockedSubkDocuments, Subcontractor, Opportunity,
} from '../types'
import { formatCurrency } from '../lib/utils'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'
import {
  canGenerateContractInvoice,
  generateContractInvoicePdf,
  invoiceAmountForContract,
  subkMonthlyBillingRowsForContract,
  subkQuoteSummaryForContract,
} from '../lib/invoicePdf'
import { normalizeContractDeliverables } from '../lib/contractDeliverables'
import { SourcingModal } from './PipelinePage'

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
type CTab = 'ACTIVE_GROUP' | 'KICK_OFF' | 'LOCKING_SUB' | 'PERFORMING' | 'PENDING_PAYMENT' | 'ARCHIVED' | 'TERMINATED'

const C_TABS: { key: CTab; label: string; statuses: ContractStatus[] }[] = [
  { key: 'ACTIVE_GROUP',  label: 'Active',         statuses: ['KICK_OFF','LOCKING_SUB','ACTIVE','ON_GOING','PERFORMING'] },
  { key: 'KICK_OFF',      label: 'Kick-Off',       statuses: ['KICK_OFF'] },
  { key: 'LOCKING_SUB',   label: 'Locking Sub',    statuses: ['LOCKING_SUB'] },
  { key: 'PERFORMING',    label: 'Performing',     statuses: ['PERFORMING'] },
  { key: 'PENDING_PAYMENT',label:'Pend. Payment',  statuses: ['PENDING_PAYMENT'] },
  { key: 'ARCHIVED',      label: 'Archived',       statuses: ['ARCHIVED'] },
  { key: 'TERMINATED',    label: 'Terminated',     statuses: ['TERMINATED','CANCELED'] },
]

const POC_ROLE_LABELS = { KO: 'Contracting Officer', COR: 'COR', END_USER: 'End User' }

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function toDatetimeLocal(value: string) {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayDateInput() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(value: string) {
  if (!value) return '-'
  const d = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function subkQuoteSummary(contract: Contract) {
  return subkQuoteSummaryForContract(contract)
}

function subkMonthlyBillingRows(contract: Contract) {
  return subkMonthlyBillingRowsForContract(contract)
}

function invoiceAmountFor(contract: Contract) {
  return invoiceAmountForContract(contract)
}

async function generateInvoiceFile(contract: Contract) {
  try {
    await generateContractInvoicePdf(contract)
    toast.success('Invoice PDF generated')
  } catch (err) {
    console.error(err)
    toast.error(contract.type === 'OTJ'
      ? 'OTJ invoices can only be generated in Pending Payment.'
      : 'Could not generate invoice PDF.')
  }
}

function createAttachment(
  name: string,
  attachedAt: string,
  uploadedBy: string,
  fileData?: Pick<FileAttachment, 'dataUrl' | 'mimeType' | 'size'>,
): FileAttachment {
  return {
    id: crypto.randomUUID(),
    name,
    attachedAt: new Date(attachedAt).toISOString(),
    uploadedBy,
    ...fileData,
  }
}

function formatFileSize(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType?: string) {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) return null

  const meta = dataUrl.slice(0, commaIndex)
  const body = dataUrl.slice(commaIndex + 1)
  const mimeType = meta.match(/^data:([^;]+)/i)?.[1] || fallbackMimeType || 'application/octet-stream'
  let raw = ''
  try {
    raw = meta.includes(';base64') ? atob(body) : decodeURIComponent(body)
  } catch {
    return null
  }
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

function getAttachmentBlobUrl(att: FileAttachment) {
  if (!att.dataUrl) {
    toast.error('This attachment only has saved metadata. Re-upload it to make the file viewable.')
    return null
  }
  const blob = dataUrlToBlob(att.dataUrl, att.mimeType)
  if (!blob) {
    toast.error('Attachment data could not be opened.')
    return null
  }
  return URL.createObjectURL(blob)
}

function downloadAttachment(att: FileAttachment) {
  const fileUrl = getAttachmentBlobUrl(att)
  if (!fileUrl) return

  const link = document.createElement('a')
  link.href = fileUrl
  link.download = att.name || 'attachment'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(fileUrl), 60 * 1000)
}

function viewAttachment(att: FileAttachment) {
  const fileUrl = getAttachmentBlobUrl(att)
  if (!fileUrl) return

  const mimeType = att.mimeType || ''
  const lowerName = att.name.toLowerCase()
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(lowerName)
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf')

  if (!isImage && !isPdf) {
    URL.revokeObjectURL(fileUrl)
    downloadAttachment(att)
    return
  }

  const win = window.open(fileUrl, '_blank')
  if (!win) {
    URL.revokeObjectURL(fileUrl)
    toast.error('Popup was blocked. Allow popups to view attachments.')
    return
  }
  setTimeout(() => URL.revokeObjectURL(fileUrl), 10 * 60 * 1000)
}

function AttachmentPicker({
  label = 'Attachments',
  attachments,
  onChange,
  uploadedBy,
}: {
  label?: string
  attachments: FileAttachment[]
  onChange: (attachments: FileAttachment[]) => void
  uploadedBy: string
}) {
  const [attachedAt, setAttachedAt] = useState(() => toDatetimeLocal(new Date().toISOString()))

  const addFile = (file: File, input: HTMLInputElement) => {
    if (!attachedAt) {
      toast.error('Choose an attachment timestamp first.')
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const attachment = createAttachment(file.name, attachedAt, uploadedBy, {
        dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
        mimeType: file.type || undefined,
        size: file.size,
      })
      onChange([...attachments, attachment])
      setAttachedAt(toDatetimeLocal(new Date().toISOString()))
      input.value = ''
      toast.success('Attachment added')
    }
    reader.onerror = () => {
      input.value = ''
      toast.error('Attachment could not be read.')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.32)' }}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#F8E8B8]">{label}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-300">Select a file and it will be attached automatically.</p>
        </div>
        <span className="rounded-full border border-[#D7BE7A]/30 bg-[#D7BE7A]/10 px-2 py-1 text-[10px] font-bold text-[#F8E8B8]">
          {attachments.length} attached
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-[190px_1fr]">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Timestamp</span>
          <input
            type="datetime-local"
            value={attachedAt}
            onChange={e => setAttachedAt(e.target.value)}
            className="input-field w-full text-xs"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">File</span>
        <input
          type="file"
          onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            addFile(file, e.currentTarget)
          }}
          className="input-field w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#D7BE7A] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#07131F]"
        />
        </label>
      </div>
      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[11px]"
              style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }}
            >
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-2 truncate font-black text-slate-100">
                  <Paperclip size={12} className="flex-shrink-0 text-[#F8E8B8]" />
                  <span className="truncate">{att.name}</span>
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  {formatDateTime(att.attachedAt)}
                  {formatFileSize(att.size) ? ` - ${formatFileSize(att.size)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => viewAttachment(att)}
                  disabled={!att.dataUrl}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-900 transition-colors hover:bg-[#F8E8B8] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Eye size={12} /> View
                </button>
                <button
                  type="button"
                  onClick={() => downloadAttachment(att)}
                  disabled={!att.dataUrl}
                  className="flex items-center gap-1.5 rounded-lg border border-[#D7BE7A]/35 bg-[#D7BE7A]/15 px-2.5 py-1.5 text-[11px] font-black text-[#F8E8B8] transition-colors hover:bg-[#D7BE7A]/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Download size={12} /> Download
                </button>
                <button
                  type="button"
                  onClick={() => onChange(attachments.filter(item => item.id !== att.id))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-300/35 bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/20"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Detail Drawer
// ─────────────────────────────────────────────────────────────────────────
const ROLE_LABEL_C: Record<string, string> = {
  BD_MANAGER: 'Manager',
  TEAM_LEAD: 'Team Lead',
  ASSOCIATE: 'Associate',
}
const ROLE_COLOR_C: Record<string, { color: string; bg: string; border: string }> = {
  BD_MANAGER: { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  TEAM_LEAD:  { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  ASSOCIATE:  { color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
}

type SubkDocumentKey = keyof Required<LockedSubkDocuments>

const SUBK_DOCUMENT_SECTIONS: { key: SubkDocumentKey; label: string; hint: string }[] = [
  { key: 'quote', label: 'Quote', hint: 'Pricing or offer received from the subcontractor.' },
  { key: 'coi', label: 'COI', hint: 'Certificate of insurance.' },
  { key: 'w9', label: 'W9', hint: 'Tax form for vendor setup.' },
  { key: 'subAgreement', label: 'Subagreement', hint: 'Executed subcontract agreement.' },
  { key: 'invoice', label: 'Invoice', hint: 'Subcontractor invoice for this contract.' },
]

function attachmentNamesFromList(attachments?: FileAttachment[]) {
  return (attachments || []).map(att => att.name).filter(Boolean)
}

function legacyAttachments(names?: string[], uploadedBy = 'Legacy'): FileAttachment[] {
  return (names || [])
    .filter(Boolean)
    .map((name, index) => ({
      id: `legacy-subk-doc-${index}-${name}`,
      name,
      attachedAt: '',
      uploadedBy,
    }))
}

function getLockedSubDocuments(sub: LockedSubcontractor): LockedSubkDocuments {
  return {
    quote: sub.documents?.quote?.length ? sub.documents.quote : legacyAttachments(sub.quotes, sub.createdBy),
    coi: sub.documents?.coi || [],
    w9: sub.documents?.w9 || [],
    subAgreement: sub.documents?.subAgreement?.length ? sub.documents.subAgreement : legacyAttachments(sub.subAgreements, sub.createdBy),
    invoice: sub.documents?.invoice?.length ? sub.documents.invoice : legacyAttachments(sub.invoices, sub.createdBy),
  }
}

function subkDocumentUpdate(documents: LockedSubkDocuments): Partial<LockedSubcontractor> {
  return {
    documents,
    quotes: attachmentNamesFromList(documents.quote),
    subAgreements: attachmentNamesFromList(documents.subAgreement),
    invoices: attachmentNamesFromList(documents.invoice),
  }
}

function subkDocumentTotal(documents: LockedSubkDocuments) {
  return SUBK_DOCUMENT_SECTIONS.reduce((sum, section) => sum + (documents[section.key]?.length || 0), 0)
}

function subkCompanyKey(companyName = '', email = '') {
  return `${companyName.trim().toLowerCase()}|${email.trim().toLowerCase()}`
}

function hasSourcingQuote(entry: Subcontractor) {
  return Boolean(entry.quoteFile?.trim())
}

function uniqueSourcingEntries(entries: Subcontractor[]) {
  const byId = new Map<string, Subcontractor>()
  entries.forEach(entry => {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  })
  return Array.from(byId.values())
}

type ContractDrawerTab = 'overview' | 'pop' | 'poc' | 'subk' | 'lockSubk' | 'warnings' | 'deliverables'

function ContractDetailDrawer({
  contract,
  initialTab = 'overview',
  onClose,
  onOpenSourcing,
}: {
  contract: Contract
  initialTab?: ContractDrawerTab
  onClose: () => void
  onOpenSourcing?: (opp: Opportunity) => void
}) {
  const { updateContract, addContractPoC, updateContractPoC, removeContractPoC, addLockedSubcontractor, updateLockedSubcontractor, addGovernmentWarning, updateGovernmentWarning, removeGovernmentWarning, resolveGovernmentWarning, advanceContractStatus, terminateContract, currentUser, employees, opportunities, subcontractors } = useStore()
  const [tab, setTab] = useState<ContractDrawerTab>(initialTab)
  const [deliverableForm, setDeliverableForm] = useState({
    title: '',
    issuanceDate: todayDateInput(),
    deadline: '',
    attachments: [] as FileAttachment[],
  })
  const [openDeliverableAttachments, setOpenDeliverableAttachments] = useState<string | null>(null)
  const [popForm, setPopForm] = useState({
    startDate: contract.popStart || '',
    endDate: contract.popEnd || '',
  })
  const [contractNumberDraft, setContractNumberDraft] = useState(contract.contractNumber || '')

  // Terminate form
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateType, setTerminateType] = useState<'T4C' | 'T4D' | 'CANCELED'>('T4C')
  const [terminateReason, setTerminateReason] = useState('')

  // PoC form
  const [addingPoC, setAddingPoC] = useState(false)
  const [editingPoCId, setEditingPoCId] = useState<string | null>(null)
  const [pocForm, setPocForm] = useState({ role: 'KO' as ContractPoC['role'], name: '', email: '', phone: '', notes: '' })

  // Subk selection and locking
  const [selectedSubkKey, setSelectedSubkKey] = useState('')
  const [openSubkHistoryKey, setOpenSubkHistoryKey] = useState<string | null>(null)
  const [subkDocumentDrafts, setSubkDocumentDrafts] = useState<LockedSubkDocuments>({})

  // Gov warning form
  const [addingWarning, setAddingWarning] = useState(false)
  const [warnForm, setWarnForm] = useState({
    type: 'CURE_NOTICE' as GovWarningType,
    issuedDate: '',
    description: '',
    comment: '',
    attachments: [] as FileAttachment[],
  })
  const [warningCommentDrafts, setWarningCommentDrafts] = useState<Record<string, string>>({})
  const [editingWarningId, setEditingWarningId] = useState<string | null>(null)
  const [warningEditForm, setWarningEditForm] = useState({
    type: 'CURE_NOTICE' as GovWarningType,
    issuedDate: '',
    description: '',
  })
  const [confirmDeleteWarningId, setConfirmDeleteWarningId] = useState<string | null>(null)

  // Edit status
  const [editingStatus, setEditingStatus] = useState(false)

  const nextStatus = STATUS_FLOW[contract.status]
  const meta = STATUS_META[contract.status]
  const sourceOpportunity = contract.opportunityId ? opportunities.find(o => o.id === contract.opportunityId) : undefined
  const proposalFiles = Array.from(new Set([
    ...(sourceOpportunity?.proposals ?? []),
    ...(sourceOpportunity?.assignedOpportunities ?? []),
  ].map(name => name.trim()).filter(Boolean)))
  const uploadedProposalAttachments = sourceOpportunity?.proposalAttachments ?? []
  const uploadedProposalNames = new Set(uploadedProposalAttachments.map(att => att.name.trim()).filter(Boolean))
  const proposalAttachments = [
    ...uploadedProposalAttachments,
    ...legacyAttachments(
      proposalFiles.filter(name => !uploadedProposalNames.has(name)),
      sourceOpportunity?.bdm || 'Submitted Proposal',
    ),
  ]
  const proposalCount = proposalAttachments.length
  const allSourcingEntries = uniqueSourcingEntries([
    ...subcontractors,
    ...opportunities.flatMap(o => o.subcontractors || []),
  ])
  const sourceOpportunitySourcing = allSourcingEntries.filter(entry =>
    entry.opportunityId === contract.opportunityId && hasSourcingQuote(entry)
  )
  const sourcingHistoryByKey = new Map<string, Subcontractor[]>()
  allSourcingEntries.forEach(entry => {
    const key = subkCompanyKey(entry.companyName, entry.email)
    if (!entry.companyName?.trim()) return
    sourcingHistoryByKey.set(key, [...(sourcingHistoryByKey.get(key) || []), entry])
  })
  const opportunityById = new Map(opportunities.map(o => [o.id, o]))
  const subkCandidateMap = new Map<string, {
    key: string
    companyName: string
    contactName: string
    email: string
    phone: string
    setAside: string
    naicsCode: string
    notes: string
    entries: Subcontractor[]
    currentProject: boolean
    fromContractAdmin: boolean
    contractSourceQuote: boolean
  }>()

  sourceOpportunitySourcing.forEach(entry => {
    const companyName = entry.companyName?.trim()
    if (!companyName) return
    const key = subkCompanyKey(companyName, entry.email)
    const existing = subkCandidateMap.get(key)
    if (existing) {
      existing.entries = sourcingHistoryByKey.get(key) || existing.entries
      existing.currentProject = true
      existing.contractSourceQuote = true
      return
    }
    subkCandidateMap.set(key, {
      key,
      companyName,
      contactName: entry.contactName,
      email: entry.email,
      phone: entry.phone,
      setAside: entry.setAside,
      naicsCode: entry.naicsCode,
      notes: entry.notes,
      entries: sourcingHistoryByKey.get(key) || [entry],
      currentProject: true,
      fromContractAdmin: false,
      contractSourceQuote: true,
    })
  })

  ;(contract.lockedSubcontractors || []).forEach(sub => {
    const companyName = sub.companyName?.trim()
    if (!companyName) return
    const key = subkCompanyKey(companyName, sub.email || '')
    const existing = subkCandidateMap.get(key)
    if (existing) {
      existing.fromContractAdmin = true
      if (!existing.entries.length) existing.entries = sourcingHistoryByKey.get(key) || []
      return
    }
    subkCandidateMap.set(key, {
      key,
      companyName,
      contactName: sub.contactName,
      email: sub.email || '',
      phone: sub.phone || '',
      setAside: sub.setAside || '',
      naicsCode: sub.naicsCode || '',
      notes: sub.notes || '',
      entries: sourcingHistoryByKey.get(key) || [],
      currentProject: false,
      fromContractAdmin: true,
      contractSourceQuote: false,
    })
  })

  const subkCandidates = Array.from(subkCandidateMap.values()).sort((a, b) => {
    if (a.contractSourceQuote !== b.contractSourceQuote) return a.contractSourceQuote ? -1 : 1
    if (a.fromContractAdmin !== b.fromContractAdmin) return a.fromContractAdmin ? -1 : 1
    if (a.currentProject !== b.currentProject) return a.currentProject ? -1 : 1
    return a.companyName.localeCompare(b.companyName)
  })
  const lockedSubkCompanyKeys = new Set((contract.lockedSubcontractors || []).map(sub => subkCompanyKey(sub.companyName, sub.email || '')))
  const selectedSubkCandidate = subkCandidates.find(candidate => candidate.key === selectedSubkKey)
  const selectedSubkMissingDocs = SUBK_DOCUMENT_SECTIONS.filter(section => !(subkDocumentDrafts[section.key] || []).length)
  const invoiceReady = canGenerateContractInvoice(contract)
  const deliverables = normalizeContractDeliverables(contract.deliverables)
  const financeRows = contract.type === 'RECURRING'
    ? [
        { label: 'Total Contract Value (Gov)', value: formatCurrency(contract.value || 0) },
        { label: 'Monthly Payment (Gov)', value: formatCurrency(contract.monthlyPayment || 0) },
        ...subkMonthlyBillingRows(contract).map(row => ({ label: 'Monthly Billing (Subk)', value: row })),
      ]
    : [
        { label: 'Total Contract Value (Gov)', value: formatCurrency(contract.value || 0) },
        { label: "Quote (Subk's)", value: subkQuoteSummary(contract) },
      ]

  return (
    <div className="fixed inset-0 z-[51] flex items-start justify-center overflow-y-auto p-2 sm:p-4" style={{ pointerEvents: 'none' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="my-2 flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl sm:my-3 sm:max-h-[calc(100vh-1.5rem)]"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 48px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.08)',
          pointerEvents: 'all',
        }}
      >
      {/* Header */}
      <div className="flex-shrink-0 p-5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
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
      <div className="flex-shrink-0 flex gap-0.5 px-3 py-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-default)' }}>
        {[
          { key: 'overview', label: 'Overview', icon: Info },
          { key: 'pop', label: 'POP', icon: Calendar },
          { key: 'poc', label: `PoC (${(contract.pocs || []).length})`, icon: UserPlus },
          { key: 'subk', label: `Potential Subk (${subkCandidates.length})`, icon: Building2 },
          { key: 'lockSubk', label: `Locked Subk (${(contract.lockedSubcontractors || []).length})`, icon: Shield },
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

            <div
              className="rounded-xl border p-3"
              style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F8E8B8]">Contract Number</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Manual contract number assigned for this contract.</p>
                </div>
                {contract.contractNumber && (
                  <span className="rounded-full border border-[#D7BE7A]/30 bg-[#D7BE7A]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[#F8E8B8]">
                    {contract.contractNumber}
                  </span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input
                  className="input-field text-xs"
                  value={contractNumberDraft}
                  onChange={e => setContractNumberDraft(e.target.value)}
                  placeholder="Enter contract number manually..."
                />
                <button
                  type="button"
                  className="btn-secondary justify-center text-xs"
                  onClick={() => setContractNumberDraft(contract.contractNumber || '')}
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={contractNumberDraft.trim() === (contract.contractNumber || '')}
                  className="btn-primary justify-center text-xs disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={async () => {
                    const saved = await updateContract(contract.id, { contractNumber: contractNumberDraft.trim() || undefined })
                    if (saved) toast.success('Contract number saved')
                  }}
                >
                  <Save size={12} /> Save Number
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Finance Projection</p>
                <button
                  type="button"
                  onClick={() => generateInvoiceFile(contract)}
                  disabled={!invoiceReady}
                  title={!invoiceReady ? 'OTJ invoices are generated when the contract reaches Pending Payment.' : 'Generate invoice PDF'}
                  className="btn-secondary gap-1 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Receipt size={12} /> Generate Invoice
                </button>
              </div>
              <div className="space-y-1.5">
                {financeRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="grid gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs sm:grid-cols-[180px_1fr]">
                    <span className="font-semibold text-slate-500">{row.label}</span>
                    <span className="font-semibold text-slate-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-xl border p-3"
              style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F8E8B8]">Submitted Proposal Files</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {sourceOpportunity?.submittedAt ? `Submitted ${formatDateTime(sourceOpportunity.submittedAt)}` : 'Linked from the source opportunity'}
                  </p>
                </div>
                <span className="rounded-full border border-[#D7BE7A]/30 bg-[#D7BE7A]/10 px-2.5 py-1 text-[10px] font-bold text-[#F8E8B8]">
                  {proposalCount} file{proposalCount === 1 ? '' : 's'}
                </span>
              </div>
              {proposalAttachments.length > 0 ? (
                <div className="space-y-1.5">
                  {proposalAttachments.map(att => (
                    <div key={att.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Paperclip size={12} className="flex-shrink-0 text-[#F8E8B8]" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-100" title={att.name}>{att.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {att.attachedAt ? formatDateTime(att.attachedAt) : sourceOpportunity?.submittedAt ? `Submitted ${formatDateTime(sourceOpportunity.submittedAt)}` : 'Submitted proposal file'}
                            {formatFileSize(att.size) ? ` - ${formatFileSize(att.size)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => viewAttachment(att)}
                          disabled={!att.dataUrl}
                          className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-900 transition-colors hover:bg-[#F8E8B8] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadAttachment(att)}
                          disabled={!att.dataUrl}
                          className="flex items-center gap-1.5 rounded-lg border border-[#D7BE7A]/35 bg-[#D7BE7A]/15 px-2.5 py-1.5 text-[11px] font-black text-[#F8E8B8] transition-colors hover:bg-[#D7BE7A]/25 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-slate-400">
                  No proposal file is linked to this contract yet.
                </p>
              )}
            </div>

            <div
              className="rounded-xl border p-3"
              style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F8E8B8]">Sourcing</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Add or edit sourcing entries for the source opportunity.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!sourceOpportunity}
                  title={sourceOpportunity ? 'Open sourcing for this contract opportunity' : 'No source opportunity is linked to this contract.'}
                  className="btn-secondary justify-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    if (!sourceOpportunity) return
                    onOpenSourcing?.(sourceOpportunity)
                  }}
                >
                  <Building2 size={12} /> Sourcing
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              {[
                { icon: MapPin, label: 'Location', value: contract.location },
                { icon: FileText, label: 'Number', value: contract.contractNumber || '—' },
                { icon: Calendar, label: 'POP', value: `${formatDate(contract.popStart)} - ${formatDate(contract.popEnd)}` },
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
                  { label: 'Associate', value: contract.supportAgent },
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

        {/* POP TAB */}
        {tab === 'pop' && (
          <div className="space-y-4">
            <div
              className="rounded-2xl border p-4"
              style={{
                background: 'linear-gradient(135deg, rgba(15,46,54,0.94), rgba(7,19,31,0.96))',
                borderColor: 'rgba(215,190,122,0.26)',
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-100">Period of Performance</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Enter the start and end dates manually for this active contract.
                  </p>
                </div>
                <span className="rounded-full border border-[#D7BE7A]/30 bg-[#D7BE7A]/10 px-3 py-1 text-[10px] font-bold text-[#F8E8B8]">
                  {contract.contractId}
                </span>
              </div>
            </div>

            <div
              className="rounded-2xl border p-4"
              style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-200">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs"
                    value={popForm.startDate}
                    onChange={e => setPopForm(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-200">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs"
                    value={popForm.endDate}
                    onChange={e => setPopForm(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div
                  className="rounded-xl border px-3 py-3"
                  style={{ background: 'rgba(7,19,31,0.55)', borderColor: 'rgba(215,190,122,0.18)' }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current Start</p>
                  <p className="mt-1 text-sm font-black text-slate-100">{formatDate(contract.popStart)}</p>
                </div>
                <div
                  className="rounded-xl border px-3 py-3"
                  style={{ background: 'rgba(7,19,31,0.55)', borderColor: 'rgba(215,190,122,0.18)' }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current End</p>
                  <p className="mt-1 text-sm font-black text-slate-100">{formatDate(contract.popEnd)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#D7BE7A]/15 pt-4">
                <button
                  type="button"
                  className="btn-secondary justify-center"
                  onClick={() => setPopForm({ startDate: contract.popStart || '', endDate: contract.popEnd || '' })}
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={!popForm.startDate || !popForm.endDate}
                  className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={async () => {
                    if (!popForm.startDate || !popForm.endDate) {
                      toast.error('POP start date and end date are required.')
                      return
                    }
                    if (new Date(`${popForm.startDate}T00:00:00`).getTime() > new Date(`${popForm.endDate}T00:00:00`).getTime()) {
                      toast.error('POP start date must be before the end date.')
                      return
                    }
                    const saved = await updateContract(contract.id, {
                      popStart: popForm.startDate,
                      popEnd: popForm.endDate,
                    })
                    if (saved) toast.success('Period of performance saved')
                  }}
                >
                  <Save size={13} /> Save POP
                </button>
              </div>
            </div>
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingPoCId(poc.id)
                        setPocForm({
                          role: poc.role,
                          name: poc.name,
                          email: poc.email || '',
                          phone: poc.phone || '',
                          notes: poc.notes || '',
                        })
                        setAddingPoC(true)
                      }}
                      className="text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Edit PoC"
                    >
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => removeContractPoC(contract.id, poc.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete PoC">
                      <Trash2 size={12} />
                    </button>
                  </div>
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
                <p className="text-xs font-bold text-indigo-700">{editingPoCId ? 'Edit Point of Contact' : 'Add Point of Contact'}</p>
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
                  <button
                    onClick={() => {
                      setAddingPoC(false)
                      setEditingPoCId(null)
                      setPocForm({ role: 'KO', name: '', email: '', phone: '', notes: '' })
                    }}
                    className="btn-secondary flex-1 text-xs py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!pocForm.name}
                    onClick={() => {
                      if (editingPoCId) {
                        updateContractPoC(contract.id, editingPoCId, { ...pocForm })
                      } else {
                        addContractPoC(contract.id, { ...pocForm })
                      }
                      setPocForm({ role: 'KO', name: '', email: '', phone: '', notes: '' })
                      setEditingPoCId(null)
                      setAddingPoC(false)
                    }}
                    className="btn-primary flex-1 text-xs py-1.5 disabled:opacity-40">
                    {editingPoCId ? 'Save Changes' : 'Save PoC'}
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

        {/* POTENTIAL SUBK TAB */}
        {tab === 'subk' && (
          <div className="space-y-3">
            <div
              className="rounded-2xl border p-4"
              style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <p className="text-sm font-black text-slate-100">Potential subcontractors</p>
              <p className="mt-1 text-xs text-slate-300">
                Review quote-backed subcontractors linked to this contract, plus subcontractors already added in Contract Admin.
              </p>
            </div>

            {subkCandidates.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[#D7BE7A]/25 py-8 text-center text-sm text-slate-400">
                No quote-backed sourcing is linked to this contract yet.
              </p>
            )}

            {subkCandidates.map(candidate => {
              const isSelected = selectedSubkKey === candidate.key
              const alreadyLocked = lockedSubkCompanyKeys.has(candidate.key)
              const historyOpen = openSubkHistoryKey === candidate.key
              const projects = candidate.entries.map(entry => {
                const opp = opportunityById.get(entry.opportunityId)
                return {
                  id: entry.id,
                  title: opp?.solicitation || 'Unknown opportunity',
                  solicitationId: opp?.solicitationId || entry.opportunityId,
                  capturedOn: opp?.capturedOn || entry.createdAt,
                  quoteFile: entry.quoteFile,
                }
              })

              return (
                <div
                  key={candidate.key}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(35,113,112,0.24), rgba(215,190,122,0.13))'
                      : 'rgba(255,255,255,0.055)',
                    borderColor: isSelected ? 'rgba(215,190,122,0.46)' : 'rgba(215,190,122,0.20)',
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-black text-slate-100">{candidate.companyName}</p>
                        {candidate.contractSourceQuote && (
                          <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100">
                            Linked quote
                          </span>
                        )}
                        {candidate.fromContractAdmin && (
                          <span className="rounded-full border border-[#D7BE7A]/30 bg-[#D7BE7A]/10 px-2 py-0.5 text-[10px] font-bold text-[#F8E8B8]">
                            Added in Contract Admin
                          </span>
                        )}
                        {alreadyLocked && (
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                            Locked
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                        {candidate.contactName && <span>{candidate.contactName}</span>}
                        {candidate.email && <span className="flex items-center gap-1"><Mail size={11} /> {candidate.email}</span>}
                        {candidate.phone && <span className="flex items-center gap-1"><Phone size={11} /> {candidate.phone}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.setAside && (
                          <span className="rounded-lg bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                            {candidate.setAside}
                          </span>
                        )}
                        {candidate.naicsCode && (
                          <span className="rounded-lg bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                            NAICS {candidate.naicsCode}
                          </span>
                        )}
                        <span className="rounded-lg bg-white/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                          {projects.length} project{projects.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenSubkHistoryKey(historyOpen ? null : candidate.key)}
                        className="btn-secondary text-xs"
                      >
                        <Clock size={12} /> Projects worked before
                      </button>
                      <button
                        type="button"
                        disabled={alreadyLocked}
                        onClick={() => {
                          setSelectedSubkKey(candidate.key)
                          setSubkDocumentDrafts({})
                          setTab('lockSubk')
                        }}
                        className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <CheckCircle2 size={12} /> Choose for this project
                      </button>
                    </div>
                  </div>

                  {historyOpen && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#F8E8B8]">Project history</p>
                      <div className="space-y-2">
                        {projects.map(project => (
                          <div key={project.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-100">{project.title}</p>
                                <p className="text-[10px] text-slate-400">{project.solicitationId} - {formatDate(project.capturedOn)}</p>
                              </div>
                              {project.quoteFile && (
                                <span className="flex items-center gap-1 rounded-lg bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-100">
                                  <FileText size={10} /> Quote on file
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* LOCKED SUBK TAB */}
        {tab === 'lockSubk' && (
          <div className="space-y-4">
            <div
              className="rounded-2xl border p-4"
              style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.24)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-100">Locked subcontractors</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Upload the recommended documents, then lock the selected subcontractor to this contract.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('subk')}
                  className="btn-secondary text-xs"
                >
                  Choose subcontractor
                </button>
              </div>
            </div>

            {selectedSubkCandidate ? (
              <div
                className="rounded-2xl border p-4"
                style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.24)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#F8E8B8]">Selected subcontractor</p>
                    <p className="mt-1 truncate text-lg font-black text-slate-100">{selectedSubkCandidate.companyName}</p>
                    <p className="text-xs text-slate-300">{selectedSubkCandidate.contactName || 'No contact listed'}</p>
                  </div>
                  {selectedSubkMissingDocs.length > 0 && (
                    <span className="rounded-full border border-amber-300/35 bg-amber-400/10 px-3 py-1 text-[10px] font-bold text-amber-100">
                      Missing recommended: {selectedSubkMissingDocs.map(section => section.label).join(', ')}
                    </span>
                  )}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {SUBK_DOCUMENT_SECTIONS.map(section => (
                    <div key={section.key} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <div className="mb-2">
                        <p className="text-xs font-black text-slate-100">{section.label}</p>
                        <p className="text-[11px] text-slate-400">{section.hint}</p>
                      </div>
                      <AttachmentPicker
                        label={`${section.label} files`}
                        attachments={subkDocumentDrafts[section.key] || []}
                        uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
                        onChange={attachments => setSubkDocumentDrafts(prev => ({ ...prev, [section.key]: attachments }))}
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    addLockedSubcontractor(contract.id, {
                      companyName: selectedSubkCandidate.companyName,
                      contactName: selectedSubkCandidate.contactName,
                      email: selectedSubkCandidate.email || undefined,
                      phone: selectedSubkCandidate.phone || undefined,
                      setAside: selectedSubkCandidate.setAside || undefined,
                      naicsCode: selectedSubkCandidate.naicsCode || undefined,
                      notes: selectedSubkCandidate.notes || undefined,
                      ...subkDocumentUpdate(subkDocumentDrafts),
                      createdAt: new Date().toISOString(),
                      createdBy: currentUser?.username || currentUser?.name || 'current_user',
                    })
                    setSelectedSubkKey('')
                    setSubkDocumentDrafts({})
                    toast.success('Subcontractor locked to this contract')
                  }}
                  className="btn-primary mt-4 w-full justify-center text-xs"
                >
                  <Shield size={12} /> Lock Subcontractor
                </button>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#D7BE7A]/25 py-8 text-center text-sm text-slate-400">
                Choose a subcontractor from Potential Subk before locking documents.
              </p>
            )}

            {(contract.lockedSubcontractors || []).length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Locked subcontractors</p>
                {(contract.lockedSubcontractors || []).map(sub => {
                  const documents = getLockedSubDocuments(sub)
                  return (
                    <div
                      key={sub.id}
                      className="rounded-2xl border p-4"
                      style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.24)' }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-slate-100">{sub.companyName}</p>
                          <p className="text-xs text-slate-300">{sub.contactName || 'No contact listed'}</p>
                          {sub.email && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><Mail size={10} />{sub.email}</p>}
                        </div>
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-100">
                          {subkDocumentTotal(documents)} files
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {SUBK_DOCUMENT_SECTIONS.map(section => (
                          <div key={section.key} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-black text-slate-100">{section.label}</p>
                                <p className="text-[11px] text-slate-400">{section.hint}</p>
                              </div>
                              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                {(documents[section.key] || []).length}
                              </span>
                            </div>
                            <AttachmentPicker
                              label={`${section.label} files`}
                              attachments={documents[section.key] || []}
                              uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
                              onChange={attachments => {
                                const nextDocuments = { ...documents, [section.key]: attachments }
                                updateLockedSubcontractor(contract.id, sub.id, subkDocumentUpdate(nextDocuments))
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
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
              const commentDraft = warningCommentDrafts[w.id] ?? ''
              const isEditingWarning = editingWarningId === w.id
              const isConfirmingDelete = confirmDeleteWarningId === w.id
              return (
                <div key={w.id} className="p-4 rounded-xl border"
                  style={{ background: sev.bg, borderColor: sev.color + '40' }}>
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: sev.color }}>
                        {GOV_WARNING_META[w.type]?.label || w.type}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: sev.color + '20', color: sev.color }}>
                        {w.severity}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-slate-300/70 bg-white/65 px-2 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:bg-white"
                        onClick={() => {
                          setConfirmDeleteWarningId(null)
                          setEditingWarningId(w.id)
                          setWarningEditForm({
                            type: w.type,
                            issuedDate: w.issuedDate,
                            description: w.description,
                          })
                        }}
                      >
                        <Pencil size={10} /> Edit
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 transition-colors hover:bg-red-100"
                        onClick={() => {
                          setEditingWarningId(null)
                          setConfirmDeleteWarningId(w.id)
                        }}
                      >
                        <Trash2 size={10} /> Delete
                      </button>
                    </div>
                  </div>

                  {isEditingWarning ? (
                    <div className="mb-3 space-y-2 rounded-lg bg-white/65 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</label>
                          <select
                            value={warningEditForm.type}
                            onChange={e => setWarningEditForm(prev => ({ ...prev, type: e.target.value as GovWarningType }))}
                            className="input-field w-full py-1.5 text-xs"
                          >
                            {(Object.keys(GOV_WARNING_META) as GovWarningType[]).map(t => (
                              <option key={t} value={t}>{GOV_WARNING_META[t].label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Issued Date</label>
                          <input
                            type="date"
                            value={warningEditForm.issuedDate}
                            onChange={e => setWarningEditForm(prev => ({ ...prev, issuedDate: e.target.value }))}
                            className="input-field w-full py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Description</label>
                        <textarea
                          rows={2}
                          value={warningEditForm.description}
                          onChange={e => setWarningEditForm(prev => ({ ...prev, description: e.target.value }))}
                          className="input-field w-full resize-none py-1.5 text-xs"
                        />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => setEditingWarningId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!warningEditForm.issuedDate || !warningEditForm.description.trim()}
                          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={() => {
                            const severity = GOV_WARNING_META[warningEditForm.type].severity
                            updateGovernmentWarning(contract.id, w.id, {
                              type: warningEditForm.type,
                              issuedDate: warningEditForm.issuedDate,
                              description: warningEditForm.description.trim(),
                              severity,
                            })
                            setEditingWarningId(null)
                            toast.success('Warning updated')
                          }}
                        >
                          <Save size={12} /> Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-700 mb-1">{w.description}</p>
                      <p className="text-[10px] text-slate-500">Issued: {w.issuedDate}</p>
                    </>
                  )}

                  {isConfirmingDelete && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-red-700">Delete this warning permanently?</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-secondary py-1 text-xs"
                            onClick={() => setConfirmDeleteWarningId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
                            onClick={() => {
                              removeGovernmentWarning(contract.id, w.id)
                              setConfirmDeleteWarningId(null)
                              if (editingWarningId === w.id) setEditingWarningId(null)
                              toast.success('Warning deleted')
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(w.attachments || []).length > 0 && (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-white/60 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Attachments</p>
                      {(w.attachments || []).map(att => (
                        <div key={att.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                          <span className="flex min-w-0 items-center gap-1 truncate font-semibold"><FileText size={10} /> {att.name}</span>
                          <span className="whitespace-nowrap text-slate-400">{formatDateTime(att.attachedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(w.comments || []).length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Comments</p>
                      {(w.comments || []).map(comment => (
                        <div key={comment.id} className="rounded-lg bg-white/65 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-700">{comment.author}</span>
                            <span className="text-[10px] text-slate-400">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-xs text-slate-700">{comment.text}</p>
                          {(comment.attachments || []).map(att => (
                            <p key={att.id} className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
                              <FileText size={9} /> {att.name} - {formatDateTime(att.attachedAt)}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 rounded-lg bg-white/55 p-2">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Add comment</label>
                    <div className="flex gap-2">
                      <input
                        value={commentDraft}
                        onChange={e => setWarningCommentDrafts(prev => ({ ...prev, [w.id]: e.target.value }))}
                        className="input-field flex-1 py-1.5 text-xs"
                        placeholder="Write a timestamped note..."
                      />
                      <button
                        type="button"
                        className="btn-secondary text-xs disabled:opacity-40"
                        disabled={!commentDraft.trim()}
                        onClick={() => {
                          const text = commentDraft.trim()
                          if (!text) return
                          updateGovernmentWarning(contract.id, w.id, {
                            comments: [
                              ...(w.comments || []),
                              {
                                id: crypto.randomUUID(),
                                text,
                                author: currentUser?.username ?? currentUser?.name ?? 'unknown',
                                createdAt: new Date().toISOString(),
                              },
                            ],
                          })
                          setWarningCommentDrafts(prev => ({ ...prev, [w.id]: '' }))
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <AttachmentPicker
                      label="Add warning attachment"
                      attachments={[]}
                      uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
                      onChange={attachments => {
                        updateGovernmentWarning(contract.id, w.id, {
                          attachments: [...(w.attachments || []), ...attachments],
                        })
                      }}
                    />
                  </div>
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
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Initial Comment</label>
                  <textarea rows={2} value={warnForm.comment} onChange={e => setWarnForm(p => ({ ...p, comment: e.target.value }))} className="input-field text-xs py-1.5 w-full resize-none" placeholder="Optional timestamped warning note..." />
                </div>
                <AttachmentPicker
                  attachments={warnForm.attachments}
                  uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
                  onChange={attachments => setWarnForm(p => ({ ...p, attachments }))}
                />
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
                        attachments: warnForm.attachments,
                        comments: warnForm.comment.trim()
                          ? [{
                              id: crypto.randomUUID(),
                              text: warnForm.comment.trim(),
                              author: currentUser?.username ?? currentUser?.name ?? 'unknown',
                              createdAt: new Date().toISOString(),
                            }]
                          : [],
                      })
                      setWarnForm({ type: 'CURE_NOTICE', issuedDate: '', description: '', comment: '', attachments: [] })
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
            {deliverables.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No deliverables tracked.</p>
            )}
            {deliverables.map((deliverable, index) => {
              const isOverdue = deliverable.deadline && new Date(`${deliverable.deadline}T23:59:59`) < new Date()
              const attachmentCount = (deliverable.attachments || []).length
              const attachmentsOpen = openDeliverableAttachments === deliverable.id
              return (
              <div
                key={deliverable.id || index}
                className="rounded-2xl border p-4 shadow-sm"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))',
                  borderColor: 'rgba(215,190,122,0.26)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(99,102,241,0.18)', color: '#C7D2FE', border: '1px solid rgba(199,210,254,0.28)' }}
                  >
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-black text-slate-100">{deliverable.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Added by {deliverable.createdBy || 'Unknown'}{deliverable.createdAt ? ` · ${formatDateTime(deliverable.createdAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isOverdue && (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">Overdue</span>
                        )}
                        <button
                          type="button"
                          disabled={attachmentCount === 0}
                          onClick={() => setOpenDeliverableAttachments(prev => prev === deliverable.id ? null : deliverable.id)}
                          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            borderColor: 'rgba(215,190,122,0.34)',
                            background: attachmentCount > 0 ? 'rgba(215,190,122,0.12)' : 'rgba(148,163,184,0.08)',
                            color: attachmentCount > 0 ? '#F8E8B8' : '#94A3B8',
                          }}
                        >
                          <Paperclip size={12} />
                          {attachmentCount > 0 ? `View attachments (${attachmentCount})` : 'No attachments'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = window.confirm(`Delete deliverable "${deliverable.title}"?`)
                            if (!ok) return
                            const saved = await updateContract(contract.id, {
                              deliverables: deliverables.filter(item => item.id !== deliverable.id),
                            })
                            if (saved) {
                              setOpenDeliverableAttachments(prev => prev === deliverable.id ? null : prev)
                              toast.success('Deliverable deleted')
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold text-red-200 transition-colors hover:bg-red-500/15"
                          style={{
                            borderColor: 'rgba(248,113,113,0.38)',
                            background: 'rgba(248,113,113,0.08)',
                          }}
                          aria-label={`Delete ${deliverable.title}`}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div
                        className="rounded-xl border px-3 py-2.5"
                        style={{ background: 'rgba(7,19,31,0.55)', borderColor: 'rgba(215,190,122,0.20)' }}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Issuance Date</p>
                        <p className="mt-1 text-sm font-bold text-slate-100">{formatDate(deliverable.issuanceDate)}</p>
                      </div>
                      <div
                        className="rounded-xl border px-3 py-2.5"
                        style={{ background: 'rgba(7,19,31,0.55)', borderColor: isOverdue ? 'rgba(248,113,113,0.42)' : 'rgba(215,190,122,0.20)' }}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Deadline</p>
                        <p className={`mt-1 text-sm font-bold ${isOverdue ? 'text-red-300' : 'text-slate-100'}`}>
                          {formatDate(deliverable.deadline)}
                        </p>
                      </div>
                    </div>
                    {attachmentsOpen && (
                      <div
                        className="mt-3 rounded-xl border px-3 py-3"
                        style={{ background: 'rgba(7,19,31,0.62)', borderColor: 'rgba(215,190,122,0.24)' }}
                      >
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                          <Paperclip size={12} /> Attachments
                        </p>
                        <div className="space-y-2">
                          {(deliverable.attachments || []).map(att => (
                            <div
                              key={att.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)' }}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-100">{att.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {formatDateTime(att.attachedAt)}
                                  {formatFileSize(att.size) ? ` Â· ${formatFileSize(att.size)}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => viewAttachment(att)}
                                className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-900 transition-colors hover:bg-[#F8E8B8]"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadAttachment(att)}
                                className="flex items-center gap-1.5 rounded-lg border border-[#D7BE7A]/35 bg-[#D7BE7A]/15 px-2.5 py-1.5 text-[11px] font-black text-[#F8E8B8] transition-colors hover:bg-[#D7BE7A]/25"
                              >
                                <Download size={12} /> Download
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
            <div
              className="rounded-2xl border border-dashed p-4"
              style={{ background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.28)' }}
            >
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-200 mb-1.5">Deliverable *</label>
                  <input
                    className="input-field text-xs"
                    value={deliverableForm.title}
                    onChange={e => setDeliverableForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Add deliverable..."
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-200 mb-1.5">Issuance Date *</label>
                    <input
                      type="date"
                      className="input-field text-xs"
                      value={deliverableForm.issuanceDate}
                      onChange={e => setDeliverableForm(p => ({ ...p, issuanceDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-200 mb-1.5">Deadline *</label>
                    <input
                      type="date"
                      className="input-field text-xs"
                      value={deliverableForm.deadline}
                      onChange={e => setDeliverableForm(p => ({ ...p, deadline: e.target.value }))}
                    />
                  </div>
                </div>
                <AttachmentPicker
                  label="Deliverable Attachments"
                  attachments={deliverableForm.attachments}
                  uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
                  onChange={attachments => setDeliverableForm(p => ({ ...p, attachments }))}
                />
                <button
                  type="button"
                  disabled={!deliverableForm.title.trim() || !deliverableForm.issuanceDate || !deliverableForm.deadline}
                  onClick={async () => {
                    const nextDeliverable: ContractDeliverable = {
                      id: crypto.randomUUID(),
                      title: deliverableForm.title.trim(),
                      issuanceDate: deliverableForm.issuanceDate,
                      deadline: deliverableForm.deadline,
                      attachments: deliverableForm.attachments,
                      createdAt: new Date().toISOString(),
                      createdBy: currentUser?.username ?? currentUser?.name ?? 'unknown',
                    }
                    const saved = await updateContract(contract.id, {
                      deliverables: [...deliverables, nextDeliverable],
                    })
                    if (saved) {
                      setDeliverableForm({ title: '', issuanceDate: todayDateInput(), deadline: '', attachments: [] })
                      toast.success('Deliverable saved')
                    }
                  }}
                  className="btn-primary w-full text-xs justify-center disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Plus size={12} /> Add Deliverable
                </button>
              </div>
            </div>
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
              style={{ border: '1px solid var(--border-default)' }}
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
    assignedSupportAgent: award.assignedSupportAgent ?? '',
  })

  const handleSave = () => {
    if (!form.assignedSupportAgent.trim()) {
      toast.error('Associate is required before a fresh award can be assigned.')
      return
    }
    assignFreshAward(award.id, {
      assignedBDM: form.assignedBDM || undefined,
      assignedBDS: form.assignedBDS || undefined,
      assignedSupportAgent: form.assignedSupportAgent || undefined,
      status: 'ASSIGNED',
    })
    toast.success('Team assigned to fresh award')
    onClose()
  }

  const fields: { label: string; key: keyof typeof form }[] = [
    { label: 'Manager', key: 'assignedBDM' },
    { label: 'Team Lead', key: 'assignedBDS' },
    { label: 'Associate *', key: 'assignedSupportAgent' },
  ]

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
        onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
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
            <button onClick={handleSave} disabled={!form.assignedSupportAgent.trim()} className="btn-primary flex-1 justify-center disabled:opacity-40">
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

  const visibleFreshAwards = freshAwards.filter(fa => fa.status !== 'MOVED_TO_ACTIVE')
  const assigningAward = assigningId ? visibleFreshAwards.find(fa => fa.id === assigningId) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileCheck2 size={14} className="text-emerald-500" />
        <p className="text-sm font-bold text-slate-700">Fresh Awards</p>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{visibleFreshAwards.length}</span>
      </div>

      {visibleFreshAwards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
          No fresh awards yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
          <div className="overflow-x-auto overflow-y-visible">
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
                {visibleFreshAwards.map((fa, i) => {
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
                          {fa.assignedBDM && <span><span className="text-slate-400">Manager:</span> {fa.assignedBDM}</span>}
                          {fa.assignedBDS && <span><span className="text-slate-400">Team Lead:</span> {fa.assignedBDS}</span>}
                          {fa.assignedSupportAgent && <span><span className="text-slate-400">Associate:</span> {fa.assignedSupportAgent}</span>}
                          {!fa.assignedBDM && !fa.assignedBDS && !fa.assignedSupportAgent && (
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
  const { contracts, employees } = useStore()
  const [tab, setTab] = useState<CTab>('ACTIVE_GROUP')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contract | null>(null)
  const [selectedInitialTab, setSelectedInitialTab] = useState<ContractDrawerTab>('overview')
  const [sourcingOpp, setSourcingOpp] = useState<Opportunity | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const tabDef = C_TABS.find(t => t.key === tab) ?? C_TABS[0]

  const assignmentFor = (c: Contract) => {
    const assignedEmployee = c.assignedTo ? employees.find(e => e.id === c.assignedTo) : null
    const primaryName = assignedEmployee?.name || c.supportAgent || c.pm || c.spm || c.bds || c.bdm || ''
    const primaryRole = assignedEmployee
      ? (ROLE_LABEL_C[assignedEmployee.role] ?? assignedEmployee.role)
      : c.supportAgent
        ? 'Contract Specialist'
        : c.pm
          ? 'PM'
          : c.spm
            ? 'SPM'
            : c.bds
              ? 'Operations Team Lead'
              : c.bdm
                ? 'Operations Manager'
                : ''
    const secondary = [
      c.bdm ? `Manager: ${c.bdm}` : '',
      c.bds ? `Team Lead: ${c.bds}` : '',
    ].filter(Boolean).join(' - ')

    return { employee: assignedEmployee, primaryName, primaryRole, secondary }
  }

  const rowValue = (c: Contract, key: string) => {
    const assignment = assignmentFor(c)
    const activeWarnings = (c.governmentWarnings || []).filter(w => !w.resolvedAt).map(w => GOV_WARNING_META[w.type]?.label || w.type).join(', ')
    const values: Record<string, string> = {
      title: c.title,
      contractId: c.contractId,
      type: c.type === 'S&D' || c.type === 'SUPPLY' ? 'S&D' : c.type,
      status: STATUS_META[c.status]?.label ?? c.status,
      location: c.location,
      popStart: c.popStart,
      popEnd: c.popEnd,
      value: String(c.value ?? ''),
      assigned: [assignment.primaryName, assignment.primaryRole, assignment.secondary].filter(Boolean).join(' '),
      flags: activeWarnings,
      naicsCode: c.naicsCode,
      setAside: c.setAside ?? '',
      client: c.client ?? '',
    }
    return values[key] ?? ''
  }

  const filterFields = [
    { key: 'title', label: 'Title' },
    { key: 'contractId', label: 'Contract ID' },
    { key: 'type', label: 'Contract Type' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Location' },
    { key: 'naicsCode', label: 'NAICS' },
    { key: 'setAside', label: 'Set Aside' },
    { key: 'client', label: 'Client' },
    { key: 'assigned', label: 'Assigned To' },
    { key: 'flags', label: 'Flags' },
  ] as const

  const filterOptions = useMemo(() => {
    return filterFields.reduce((acc, field) => {
      acc[field.key] = Array.from(new Set(contracts.map(c => rowValue(c, field.key).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      return acc
    }, {} as Record<string, string[]>)
  }, [contracts, employees])

  const filtered = useMemo(() => {
    let list = contracts.filter(c => tabDef.statuses.includes(c.status))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.contractId.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        (c.spm ?? '').toLowerCase().includes(q) ||
        (c.pm ?? '').toLowerCase().includes(q) ||
        (c.bdm ?? '').toLowerCase().includes(q) ||
        (c.bds ?? '').toLowerCase().includes(q) ||
        (c.supportAgent ?? '').toLowerCase().includes(q)
      )
    }
    if (period) list = list.filter(c => filterByPeriod(c.popEnd, period))
    filterFields.forEach(field => {
      const q = (columnFilters[field.key] || '').trim().toLowerCase()
      if (!q) return
      list = list.filter(c => rowValue(c, field.key).toLowerCase().includes(q))
    })
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
  }, [contracts, tabDef, search, period, sortKey, sortDir, columnFilters, employees])

  const totalValue = contracts.reduce((s, c) => s + c.value, 0)
  const activeCount = contracts.filter(c => ['ACTIVE', 'ON_GOING', 'PERFORMING', 'KICK_OFF', 'LOCKING_SUB'].includes(c.status)).length
  const warningCount = contracts.reduce((s, c) => s + (c.governmentWarnings || []).filter(w => !w.resolvedAt).length, 0)

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · CONTRACT ADMIN</p>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <FileCheck2 size={22} className="text-indigo-500" /> Contract Admin
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Contract portfolio - {contracts.length} total</p>
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
            const cnt = contracts.filter(c => t.statuses.includes(c.status)).length
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

      <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-700">Column filters</p>
            <p className="text-[11px] text-slate-400">Type in any field and choose a suggestion from live contract data.</p>
          </div>
          <button
            type="button"
            onClick={() => setColumnFilters({})}
            className="btn-secondary text-xs"
          >
            Clear filters
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {filterFields.map(field => (
            <div key={field.key}>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</label>
              <input
                value={columnFilters[field.key] || ''}
                list={`contract-filter-${field.key}`}
                onChange={e => setColumnFilters(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="input-field w-full py-1.5 text-xs"
                placeholder={`Any ${field.label.toLowerCase()}`}
              />
              <datalist id={`contract-filter-${field.key}`}>
                {(filterOptions[field.key] || []).map(option => <option key={option} value={option} />)}
              </datalist>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader col="title" label="Title" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Contract ID</th>
                <th>Type</th>
                <SortHeader col="status" label="Status" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader col="location" label="Location" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>POP</th>
                <SortHeader col="value" label="Value" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Assigned To</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 text-sm">
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
                    onClick={() => { setSelectedInitialTab('overview'); setSelected(c); setMenuOpen(null) }}
                  >
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
                        const assignment = assignmentFor(c)
                        const assignedEmployee = c.assignedTo ? employees.find(e => e.id === c.assignedTo) : null
                        const emp = assignedEmployee || (assignment.primaryName ? { name: assignment.primaryName, role: 'ASSOCIATE' as const } : null)
                        if (!emp) return <span className="text-slate-400">—</span>
                        const rc = ROLE_COLOR_C[emp.role] ?? ROLE_COLOR_C.ASSOCIATE
                        return (
                          <div className="flex min-w-[180px] flex-col gap-1">
                            <span className="text-xs text-slate-700 font-semibold whitespace-nowrap">{assignment.primaryName || emp.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
                              style={{ color: rc.color, background: rc.bg, border: `1px solid ${rc.border}` }}>
                              {assignment.primaryRole || (ROLE_LABEL_C[emp.role] ?? emp.role)}
                            </span>
                            {assignment.secondary && (
                              <span className="max-w-[220px] truncate text-[10px] text-slate-400" title={assignment.secondary}>
                                {assignment.secondary}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="text-xs" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {activeWarnings.length > 0 && (
                          <div className="flex max-w-[180px] flex-wrap gap-1">
                            {activeWarnings.map(w => (
                              <span key={w.id} className="flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                                <AlertTriangle size={9} /> {GOV_WARNING_META[w.type]?.label || w.type}
                              </span>
                            ))}
                          </div>
                        )}
                        {(c.pocs || []).length > 0 && (
                          <span className="text-[10px] text-indigo-500 font-bold">
                            {(c.pocs || []).length}P
                          </span>
                        )}
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <FloatingActionMenu
                        open={menuOpen === c.id}
                        onOpenChange={open => setMenuOpen(open ? c.id : null)}
                        trigger={<MoreHorizontal size={14} />}
                      >
                        {[
                          { label: 'View Details', icon: ChevronRight, tab: 'overview' as ContractDrawerTab },
                          { label: 'Edit POP', icon: Calendar, tab: 'pop' as ContractDrawerTab },
                          { label: 'Add PoC', icon: UserPlus, tab: 'poc' as ContractDrawerTab },
                          { label: 'Locked Subk', icon: Building2, tab: 'lockSubk' as ContractDrawerTab },
                          { label: 'Issue Warning', icon: AlertTriangle, tab: 'warnings' as ContractDrawerTab },
                        ].map(item => (
                          <button key={item.label} onClick={() => { setSelectedInitialTab(item.tab); setSelected(c); setMenuOpen(null) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#475569' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}
                          >
                            <item.icon size={11} className="text-slate-400" />
                            {item.label}
                          </button>
                        ))}
                      </FloatingActionMenu>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}
              onClick={() => setSelected(null)} />
            <ContractDetailDrawer
              key={selected.id}
              contract={contracts.find(c => c.id === selected.id) || selected}
              initialTab={selectedInitialTab}
              onClose={() => setSelected(null)}
              onOpenSourcing={opp => {
                setSelected(null)
                setSourcingOpp(opp)
              }}
            />
          </>
        )}
      </AnimatePresence>

      {sourcingOpp && (
        <SourcingModal opp={sourcingOpp} onClose={() => setSourcingOpp(null)} />
      )}

    </div>
  )
}
