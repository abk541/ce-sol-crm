import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, MoreHorizontal, FileCheck2, UserPlus, Building2,
  AlertTriangle, ListChecks, ChevronRight, X, Save, Plus,
  ArrowRight, CheckCircle2, Info, MapPin, Calendar,
  Phone, Mail, Clock, Shield, FileText, Trash2, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Receipt, Eye, Paperclip, Download,
  UserCog, Layers, Minus,
} from 'lucide-react'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type {
  Contract, ContractStatus, ContractType, ContractFinanceType, SetAside,
  ContractPoC, LockedSubcontractor,
  GovernmentWarning, GovWarningType, FileAttachment, Comment, ContractDeliverable,
  LockedSubkDocuments, Subcontractor, Opportunity,
  ContractLineItem, ContractLineYear,
} from '../types'
import { formatCurrency, useEscapeKey } from '../lib/utils'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'
import {
  canGenerateContractInvoice,
  generateContractInvoicePdf,
  invoiceAmountForContract,
  subkMonthlyBillingRowsForContract,
  subkQuoteSummaryForContract,
} from '../lib/invoicePdf'
import { normalizeContractDeliverables } from '../lib/contractDeliverables'
import { SourcingModal, SamGovContactsPanel } from './PipelinePage'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'

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
  // "Active" = anything that isn't ARCHIVED or TERMINATED (Pending Payment + Canceled count as active too).
  { key: 'ACTIVE_GROUP',  label: 'Active',         statuses: ['KICK_OFF','LOCKING_SUB','ACTIVE','ON_GOING','PERFORMING','PENDING_PAYMENT','CANCELED'] },
  { key: 'KICK_OFF',      label: 'Kick-Off',       statuses: ['KICK_OFF'] },
  { key: 'LOCKING_SUB',   label: 'Locking Sub',    statuses: ['LOCKING_SUB'] },
  { key: 'PERFORMING',    label: 'Performing',     statuses: ['PERFORMING'] },
  { key: 'PENDING_PAYMENT',label:'Pend. Payment',  statuses: ['PENDING_PAYMENT'] },
  { key: 'ARCHIVED',      label: 'Archived',       statuses: ['ARCHIVED'] },
  { key: 'TERMINATED',    label: 'Terminated',     statuses: ['TERMINATED'] },
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

async function generateInvoiceFile(contract: Contract, invoiceNumber?: number) {
  try {
    await generateContractInvoicePdf(contract, { invoiceNumber })
    toast.success(
      invoiceNumber
        ? `Invoice INV-${String(invoiceNumber).padStart(4, '0')} generated`
        : 'Invoice PDF generated'
    )
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

type ContractDrawerTab = 'overview' | 'pop' | 'poc' | 'subk' | 'lockSubk' | 'warnings' | 'deliverables' | 'lineItems' | 'billing' | 'assignment'

const LINE_YEAR_LABELS: Record<ContractLineYear, string> = {
  base: 'Base year',
  option1: 'Option year 1',
  option2: 'Option year 2',
  option3: 'Option year 3',
  option4: 'Option year 4',
}

const LINE_YEAR_ORDER: ContractLineYear[] = ['base', 'option1', 'option2', 'option3', 'option4']

function QuantityStepper({
  value,
  onChange,
  compact = false,
}: {
  value: string
  onChange: (next: string) => void
  compact?: boolean
}) {
  const step = (delta: number) => {
    const n = Number(value)
    const base = Number.isFinite(n) ? Math.floor(n) : 0
    const next = Math.max(0, base + delta)
    onChange(String(next))
  }
  const btnSize = compact ? 'h-[30px] w-7' : 'h-[38px] w-9'
  const inputSize = compact ? 'h-[30px] text-xs' : 'h-[38px] text-sm'
  return (
    <div
      className="flex items-stretch rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        className={`${btnSize} flex items-center justify-center text-[#D7BE7A] hover:bg-[rgba(184,145,78,0.18)] active:bg-[rgba(184,145,78,0.28)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-r`}
        style={{ borderColor: 'rgba(215,190,122,0.18)' }}
        disabled={Number(value) <= 0}
        aria-label="Decrease quantity"
      >
        <Minus size={compact ? 12 : 14} strokeWidth={2.5} />
      </button>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-center font-bold text-[#F8E8B8] no-spin ${inputSize}`}
      />
      <button
        type="button"
        onClick={() => step(1)}
        className={`${btnSize} flex items-center justify-center text-[#D7BE7A] hover:bg-[rgba(184,145,78,0.18)] active:bg-[rgba(184,145,78,0.28)] transition-colors border-l`}
        style={{ borderColor: 'rgba(215,190,122,0.18)' }}
        aria-label="Increase quantity"
      >
        <Plus size={compact ? 12 : 14} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function ContractLineItemsTab({
  contract,
  onAdd,
  onUpdate,
  onRemove,
}: {
  contract: Contract
  onAdd: (line: { year: ContractLineYear; description: string; quantity: number; unit: string; rate: number }) => string | null
  onUpdate: (lineId: string, data: Partial<Omit<ContractLineItem, 'id' | 'contractId' | 'clin'>>) => void
  onRemove: (lineId: string) => void
}) {
  const lineItems = useMemo(() => {
    return [...(contract.lineItems || [])].sort((a, b) => {
      const ay = LINE_YEAR_ORDER.indexOf(a.year)
      const by = LINE_YEAR_ORDER.indexOf(b.year)
      if (ay !== by) return ay - by
      return a.clin.localeCompare(b.clin)
    })
  }, [contract.lineItems])

  const allowedYears = useMemo<ContractLineYear[]>(() => {
    const optionCount = Math.max(0, Math.min(4, contract.optionYears ?? 4))
    return LINE_YEAR_ORDER.slice(0, 1 + optionCount)
  }, [contract.optionYears])

  const [draft, setDraft] = useState<{
    year: ContractLineYear
    description: string
    quantity: string
    unit: string
    rate: string
  }>({ year: allowedYears[0] ?? 'base', description: '', quantity: '1', unit: 'EA', rate: '0' })

  useEffect(() => {
    if (!allowedYears.includes(draft.year)) {
      setDraft(d => ({ ...d, year: allowedYears[0] ?? 'base' }))
    }
  }, [allowedYears, draft.year])

  const draftAmount = (() => {
    const q = Number(draft.quantity) || 0
    const r = Number(draft.rate) || 0
    return Number((q * r).toFixed(2))
  })()

  const draftValid = draft.description.trim().length > 0 && Number(draft.quantity) > 0 && Number(draft.rate) >= 0

  const handleAdd = () => {
    if (!draftValid) {
      toast.error('Description, quantity, and rate are required')
      return
    }
    const id = onAdd({
      year: draft.year,
      description: draft.description.trim(),
      quantity: Number(draft.quantity) || 0,
      unit: (draft.unit || 'EA').trim().toUpperCase(),
      rate: Number(draft.rate) || 0,
    })
    if (id) {
      toast.success('Line item added')
      setDraft(d => ({ ...d, description: '', quantity: '1', rate: '0' }))
    }
  }

  const totalsByYear = useMemo(() => {
    const totals: Partial<Record<ContractLineYear, number>> = {}
    for (const l of lineItems) totals[l.year] = (totals[l.year] || 0) + l.amount
    return totals
  }, [lineItems])

  const grandTotal = lineItems.reduce((s, l) => s + l.amount, 0)

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl border p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(15,46,54,0.94), rgba(10,29,43,0.96))',
          borderColor: 'rgba(215,190,122,0.24)',
        }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">Contract line items</p>
        <h3 className="text-base font-bold text-slate-100 mt-1">Add a line</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Pick the year, describe the work, then enter quantity / unit / rate. The CLIN number is generated automatically:
          base year starts at 0001, option year 1 at 1001, option year 2 at 2001, and so on. Up to 1 base year + 4 option years.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Year</label>
            <select
              value={draft.year}
              onChange={e => setDraft({ ...draft, year: e.target.value as ContractLineYear })}
              className="input-field w-full"
            >
              {allowedYears.map(y => (
                <option key={y} value={y}>{LINE_YEAR_LABELS[y]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
            <input
              type="text"
              value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="e.g. Hazard tree removal services"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Quantity</label>
            <QuantityStepper
              value={draft.quantity}
              onChange={v => setDraft({ ...draft, quantity: v })}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Unit</label>
            <input
              type="text"
              value={draft.unit}
              onChange={e => setDraft({ ...draft, unit: e.target.value })}
              placeholder="EA"
              className="input-field w-full uppercase"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Rate ($)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.rate}
              onChange={e => setDraft({ ...draft, rate: e.target.value })}
              className="input-field w-full no-spin"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Amount</label>
            <div
              className="rounded-xl border px-3 py-2 text-sm font-bold text-[#F8E8B8]"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(215,190,122,0.22)' }}
            >
              {formatCurrency(draftAmount)}
            </div>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draftValid}
              className="btn-primary w-full disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Plus size={12} /> Add line
            </button>
          </div>
        </div>
      </div>

      {lineItems.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ background: 'rgba(8,24,37,0.55)', borderColor: 'rgba(215,190,122,0.18)' }}
        >
          <Layers size={28} className="mx-auto text-slate-500" />
          <p className="text-sm text-slate-400 mt-2 font-semibold">No line items yet</p>
          <p className="text-xs text-slate-500 mt-1">Add the first CLIN above to get started.</p>
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.24)' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(215,190,122,0.18)' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">All lines</p>
            <p className="text-xs text-slate-300 font-semibold">
              Total: <span className="text-[#F8E8B8] font-bold">{formatCurrency(grandTotal)}</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'rgba(215,190,122,0.10)' }}>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">CLIN</th>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Year</th>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Description</th>
                  <th className="text-right px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Qty</th>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Unit</th>
                  <th className="text-right px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Rate</th>
                  <th className="text-right px-3 py-2 font-bold uppercase tracking-wide text-[10px] text-[#D7BE7A]">Amount</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {LINE_YEAR_ORDER.map(year => {
                  const rows = lineItems.filter(l => l.year === year)
                  if (rows.length === 0) return null
                  return (
                    <>
                      <tr key={`hdr-${year}`}>
                        <td colSpan={8} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400" style={{ background: 'rgba(255,255,255,0.025)' }}>
                          {LINE_YEAR_LABELS[year]} · {formatCurrency(totalsByYear[year] || 0)}
                        </td>
                      </tr>
                      {rows.map(line => (
                        <LineItemRow
                          key={line.id}
                          line={line}
                          onUpdate={data => onUpdate(line.id, data)}
                          onRemove={() => onRemove(line.id)}
                        />
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function LineItemRow({
  line,
  onUpdate,
  onRemove,
}: {
  line: ContractLineItem
  onUpdate: (data: Partial<Omit<ContractLineItem, 'id' | 'contractId' | 'clin'>>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    rate: String(line.rate),
  })

  useEffect(() => {
    if (!editing) {
      setDraft({
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        rate: String(line.rate),
      })
    }
  }, [line, editing])

  const save = () => {
    const quantity = Number(draft.quantity) || 0
    const rate = Number(draft.rate) || 0
    onUpdate({
      description: draft.description.trim(),
      quantity,
      unit: (draft.unit || 'EA').trim().toUpperCase(),
      rate,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr style={{ borderTop: '1px solid rgba(215,190,122,0.10)' }}>
        <td className="px-3 py-2 font-mono font-bold text-[#F8E8B8]">{line.clin}</td>
        <td className="px-3 py-2 text-slate-300 text-[11px]">{LINE_YEAR_LABELS[line.year]}</td>
        <td className="px-3 py-2">
          <input className="input-field w-full text-xs" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
        </td>
        <td className="px-3 py-2 w-32">
          <QuantityStepper
            value={draft.quantity}
            onChange={v => setDraft({ ...draft, quantity: v })}
            compact
          />
        </td>
        <td className="px-3 py-2 w-20">
          <input className="input-field w-full text-xs uppercase" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
        </td>
        <td className="px-3 py-2 w-28">
          <input className="input-field w-full text-xs text-right no-spin" type="number" min={0} step="0.01" value={draft.rate} onChange={e => setDraft({ ...draft, rate: e.target.value })} />
        </td>
        <td className="px-3 py-2 text-right text-[#F8E8B8] font-bold">{formatCurrency((Number(draft.quantity) || 0) * (Number(draft.rate) || 0))}</td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={save} className="p-1.5 rounded-md text-emerald-300 hover:bg-emerald-900/40" title="Save"><Save size={12} /></button>
            <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded-md text-slate-400 hover:bg-white/10" title="Cancel"><X size={12} /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderTop: '1px solid rgba(215,190,122,0.10)' }}>
      <td className="px-3 py-2 font-mono font-bold text-[#F8E8B8]">{line.clin}</td>
      <td className="px-3 py-2 text-slate-400 text-[11px]">{LINE_YEAR_LABELS[line.year]}</td>
      <td className="px-3 py-2 text-slate-200">{line.description || <span className="italic text-slate-500">(no description)</span>}</td>
      <td className="px-3 py-2 text-right text-slate-200">{line.quantity}</td>
      <td className="px-3 py-2 text-slate-300">{line.unit}</td>
      <td className="px-3 py-2 text-right text-slate-200">{formatCurrency(line.rate)}</td>
      <td className="px-3 py-2 text-right text-[#F8E8B8] font-bold">{formatCurrency(line.amount)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => setEditing(true)} className="p-1.5 rounded-md text-slate-300 hover:bg-white/10" title="Edit"><Pencil size={12} /></button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete CLIN ${line.clin}?`)) onRemove()
            }}
            className="p-1.5 rounded-md text-red-300 hover:bg-red-900/40"
            title="Delete"
          ><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  )
}

function ContractBillingTab({
  contract,
  nextInvoiceNumber,
  invoiceReady,
  onSaveServiceDate,
  onGenerateInvoice,
}: {
  contract: Contract
  nextInvoiceNumber: number
  invoiceReady: boolean
  onSaveServiceDate: (value: string) => Promise<void> | void
  onGenerateInvoice: () => void
}) {
  const [draft, setDraft] = useState(contract.serviceDate || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(contract.serviceDate || '') }, [contract.serviceDate])

  const dirty = draft !== (contract.serviceDate || '')
  const padded = String(Math.max(1, nextInvoiceNumber || 1)).padStart(4, '0')
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const savedDisplay = (() => {
    if (!contract.serviceDate) return null
    const d = new Date(`${contract.serviceDate}T00:00:00`)
    if (!Number.isFinite(d.getTime())) return contract.serviceDate
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl border p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(15,46,54,0.94), rgba(10,29,43,0.96))',
          borderColor: 'rgba(215,190,122,0.24)',
        }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">Billing period</p>
        <h3 className="text-base font-bold text-slate-100 mt-1">Service date for the next invoice</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          The service date you enter here is printed on every invoice generated for this contract.
          The invoice date is set to today and the invoice number is incremented automatically.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Service date</label>
            <input
              type="date"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="input-field w-full"
            />
            {savedDisplay && !dirty && (
              <p className="text-[11px] text-slate-400 mt-1.5">Currently saved: <span className="text-slate-200 font-semibold">{savedDisplay}</span></p>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            {contract.serviceDate && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  await onSaveServiceDate('')
                  setSaving(false)
                  setDraft('')
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-900/30 border border-red-700/40 hover:bg-red-900/50 transition-colors disabled:opacity-45"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={async () => {
                setSaving(true)
                await onSaveServiceDate(draft)
                setSaving(false)
              }}
              className="btn-primary disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Save size={12} /> {saving ? 'Saving…' : 'Save service date'}
            </button>
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border p-5"
        style={{ background: 'rgba(8,24,37,0.72)', borderColor: 'rgba(215,190,122,0.24)' }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">Next invoice</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(215,190,122,0.22)' }}>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Invoice #</p>
            <p className="text-lg font-bold text-[#F8E8B8] mt-1 font-mono">INV-{padded}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(215,190,122,0.22)' }}>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Invoice date</p>
            <p className="text-sm font-bold text-slate-100 mt-1">{today}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Set automatically</p>
          </div>
          <div className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(215,190,122,0.22)' }}>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Service date</p>
            <p className="text-sm font-bold text-slate-100 mt-1">{savedDisplay || 'Not set'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGenerateInvoice}
          disabled={!invoiceReady}
          title={!invoiceReady ? 'OTJ invoices are generated when the contract reaches Pending Payment.' : 'Generate invoice PDF'}
          className="btn-primary mt-4 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Receipt size={12} /> Generate invoice now
        </button>
      </div>
    </div>
  )
}

function ContractAssignmentTab({
  contract,
  onSave,
}: {
  contract: Contract
  onSave: (employeeId: string) => Promise<boolean>
}) {
  const { employees } = useStore()
  const [draft, setDraft] = useState(contract.assignedTo || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(contract.assignedTo || '') }, [contract.assignedTo])

  const current = useMemo(
    () => (contract.assignedTo ? employees.find(e => e.id === contract.assignedTo) : undefined),
    [employees, contract.assignedTo],
  )
  const dirty = draft !== (contract.assignedTo || '')

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl border p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(15,46,54,0.94), rgba(10,29,43,0.96))',
          borderColor: 'rgba(215,190,122,0.24)',
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">Operations team assignment</p>
            <h3 className="text-base font-bold text-slate-100 mt-1">Who owns this contract day-to-day?</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Contracts are assigned to the <span className="text-slate-200 font-semibold">Operations</span> hierarchy —
              a separate team from BD (which owns opportunities and sourcing). Pick a Manager → Team Lead → Contract Specialist.
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 border"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(215,190,122,0.22)' }}>
            <div className="w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold"
              style={{ background: '#102820', color: '#F8E8B8', borderColor: 'rgba(215,190,122,0.45)' }}>
              {current?.avatar || '—'}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Currently assigned</p>
              <p className="text-xs font-bold text-slate-100 truncate max-w-[200px]">
                {current?.name || 'Unassigned'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <HierarchyAssignPicker
        value={draft}
        onChange={setDraft}
        deadline={contract.popEnd || undefined}
        team="OPS"
        label="Operations hierarchy"
      />

      <div className="flex items-center justify-between gap-3 pt-2">
        {contract.assignedTo ? (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              const ok = await onSave('')
              setSaving(false)
              if (ok) setDraft('')
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-900/30 border border-red-700/40 hover:bg-red-900/50 transition-colors disabled:opacity-45"
          >
            <Trash2 size={12} /> Clear assignment
          </button>
        ) : <span />}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setDraft(contract.assignedTo || '')}
            className="btn-secondary disabled:opacity-45 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={saving || !dirty || !draft}
            onClick={async () => {
              if (!draft) { toast.error('Select an Operations team member.'); return }
              setSaving(true)
              await onSave(draft)
              setSaving(false)
            }}
            className="btn-primary disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Save size={13} /> Save Assignment
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const { updateContract, addContractPoC, updateContractPoC, removeContractPoC, addLockedSubcontractor, updateLockedSubcontractor, addGovernmentWarning, updateGovernmentWarning, removeGovernmentWarning, resolveGovernmentWarning, advanceContractStatus, terminateContract, currentUser, employees, opportunities, subcontractors, subkDatabase, nextInvoiceNumber, consumeInvoiceNumber, addContractLineItem, updateContractLineItem, removeContractLineItem } = useStore()
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

  // Edit Details form
  const buildEditForm = (c: Contract) => ({
    title: c.title,
    contractId: c.contractId,
    type: c.type,
    financeType: (c.financeType || '') as ContractFinanceType | '',
    naicsCode: c.naicsCode || '',
    setAside: (c.setAside || '') as SetAside | '',
    location: c.location || '',
    client: c.client || '',
    value: c.value != null ? String(c.value) : '',
    baseAmount: c.baseAmount != null ? String(c.baseAmount) : '',
    monthlyPayment: c.monthlyPayment != null ? String(c.monthlyPayment) : '',
    optionYears: c.optionYears != null ? String(c.optionYears) : '',
    optionYearDeadline: c.optionYearDeadline || '',
    supportAgent: c.supportAgent || '',
    billingNotes: c.billingNotes || '',
  })
  const [showEditDetails, setShowEditDetails] = useState(false)
  const [editForm, setEditForm] = useState(() => buildEditForm(contract))

  // Terminate form
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateType, setTerminateType] = useState<'T4C' | 'T4D' | 'CANCELED'>('T4C')
  const [terminateReason, setTerminateReason] = useState('')

  useEscapeKey(() => setShowEditDetails(false), showEditDetails)
  useEscapeKey(() => setShowTerminate(false), showTerminate)

  // PoC form
  const [addingPoC, setAddingPoC] = useState(false)
  const [editingPoCId, setEditingPoCId] = useState<string | null>(null)
  const [pocForm, setPocForm] = useState({ role: 'KO' as ContractPoC['role'], name: '', email: '', phone: '', notes: '' })

  // Subk selection and locking
  const [selectedSubkKey, setSelectedSubkKey] = useState('')
  const [openSubkHistoryKey, setOpenSubkHistoryKey] = useState<string | null>(null)
  const [subkDocumentDrafts, setSubkDocumentDrafts] = useState<LockedSubkDocuments>({})
  const [subkPaymentRateDraft, setSubkPaymentRateDraft] = useState('')
  const [lockedSubRateDrafts, setLockedSubRateDrafts] = useState<Record<string, string>>({})
  const [lockedSubWebsiteDrafts, setLockedSubWebsiteDrafts] = useState<Record<string, string>>({})

  // Gov warning form
  const [addingWarning, setAddingWarning] = useState(false)
  const [warnForm, setWarnForm] = useState({
    type: 'CURE_NOTICE' as GovWarningType,
    issuedDate: '',
    deadline: '',
    description: '',
    comment: '',
    attachments: [] as FileAttachment[],
  })
  const [warningCommentDrafts, setWarningCommentDrafts] = useState<Record<string, string>>({})
  const [editingWarningId, setEditingWarningId] = useState<string | null>(null)
  const [warningEditForm, setWarningEditForm] = useState({
    type: 'CURE_NOTICE' as GovWarningType,
    issuedDate: '',
    deadline: '',
    description: '',
  })
  const [confirmDeleteWarningId, setConfirmDeleteWarningId] = useState<string | null>(null)

  // Edit status
  const [editingStatus, setEditingStatus] = useState(false)

  // Reassign contract (OPS team)
  const [showReassign, setShowReassign] = useState(false)
  const [reassignDraft, setReassignDraft] = useState(contract.assignedTo || '')
  const [reassignSaving, setReassignSaving] = useState(false)
  useEscapeKey(() => setShowReassign(false), showReassign)
  useEffect(() => {
    if (showReassign) setReassignDraft(contract.assignedTo || '')
  }, [showReassign, contract.assignedTo])

  // Edit details tab
  type EditDetailsTab = 'details' | 'finance' | 'notes'
  const [editDetailsTab, setEditDetailsTab] = useState<EditDetailsTab>('details')
  const EDIT_DETAILS_TABS: { id: EditDetailsTab; label: string }[] = [
    { id: 'details', label: 'Identity' },
    { id: 'finance', label: 'Finance' },
    { id: 'notes',   label: 'Notes' },
  ]
  useEffect(() => {
    if (showEditDetails) setEditDetailsTab('details')
  }, [showEditDetails])

  const nextStatus = STATUS_FLOW[contract.status]
  const meta = STATUS_META[contract.status]
  const sourceOpportunity =
    (contract.opportunityId ? opportunities.find(o => o.id === contract.opportunityId) : undefined) ||
    (contract.contractId ? opportunities.find(o => o.solicitationId === contract.contractId) : undefined)
  const proposalFiles = Array.from(new Set([
    ...(sourceOpportunity?.proposals ?? []),
    ...(sourceOpportunity?.assignedOpportunities ?? []),
  ].map(name => name.trim()).filter(Boolean)))
  const contractProposalAttachments = contract.proposalAttachments ?? []
  const oppProposalAttachments = sourceOpportunity?.proposalAttachments ?? []
  const seenProposalNames = new Set<string>()
  const uploadedProposalAttachments: FileAttachment[] = []
  ;[...contractProposalAttachments, ...oppProposalAttachments].forEach(att => {
    const key = (att.id || att.name || '').trim()
    if (!key || seenProposalNames.has(key)) return
    seenProposalNames.add(key)
    uploadedProposalAttachments.push(att)
  })
  const uploadedProposalNames = new Set(uploadedProposalAttachments.map(att => att.name.trim()).filter(Boolean))
  const proposalAttachments = [
    ...uploadedProposalAttachments,
    ...legacyAttachments(
      proposalFiles.filter(name => !uploadedProposalNames.has(name)),
      sourceOpportunity?.bdm || 'Submitted Proposal',
    ),
  ]
  const proposalCount = proposalAttachments.length

  // One-time backfill: if the contract has no persisted proposals but we found
  // them on the source opportunity, snapshot them onto the contract so the
  // proposal stays attached to the contract going forward.
  useEffect(() => {
    if (!contract.proposalAttachments?.length && oppProposalAttachments.length) {
      updateContract(contract.id, { proposalAttachments: oppProposalAttachments })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id])
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
    fromDatabase: boolean
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
      fromDatabase: false,
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
      fromDatabase: false,
    })
  })

  ;(subkDatabase || []).forEach(entry => {
    const companyName = entry.companyName?.trim()
    if (!companyName) return
    const key = subkCompanyKey(companyName, entry.email || '')
    const existing = subkCandidateMap.get(key)
    if (existing) {
      existing.fromDatabase = true
      if (!existing.contactName && entry.contactName) existing.contactName = entry.contactName
      if (!existing.email && entry.email) existing.email = entry.email
      if (!existing.phone && entry.phone) existing.phone = entry.phone
      if (!existing.setAside && entry.setAside) existing.setAside = entry.setAside
      if (!existing.naicsCode && entry.naicsCodes?.length) existing.naicsCode = entry.naicsCodes[0]
      if (!existing.notes && entry.notes) existing.notes = entry.notes
      return
    }
    subkCandidateMap.set(key, {
      key,
      companyName,
      contactName: entry.contactName || '',
      email: entry.email || '',
      phone: entry.phone || '',
      setAside: entry.setAside || '',
      naicsCode: entry.naicsCodes?.[0] || '',
      notes: entry.notes || '',
      entries: sourcingHistoryByKey.get(key) || [],
      currentProject: false,
      fromContractAdmin: false,
      contractSourceQuote: false,
      fromDatabase: true,
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
    <div className="fixed inset-0 z-[51] flex items-center justify-center p-2 sm:p-4" style={{ pointerEvents: 'none' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="flex max-h-[min(92vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
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
          { key: 'lineItems', label: `Line Items (${(contract.lineItems || []).length})`, icon: Layers },
          { key: 'billing', label: 'Billing Period', icon: Receipt },
          { key: 'assignment', label: 'Assignment', icon: UserCog },
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex items-center justify-end lg:col-span-2">
              <button
                type="button"
                onClick={() => { setEditForm(buildEditForm(contract)); setShowEditDetails(true) }}
                className="btn-secondary justify-center gap-1.5 text-xs"
                title="Edit contract details (fix typos and human errors)"
              >
                <Pencil size={12} /> Edit Details
              </button>
            </div>

            {/* ──── Snapshot: hero + tile row ──── */}
            <div className="lg:col-span-2 space-y-3">
              {/* Hero: Financial + POP */}
              <div
                className="relative overflow-hidden rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                style={{
                  background: 'linear-gradient(135deg, rgba(15,46,54,0.94) 0%, rgba(10,29,43,0.96) 60%, rgba(16,40,32,0.94) 100%)',
                  borderColor: 'rgba(215,190,122,0.26)',
                }}
              >
                {/* subtle gold glow */}
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl"
                  style={{ background: 'radial-gradient(circle, rgba(215,190,122,0.35), transparent 70%)' }}
                />
                <div className="relative grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                  {/* Contract Value */}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                      style={{ background: 'rgba(215,190,122,0.12)', borderColor: 'rgba(215,190,122,0.32)', color: '#F8E8B8' }}
                    >
                      <Receipt size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Contract Value</p>
                      <p className="mt-0.5 text-xl font-black text-[#F8E8B8]">{formatCurrency(contract.value)}</p>
                      {contract.financeType && (
                        <p className="text-[10px] text-slate-400">{contract.financeType}</p>
                      )}
                    </div>
                  </div>

                  {/* Base + Monthly */}
                  <div className="flex items-start gap-3 sm:border-l sm:pl-4" style={{ borderColor: 'rgba(215,190,122,0.16)' }}>
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)', color: '#A5F3FC' }}
                    >
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Base Amount</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-100">
                        {contract.baseAmount != null ? formatCurrency(contract.baseAmount) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {contract.monthlyPayment != null ? `${formatCurrency(contract.monthlyPayment)} / mo` : 'No monthly set'}
                      </p>
                    </div>
                  </div>

                  {/* POP */}
                  <div className="flex items-start gap-3 md:border-l md:pl-4" style={{ borderColor: 'rgba(215,190,122,0.16)' }}>
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                      style={{ background: 'rgba(125,211,252,0.10)', borderColor: 'rgba(125,211,252,0.30)', color: '#7DD3FC' }}
                    >
                      <Calendar size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Period of Performance</p>
                      <p className="mt-0.5 truncate text-sm font-bold text-slate-100">
                        {contract.popStart ? formatDate(contract.popStart) : 'TBD'} → {contract.popEnd ? formatDate(contract.popEnd) : 'TBD'}
                      </p>
                      {(() => {
                        if (!contract.popEnd) return <p className="text-[10px] text-slate-400">Set the end date in POP tab</p>
                        const days = Math.ceil((new Date(`${contract.popEnd}T23:59:59`).getTime() - Date.now()) / 86_400_000)
                        if (days < 0) return <p className="text-[10px] font-semibold text-red-300">{Math.abs(days)} days past end</p>
                        if (days === 0) return <p className="text-[10px] font-semibold text-amber-300">Ends today</p>
                        return <p className="text-[10px] font-semibold text-emerald-300">{days} days remaining</p>
                      })()}
                    </div>
                  </div>

                  {/* Option Years */}
                  <div className="flex items-start gap-3 sm:border-l sm:pl-4" style={{ borderColor: 'rgba(215,190,122,0.16)' }}>
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                      style={{ background: 'rgba(196,181,253,0.10)', borderColor: 'rgba(196,181,253,0.28)', color: '#C4B5FD' }}
                    >
                      <Clock size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Option Years</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-100">
                        {contract.optionYears != null ? `${contract.optionYears} remaining` : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {contract.optionYearDeadline ? `Deadline ${formatDate(contract.optionYearDeadline)}` : 'No deadline set'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tile row: cross-tab counts */}
              {(() => {
                const activeWarnings = (contract.governmentWarnings || []).filter(w => !w.resolvedAt)
                const now = Date.now()
                const deliverablesOverdue = deliverables.filter(d => d.deadline && new Date(`${d.deadline}T23:59:59`).getTime() < now).length
                const tiles: {
                  key: ContractDrawerTab
                  label: string
                  count: number
                  icon: typeof UserPlus
                  accent: { bg: string; border: string; color: string }
                  hint?: string
                  alert?: boolean
                }[] = [
                  { key: 'poc',          label: 'Points of Contact', count: (contract.pocs || []).length,                  icon: UserPlus,      accent: { bg: 'rgba(125,211,252,0.10)', border: 'rgba(125,211,252,0.30)', color: '#7DD3FC' } },
                  { key: 'subk',         label: 'Potential Subk',    count: subkCandidates.length,                          icon: Building2,     accent: { bg: 'rgba(252,211,77,0.10)',  border: 'rgba(252,211,77,0.30)',  color: '#FCD34D' } },
                  { key: 'lockSubk',     label: 'Locked Subk',       count: (contract.lockedSubcontractors || []).length,   icon: Shield,        accent: { bg: 'rgba(110,231,183,0.10)', border: 'rgba(110,231,183,0.30)', color: '#6EE7B7' } },
                  { key: 'warnings',     label: 'Gov Warnings',      count: activeWarnings.length,                          icon: AlertTriangle, accent: activeWarnings.length > 0
                    ? { bg: 'rgba(248,113,113,0.16)', border: 'rgba(248,113,113,0.42)', color: '#FCA5A5' }
                    : { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', color: '#94A3B8' },
                    alert: activeWarnings.length > 0, hint: activeWarnings.length > 0 ? `${activeWarnings.length} active` : 'None active' },
                  { key: 'deliverables', label: 'Deliverables',      count: deliverables.length,                            icon: ListChecks,    accent: deliverablesOverdue > 0
                    ? { bg: 'rgba(248,113,113,0.16)', border: 'rgba(248,113,113,0.42)', color: '#FCA5A5' }
                    : { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)', color: '#C4B5FD' },
                    alert: deliverablesOverdue > 0, hint: deliverablesOverdue > 0 ? `${deliverablesOverdue} overdue` : `${deliverables.length} total` },
                ]
                return (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
                    {tiles.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className="group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
                        style={{
                          background: t.alert
                            ? 'linear-gradient(160deg, rgba(60,15,15,0.5), rgba(10,29,43,0.85))'
                            : 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(10,29,43,0.6))',
                          borderColor: t.accent.border,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg border"
                            style={{ background: t.accent.bg, borderColor: t.accent.border, color: t.accent.color }}
                          >
                            <t.icon size={14} />
                          </div>
                          <ChevronRight size={12} className="text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-[#F8E8B8]" />
                        </div>
                        <div>
                          <p className="text-2xl font-black leading-none" style={{ color: t.alert ? '#FCA5A5' : '#F8E8B8' }}>
                            {t.count}
                          </p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{t.label}</p>
                          {t.hint && (
                            <p className="mt-0.5 text-[10px]" style={{ color: t.alert ? '#FCA5A5' : '#94A3B8', fontWeight: t.alert ? 600 : 400 }}>
                              {t.hint}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>

            <div
              className="rounded-xl border p-3 lg:col-span-2"
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
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className="input-field text-xs"
                  value={contractNumberDraft}
                  onChange={e => setContractNumberDraft(e.target.value)}
                  placeholder="Enter contract number manually..."
                />
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

            <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Finance Projection</p>
                <button
                  type="button"
                  onClick={() => generateInvoiceFile(contract, consumeInvoiceNumber())}
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
              className="rounded-xl border p-3 lg:col-span-2"
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team</p>
                <button
                  type="button"
                  onClick={() => setShowReassign(true)}
                  className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  <UserPlus size={11} /> {contract.assignedTo ? 'Reassign' : 'Assign'}
                </button>
              </div>
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
              {contract.assignedTo ? (() => {
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
              })() : (
                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                  <span className="text-[10px] text-slate-400 w-16 flex-shrink-0">Assigned To</span>
                  <span className="text-xs italic text-slate-400">No one assigned yet</span>
                </div>
              )}
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
            {(contract.samGovContacts?.length ?? 0) > 0 && (
              <div className="mb-1">
                <SamGovContactsPanel contacts={contract.samGovContacts} />
              </div>
            )}
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
                Quote-backed sourcing on this contract, subcontractors already added in Contract Admin, plus everyone in your Subk Database.
              </p>
            </div>

            {subkCandidates.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[#D7BE7A]/25 py-8 text-center text-sm text-slate-400">
                No subcontractors yet. Add some to the Subk Database or attach quote-backed sourcing on the linked opportunity.
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
                        {candidate.fromDatabase && !candidate.contractSourceQuote && !candidate.fromContractAdmin && (
                          <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">
                            Subk Database
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

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#D7BE7A] mb-1.5">
                    {contract.type === 'RECURRING' ? 'Subcontractor pay rate ($ / month)' : 'Subcontractor pay rate ($)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={subkPaymentRateDraft}
                    onChange={e => setSubkPaymentRateDraft(e.target.value)}
                    placeholder="0.00"
                    className="input-field w-full no-spin"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Manual amount paid to this subcontractor. Appears in the contract invoice and finance projections.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const rateNum = Number(subkPaymentRateDraft)
                    addLockedSubcontractor(contract.id, {
                      companyName: selectedSubkCandidate.companyName,
                      contactName: selectedSubkCandidate.contactName,
                      email: selectedSubkCandidate.email || undefined,
                      phone: selectedSubkCandidate.phone || undefined,
                      setAside: selectedSubkCandidate.setAside || undefined,
                      naicsCode: selectedSubkCandidate.naicsCode || undefined,
                      notes: selectedSubkCandidate.notes || undefined,
                      paymentRate: subkPaymentRateDraft.trim() && Number.isFinite(rateNum) && rateNum > 0 ? rateNum : undefined,
                      ...subkDocumentUpdate(subkDocumentDrafts),
                      createdAt: new Date().toISOString(),
                      createdBy: currentUser?.username || currentUser?.name || 'current_user',
                    })
                    setSelectedSubkKey('')
                    setSubkDocumentDrafts({})
                    setSubkPaymentRateDraft('')
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
                  const rateDraft = lockedSubRateDrafts[sub.id] ?? (sub.paymentRate != null ? String(sub.paymentRate) : '')
                  const websiteDraft = lockedSubWebsiteDrafts[sub.id] ?? (sub.website ?? '')
                  const rateLabel = contract.type === 'RECURRING' ? 'Pay rate ($ / month)' : 'Pay rate ($)'
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
                        <div className="flex flex-wrap items-center gap-2">
                          {sub.paid && (
                            <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-[10px] font-bold text-emerald-100">
                              Paid
                            </span>
                          )}
                          {typeof sub.paymentRate === 'number' && Number.isFinite(sub.paymentRate) && sub.paymentRate > 0 && (
                            <span className="rounded-full border border-[#D7BE7A]/35 bg-[rgba(184,145,78,0.14)] px-3 py-1 text-[10px] font-bold text-[#F8E8B8]">
                              {formatCurrency(sub.paymentRate)}{contract.type === 'RECURRING' ? ' / mo' : ''}
                            </span>
                          )}
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-100">
                            {subkDocumentTotal(documents)} files
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#D7BE7A] mb-1.5">Website</label>
                          <input
                            type="url"
                            value={websiteDraft}
                            onChange={e => setLockedSubWebsiteDrafts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                            onBlur={() => {
                              const next = websiteDraft.trim()
                              if ((sub.website ?? '') === next) return
                              updateLockedSubcontractor(contract.id, sub.id, { website: next || undefined })
                              setLockedSubWebsiteDrafts(prev => ({ ...prev, [sub.id]: next }))
                            }}
                            placeholder="https://example.com"
                            className="input-field w-full"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">Subcontractor website. Saved on blur.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#D7BE7A] mb-1.5">Subk payment status</label>
                          <select
                            value={sub.paid ? 'PAID' : 'NOT_PAID'}
                            onChange={e => {
                              const nextPaid = e.target.value === 'PAID'
                              updateLockedSubcontractor(contract.id, sub.id, { paid: nextPaid })
                              toast.success(nextPaid ? 'Marked as paid' : 'Marked as not paid')
                            }}
                            className="input-field w-full"
                          >
                            <option value="NOT_PAID">Not paid</option>
                            <option value="PAID">Paid</option>
                          </select>
                          <p className="mt-1 text-[11px] text-slate-400">Track whether this subcontractor has been paid.</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#D7BE7A] mb-1.5">{rateLabel}</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={rateDraft}
                            onChange={e => setLockedSubRateDrafts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                            placeholder="0.00"
                            className="input-field flex-1 min-w-[160px] no-spin"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = rateDraft.trim()
                              const parsed = Number(trimmed)
                              const nextRate = trimmed === '' ? undefined : (Number.isFinite(parsed) && parsed > 0 ? parsed : undefined)
                              updateLockedSubcontractor(contract.id, sub.id, { paymentRate: nextRate })
                              setLockedSubRateDrafts(prev => ({ ...prev, [sub.id]: trimmed === '' ? '' : (nextRate != null ? String(nextRate) : '') }))
                              toast.success(nextRate != null ? 'Pay rate saved' : 'Pay rate cleared')
                            }}
                            className="btn-secondary text-xs"
                          >
                            <Save size={12} /> Save rate
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Shown on the contract invoice (Quote / Subk's) and finance projections.
                        </p>
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
                            deadline: w.deadline || '',
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
                      <div className="grid gap-2 lg:grid-cols-3">
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
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Issuance Date</label>
                          <input
                            type="date"
                            value={warningEditForm.issuedDate}
                            onChange={e => setWarningEditForm(prev => ({ ...prev, issuedDate: e.target.value }))}
                            className="input-field w-full py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Deadline</label>
                          <input
                            type="date"
                            value={warningEditForm.deadline}
                            onChange={e => setWarningEditForm(prev => ({ ...prev, deadline: e.target.value }))}
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
                          disabled={!warningEditForm.issuedDate || !warningEditForm.deadline || !warningEditForm.description.trim()}
                          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={() => {
                            const severity = GOV_WARNING_META[warningEditForm.type].severity
                            updateGovernmentWarning(contract.id, w.id, {
                              type: warningEditForm.type,
                              issuedDate: warningEditForm.issuedDate,
                              deadline: warningEditForm.deadline,
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
                      <div className="mt-2 grid gap-2 text-[10px] sm:grid-cols-2">
                        <div className="rounded-lg border border-white/65 bg-white/55 px-2 py-1.5">
                          <span className="block font-bold uppercase tracking-wide text-slate-500">Issuance Date</span>
                          <span className="font-semibold text-slate-700">{formatDate(w.issuedDate)}</span>
                        </div>
                        <div className="rounded-lg border border-white/65 bg-white/55 px-2 py-1.5">
                          <span className="block font-bold uppercase tracking-wide text-slate-500">Deadline</span>
                          <span className="font-semibold text-slate-700">{formatDate(w.deadline || '')}</span>
                        </div>
                      </div>
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Issuance Date</label>
                    <input type="date" value={warnForm.issuedDate} onChange={e => setWarnForm(p => ({ ...p, issuedDate: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Deadline</label>
                    <input type="date" value={warnForm.deadline} onChange={e => setWarnForm(p => ({ ...p, deadline: e.target.value }))} className="input-field text-xs py-1.5 w-full" />
                  </div>
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
                    disabled={!warnForm.description || !warnForm.issuedDate || !warnForm.deadline}
                    onClick={() => {
                      const severity = GOV_WARNING_META[warnForm.type].severity
                      addGovernmentWarning(contract.id, {
                        type: warnForm.type,
                        issuedDate: warnForm.issuedDate,
                        deadline: warnForm.deadline,
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
                      setWarnForm({ type: 'CURE_NOTICE', issuedDate: '', deadline: '', description: '', comment: '', attachments: [] })
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

        {/* LINE ITEMS — CLIN-numbered scope of work for base + option years */}
        {tab === 'lineItems' && (
          <ContractLineItemsTab
            contract={contract}
            onAdd={(line) => addContractLineItem(contract.id, line)}
            onUpdate={(lineId, data) => updateContractLineItem(contract.id, lineId, data)}
            onRemove={(lineId) => removeContractLineItem(contract.id, lineId)}
          />
        )}

        {/* BILLING PERIOD — Manual service date + invoice sequence preview */}
        {tab === 'billing' && (
          <ContractBillingTab
            contract={contract}
            nextInvoiceNumber={nextInvoiceNumber}
            invoiceReady={invoiceReady}
            onSaveServiceDate={async (value) => {
              const saved = await updateContract(contract.id, { serviceDate: value || undefined })
              if (saved) toast.success(value ? 'Service date saved' : 'Service date cleared')
            }}
            onGenerateInvoice={() => generateInvoiceFile(contract, consumeInvoiceNumber())}
          />
        )}

        {/* ASSIGNMENT — Operations team picker (separate hierarchy from BD / opportunities) */}
        {tab === 'assignment' && (
          <ContractAssignmentTab
            contract={contract}
            onSave={async (employeeId) => {
              const saved = await updateContract(contract.id, { assignedTo: employeeId || undefined })
              if (saved) toast.success(employeeId ? 'Contract reassigned' : 'Assignment cleared')
              return !!saved
            }}
          />
        )}

      </div>
      </motion.div>

      {/* Edit Contract Details Modal */}
      {createPortal(
        <AnimatePresence>
          {showEditDetails && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setShowEditDetails(false)} />
            <motion.div
              key="edit-details-panel"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl border"
              style={{
                height: 'min(88vh, 760px)',
                background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(10,29,43,0.98))',
                borderColor: 'rgba(215,190,122,0.18)',
              }}
            >
              {/* Header */}
              <div className="flex-shrink-0 border-b border-[#D7BE7A]/15">
                <div className="flex items-start justify-between px-7 pt-5 pb-3 gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-slate-100 leading-tight">Edit Contract</h2>
                    <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">{contract.title} · {contract.contractId}</p>
                  </div>
                  <button onClick={() => setShowEditDetails(false)}
                    className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all mt-0.5">
                    <X size={14} />
                  </button>
                </div>
                {/* Tab bar */}
                <div className="flex px-7 gap-0.5">
                  {EDIT_DETAILS_TABS.map((t, i) => (
                    <button key={t.id} onClick={() => setEditDetailsTab(t.id)}
                      className={[
                        'px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5',
                        editDetailsTab === t.id
                          ? 'border-indigo-400 text-indigo-200'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700',
                      ].join(' ')}>
                      <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${editDetailsTab === t.id ? 'bg-indigo-500/30 text-indigo-100' : 'bg-white/5 text-slate-400'}`}>
                        {i + 1}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-7 py-6">
                {editDetailsTab === 'details' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Title *</label>
                      <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="input-field" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Contract ID *</label>
                        <input value={editForm.contractId} onChange={e => setEditForm(f => ({ ...f, contractId: e.target.value }))} className="input-field font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">NAICS Code</label>
                        <input value={editForm.naicsCode} onChange={e => setEditForm(f => ({ ...f, naicsCode: e.target.value }))} className="input-field" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Type *</label>
                        <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as ContractType }))} className="select-field">
                          {(['OTJ','RECURRING','BPA','IDIQ','S&D','SUPPLY'] as ContractType[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Finance Type</label>
                        <select value={editForm.financeType} onChange={e => setEditForm(f => ({ ...f, financeType: e.target.value as ContractFinanceType | '' }))} className="select-field">
                          <option value="">—</option>
                          {(['FFP','T&M','CPFF','OTHER'] as ContractFinanceType[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Set-Aside</label>
                        <select value={editForm.setAside} onChange={e => setEditForm(f => ({ ...f, setAside: e.target.value as SetAside | '' }))} className="select-field">
                          <option value="">—</option>
                          {(['SB','SDVOSB','WOSB','HUBZone','VOSB','8(a)','UNRES'] as SetAside[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Client / Agency</label>
                        <input value={editForm.client} onChange={e => setEditForm(f => ({ ...f, client: e.target.value }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Location</label>
                        <input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} className="input-field" placeholder="City, State" />
                      </div>
                    </div>
                  </div>
                )}

                {editDetailsTab === 'finance' && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Contract Value</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Contract Value ($)</label>
                          <input type="number" min="0" step="0.01" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Base Amount ($)</label>
                          <input type="number" min="0" step="0.01" value={editForm.baseAmount} onChange={e => setEditForm(f => ({ ...f, baseAmount: e.target.value }))} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Monthly Payment ($)</label>
                          <input type="number" min="0" step="0.01" value={editForm.monthlyPayment} onChange={e => setEditForm(f => ({ ...f, monthlyPayment: e.target.value }))} className="input-field" />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-[#D7BE7A]/15 pt-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Option Years</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Option Years Remaining</label>
                          <input type="number" min="0" step="1" value={editForm.optionYears} onChange={e => setEditForm(f => ({ ...f, optionYears: e.target.value }))} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Option Year Deadline</label>
                          <input type="date" value={editForm.optionYearDeadline} onChange={e => setEditForm(f => ({ ...f, optionYearDeadline: e.target.value }))} className="input-field" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editDetailsTab === 'notes' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Associate (Support Agent)</label>
                      <input value={editForm.supportAgent} onChange={e => setEditForm(f => ({ ...f, supportAgent: e.target.value }))} className="input-field" />
                      <p className="text-[10px] text-slate-500 mt-1">To change the assigned employee, use the Reassign action on the Overview tab.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Billing Notes</label>
                      <textarea value={editForm.billingNotes} onChange={e => setEditForm(f => ({ ...f, billingNotes: e.target.value }))} rows={4} className="input-field resize-none" placeholder="Internal billing notes…" />
                    </div>
                    <p className="text-[10px] text-slate-500">POP dates, PoC, Warnings, Deliverables, Subcontractors, and Termination are managed in their own tabs in the contract window.</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                className="flex-shrink-0 px-7 py-4 border-t flex items-center gap-3"
                style={{ background: 'rgba(7,19,31,0.88)', borderColor: 'rgba(215,190,122,0.16)' }}
              >
                <div className="ml-auto flex gap-3">
                  <button onClick={() => setShowEditDetails(false)} className="btn-secondary">Cancel</button>
                  <button
                    onClick={async () => {
                      if (!editForm.title.trim() || !editForm.contractId.trim()) {
                        toast.error('Title and Contract ID are required')
                        setEditDetailsTab('details')
                        return
                      }
                      const valueNum = Number(editForm.value)
                      if (editForm.value === '' || Number.isNaN(valueNum) || valueNum < 0) {
                        toast.error('Contract value must be a non-negative number')
                        setEditDetailsTab('finance')
                        return
                      }
                      const parseOptionalNumber = (v: string) => {
                        if (v.trim() === '') return undefined
                        const n = Number(v)
                        return Number.isFinite(n) && n >= 0 ? n : undefined
                      }
                      const patch: Partial<Contract> = {
                        title: editForm.title.trim(),
                        contractId: editForm.contractId.trim(),
                        type: editForm.type,
                        financeType: editForm.financeType ? editForm.financeType : undefined,
                        naicsCode: editForm.naicsCode.trim(),
                        setAside: editForm.setAside ? editForm.setAside : undefined,
                        location: editForm.location.trim(),
                        client: editForm.client.trim() || undefined,
                        value: valueNum,
                        baseAmount: parseOptionalNumber(editForm.baseAmount),
                        monthlyPayment: parseOptionalNumber(editForm.monthlyPayment),
                        optionYears: parseOptionalNumber(editForm.optionYears),
                        optionYearDeadline: editForm.optionYearDeadline || undefined,
                        supportAgent: editForm.supportAgent.trim() || undefined,
                        billingNotes: editForm.billingNotes.trim() || undefined,
                      }
                      const ok = await updateContract(contract.id, patch)
                      if (ok) {
                        toast.success('Contract details updated')
                        setShowEditDetails(false)
                      }
                    }}
                    className="btn-primary flex items-center gap-1.5"
                  >
                    <Save size={13} /> Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
          )}
      </AnimatePresence>,
      document.body
      )}

      {/* Terminate Contract Modal */}
      {createPortal(
        <AnimatePresence>
          {showTerminate && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setShowTerminate(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative z-10 flex w-full max-w-md max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              style={{ border: '1px solid var(--border-default)' }}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <h3 className="text-base font-bold text-slate-900">Terminate Contract</h3>
                <p className="text-xs text-slate-500 mt-0.5">{contract.title}</p>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
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
              <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-slate-100 flex-shrink-0">
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
      </AnimatePresence>,
      document.body
      )}

      {/* Reassign Contract Modal */}
      {createPortal(
        <AnimatePresence>
          {showReassign && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setShowReassign(false)} />
              <motion.div
                key="reassign-panel"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="relative z-10 flex w-full max-w-4xl max-h-[min(88vh,720px)] flex-col overflow-hidden rounded-2xl shadow-2xl border"
                style={{
                  background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(10,29,43,0.98))',
                  borderColor: 'rgba(215,190,122,0.18)',
                }}
              >
                <div className="flex-shrink-0 border-b border-[#D7BE7A]/15 px-7 pt-5 pb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-slate-100 leading-tight">Reassign Contract</h2>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{contract.title} · {contract.contractId}</p>
                  </div>
                  <button onClick={() => setShowReassign(false)}
                    className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all">
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-7 py-6 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Assign to an Operations team member</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Contracts are owned by the Operations team — a separate hierarchy from the BD team that owns opportunities. Workload lines show total active assignments and same-day deadlines.
                    </p>
                  </div>
                  <HierarchyAssignPicker
                    value={reassignDraft}
                    onChange={v => setReassignDraft(v)}
                    deadline={contract.popEnd || undefined}
                    team="OPS"
                  />
                </div>

                <div
                  className="flex-shrink-0 px-7 py-4 border-t flex items-center gap-3"
                  style={{ background: 'rgba(7,19,31,0.88)', borderColor: 'rgba(215,190,122,0.16)' }}
                >
                  {contract.assignedTo && (
                    <button
                      type="button"
                      disabled={reassignSaving}
                      onClick={async () => {
                        setReassignSaving(true)
                        const saved = await updateContract(contract.id, { assignedTo: undefined })
                        setReassignSaving(false)
                        if (saved) {
                          toast.success('Assignment cleared')
                          setShowReassign(false)
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-900/30 border border-red-700/40 hover:bg-red-900/50 transition-colors disabled:opacity-45"
                    >
                      <Trash2 size={12} /> Clear assignment
                    </button>
                  )}
                  <div className="ml-auto flex gap-3">
                    <button type="button" onClick={() => setShowReassign(false)} className="btn-secondary">Cancel</button>
                    <button
                      type="button"
                      disabled={reassignSaving || !reassignDraft || reassignDraft === contract.assignedTo}
                      onClick={async () => {
                        if (!reassignDraft) { toast.error('Select an employee to assign.'); return }
                        setReassignSaving(true)
                        const saved = await updateContract(contract.id, { assignedTo: reassignDraft })
                        setReassignSaving(false)
                        if (saved) {
                          toast.success('Contract reassigned')
                          setShowReassign(false)
                        }
                      }}
                      className="btn-primary disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Save size={13} /> Save Assignment
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
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
export default function ContractsPage() {
  const { contracts, employees } = useStore()
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')
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

  useEffect(() => {
    if (!globalRecordId) return
    const target = contracts.find(c => c.id === globalRecordId || c.contractId === globalRecordId || c.contractNumber === globalRecordId)
    if (!target) return

    setTab(C_TABS.find(t => t.statuses.includes(target.status))?.key ?? 'ACTIVE_GROUP')
    setSearch('')
    setPeriod(null)
    setColumnFilters({})
    setSelectedInitialTab('overview')
    setSelected(target)
  }, [globalRecordId, contracts])

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
  // Active = anything that isn't archived or terminated (pending-payment and canceled count too).
  const activeCount = contracts.filter(c => c.status !== 'ARCHIVED' && c.status !== 'TERMINATED').length
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
      {createPortal((
        <AnimatePresence>
          {selected && (
            <>
              <motion.div key="contract-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
      ), document.body)}

      {sourcingOpp && (
        <SourcingModal opp={sourcingOpp} onClose={() => setSourcingOpp(null)} />
      )}

    </div>
  )
}
