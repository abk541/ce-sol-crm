import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, ExternalLink, Loader,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Edit2, Users2, Send, Trash2, Clock,
  FileText, PlusCircle, Download, Filter, MoreHorizontal, Upload,
  Ban, ChevronLeft, ChevronRight,
  Mail, Phone, User as UserIcon,
  Search, Globe, MessageSquare, Copy, Building2, CheckCircle2, Paperclip,
  Calendar, DollarSign,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Opportunity, Priority, OppStatus, Comment, FileAttachment, SamGovContact } from '../types'
import { TIMEZONES } from '../data/mock'
import { formatCurrency, useEscapeKey } from '../lib/utils'
import { assignableEmployeesForUser, getAssignmentChain, isAssignedToAssociate, ROLE_DISPLAY_LABELS } from '../lib/team'
import { NAICS_CODES } from '../data/naics'
import toast from 'react-hot-toast'
import DetailDrawer, { DrawerSection, DrawerField } from '../components/shared/DetailDrawer'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'
import {
  formatTime12h,
  formatLocalDueTime as formatLocalDueTimeShared,
  formatMoroccoDueTime as formatMoroccoDueTimeShared,
  fixedOffsetMinutes,
  isCompleteClockTime,
  isValidIanaTimeZone,
  normalizeUtcOffset,
  opportunityDeadlineTimeMs,
  resolveIanaTimeZone,
  timezoneLabelFromOffset,
  utcToMoroccoClock,
} from '../lib/timezone'
import {
  buildSamGovOpportunityEndpoint,
  mapSamGovOpportunityToForm,
} from '../lib/samGov'
import { hasPermission } from '../lib/permissions'

// ── Constants ─────────────────────────────────────────────────────────
const TYPES_DISPLAY: { value: string; label: string }[] = [
  { value: 'All',       label: 'All' },
  { value: 'OTJ',       label: 'OTJ' },
  { value: 'RECURRING', label: 'RECURRING' },
  { value: 'BPA',       label: 'BPA' },
  { value: 'IDIQ',      label: 'IDIQ' },
  { value: 'S&D',       label: 'S&D' },
]
const SET_ASIDES = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']
const PRIORITIES: Priority[] = ['MEDIUM', 'HIGH', 'VERY_HIGH']

// Pre-submission view statuses only
const OPP_VIEW_STATUSES: OppStatus[] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

const PREFERRED_TIMEZONE_CODES = [
  'EDT', 'EST', 'CDT', 'CST', 'MDT', 'MST', 'PDT', 'PST', 'AKDT', 'AKST', 'HST',
  'GMT', 'UTC', 'GMT+1', 'KSA', 'AST', 'GST', 'CET', 'CEST', 'EET', 'EEST',
  'IRT', 'IRST', 'IST', 'SGT', 'JST', 'AEST', 'AEDT', 'NZST', 'NZDT',
]

const TIMEZONE_CODE_OPTIONS = Array.from(new Set([
  ...PREFERRED_TIMEZONE_CODES,
  ...Object.keys(TIMEZONES),
])).filter(code => code && (TIMEZONES[code] || fixedOffsetMinutes(code) !== null))

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 0] // 0 = All
function getBuildSamGovApiKey() {
  return ((import.meta.env.VITE_SAM_GOV_API_KEY as string | undefined) ?? '').trim()
}

async function readSamGovError(res: Response) {
  try {
    const body = await res.clone().json()
    const message =
      body?.error?.message ??
      body?.message ??
      body?.error_description ??
      body?.errors?.[0]?.message
    if (message) return String(message)
  } catch {
    // Fall back to text below.
  }
  try {
    const text = await res.text()
    if (text) return text.slice(0, 240)
  } catch {
    // Ignore response body parse errors.
  }
  return res.statusText
}

function typeLabel(val: string) {
  if (val === 'S&D' || val === 'SUPPLY') return 'S&D'
  return val
}

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

function formatFileSize(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function legacyProposalAttachment(name: string, index: number, uploadedBy: string): FileAttachment {
  return {
    id: `legacy-proposal-${index}-${name}`,
    name,
    attachedAt: '',
    uploadedBy,
  }
}

function fileToProposalAttachment(file: File, attachedAt: string, uploadedBy: string): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        attachedAt: new Date(attachedAt).toISOString(),
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

function CommentAttachmentPicker({
  attachments,
  onChange,
  uploadedBy,
}: {
  attachments: FileAttachment[]
  onChange: (attachments: FileAttachment[]) => void
  uploadedBy: string
}) {
  const [fileName, setFileName] = useState('')
  const [attachedAt, setAttachedAt] = useState(() => toDatetimeLocal(new Date().toISOString()))

  const add = () => {
    if (!fileName.trim() || !attachedAt) return
    onChange([
      ...attachments,
      {
        id: crypto.randomUUID(),
        name: fileName.trim(),
        attachedAt: new Date(attachedAt).toISOString(),
        uploadedBy,
      },
    ])
    setFileName('')
    setAttachedAt(toDatetimeLocal(new Date().toISOString()))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Comment attachments</p>
      <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
        <input type="file" onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} className="input-field text-xs" />
        <input type="datetime-local" value={attachedAt} onChange={e => setAttachedAt(e.target.value)} className="input-field text-xs" required />
        <button type="button" onClick={add} disabled={!fileName.trim() || !attachedAt} className="btn-secondary justify-center text-xs disabled:opacity-40">Add</button>
      </div>
      {attachments.length > 0 && (
        <div className="mt-2 space-y-1">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
              <span className="min-w-0 truncate font-semibold text-slate-700">{att.name}</span>
              <span className="whitespace-nowrap text-slate-400">{formatDateTime(att.attachedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CommentAttachments({ attachments }: { attachments?: FileAttachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-2 space-y-1">
      {attachments.map(att => (
        <p key={att.id} className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
          <FileText size={9} /> {att.name} - {formatDateTime(att.attachedAt)}
        </p>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))
  return asUtc - date.getTime()
}

function applyTimezoneChange(
  current: Partial<Opportunity>,
  newTz: string,
): Partial<Opportunity> {
  return syncMoroccoProjection({ ...current, timezone: newTz })
}

export function syncMoroccoProjection(current: Partial<Opportunity>): Partial<Opportunity> {
  if (!current.dueDate || !isCompleteClockTime(current.localTime)) {
    return { ...current, moroccoTime: '', moroccoDate: '' }
  }

  try {
    const utcMs = opportunityDeadlineTimeMs(current)
    if (utcMs === null) return { ...current, moroccoTime: '', moroccoDate: '' }
    const { moroccoDate, moroccoTime } = utcToMoroccoClock(utcMs)
    return {
      ...current,
      moroccoDate,
      moroccoTime: formatTime12h(moroccoTime),
    }
  } catch {
    return { ...current, moroccoTime: '', moroccoDate: '' }
  }
}

export function applyScheduleFieldChange(
  current: Partial<Opportunity>,
  key: 'dueDate' | 'localTime' | 'timezone',
  value: string,
): Partial<Opportunity> {
  if (key === 'timezone') return applyTimezoneChange(current, value)
  return syncMoroccoProjection({ ...current, [key]: value })
}

/**
 * Returns a human-readable Morocco (GMT+1) time string.
 * Prefers pre-computed `moroccoTime`/`moroccoDate` fields (set on SAM.gov import,
 * which are exact because they derive from the ISO-string UTC offset).
 * Falls back to `convertTime` for manually-entered opportunities.
 */
function formatMoroccoDisplay(
  localTime: string,
  timezone: string | undefined,
  dueDate: string | undefined,
  moroccoTime: string | undefined,
  moroccoDate: string | undefined,
): string {
  if (!isCompleteClockTime(localTime)) {
    if (moroccoTime && moroccoDate) {
      const crossesMidnight = dueDate && moroccoDate !== dueDate
      const dateSuffix = crossesMidnight
        ? ` (${new Date(`${moroccoDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
        : ''
      return `${formatTime12h(moroccoTime)}${dateSuffix} GMT+1`
    }
    return ''
  }
  return formatMoroccoDueTimeShared({ localTime, timezone, dueDate, moroccoTime, moroccoDate })
}

function formatTimeInZone(timeZone: string, referenceDate: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(referenceDate)
  } catch {
    return ''
  }
}

function formatTimeWithFixedOffset(referenceDate: Date, offsetMinutes: number): string {
  const shifted = new Date(referenceDate.getTime() + offsetMinutes * 60_000)
  return `${shifted.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${formatTime12h(`${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`)}`
}

function formatTimezoneCodeTime(code: string, referenceDate: Date): string {
  const fixedOffset = fixedOffsetMinutes(code)
  if (fixedOffset !== null) return formatTimeWithFixedOffset(referenceDate, fixedOffset)

  const zone = resolveIanaTimeZone(code)
  if (!zone) return ''
  return formatTimeInZone(zone, referenceDate).replace(/\s[A-Z]{2,5}(?:[+-]\d+)?$/, '')
}

export function timezoneCodeForDisplay(value: string | undefined, referenceDate = new Date()): string {
  const raw = (value ?? '').trim()
  if (!raw) return 'GMT+1'
  const upper = raw.toUpperCase()
  if (TIMEZONE_CODE_OPTIONS.includes(raw)) return raw
  if (TIMEZONE_CODE_OPTIONS.includes(upper)) return upper

  const matchingMappedCodes = TIMEZONE_CODE_OPTIONS.filter(code => TIMEZONES[code] === raw)
  const offset = isValidIanaTimeZone(raw)
    ? Math.round(timeZoneOffsetMs(referenceDate, raw) / 60_000)
    : null

  if (matchingMappedCodes.length) {
    const exact = offset === null ? undefined : matchingMappedCodes.find(code => fixedOffsetMinutes(code) === offset)
    return exact ?? matchingMappedCodes[0]
  }

  if (offset !== null) {
    const exactOffsetCode = TIMEZONE_CODE_OPTIONS.find(code => fixedOffsetMinutes(code) === offset)
    if (exactOffsetCode) return exactOffsetCode
  }

  const normalisedOffset = normalizeUtcOffset(raw.replace(/^(?:UTC|GMT)/i, ''))
  const offsetLabel = timezoneLabelFromOffset(normalisedOffset)
  if (TIMEZONE_CODE_OPTIONS.includes(offsetLabel)) return offsetLabel

  return ''
}

function TimezoneInput({
  id,
  value,
  onChange,
  reference,
}: {
  id: string
  value?: string
  onChange: (value: string) => void
  reference: Partial<Opportunity>
}) {
  const referenceMs = useMemo(
    () => opportunityDeadlineTimeMs(reference),
    [reference.dueDate, reference.localTime, reference.timezone],
  )
  const referenceDate = useMemo(
    () => new Date(referenceMs ?? Date.now()),
    [referenceMs],
  )
  const selectedCode = timezoneCodeForDisplay(value, referenceDate)
  const selectedTime = selectedCode ? formatTimezoneCodeTime(selectedCode, referenceDate) : ''
  const options = useMemo(() => TIMEZONE_CODE_OPTIONS.map(code => {
    const codeTime = formatTimezoneCodeTime(code, referenceDate)
    return {
      code,
      label: `${code}${codeTime ? ` - ${codeTime}` : ''}`,
    }
  }), [referenceDate])

  return (
    <div className="space-y-1">
      <select
        id={id}
        value={selectedCode}
        onChange={e => onChange(e.target.value)}
        className="select-field"
      >
        <option value="">Select code...</option>
        {options.map(option => (
          <option key={option.code} value={option.code}>{option.label}</option>
        ))}
      </select>
      <p className="text-[10px] font-medium text-slate-400">
        {selectedCode && selectedTime
          ? `${selectedCode}: ${selectedTime}${referenceMs === null ? ' now.' : ' for this deadline.'}`
          : 'Choose the source timezone code shown on SAM.gov.'}
      </p>
    </div>
  )
}

function NaicsInput({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState('')
  const suggestions = useMemo(() => {
    const q = (query || value || '').toLowerCase().trim()
    const list = q
      ? NAICS_CODES.filter(item => item.code.includes(q) || item.title.toLowerCase().includes(q))
      : NAICS_CODES
    return list.slice(0, 40)
  }, [query, value])

  return (
    <>
      <input
        value={value ?? ''}
        list="naics-code-options"
        onChange={e => {
          const raw = e.target.value
          const code = raw.match(/\d{6}/)?.[0] ?? raw
          setQuery(raw)
          onChange(code)
        }}
        className="input-field"
        placeholder="Type code or industry name"
      />
      <datalist id="naics-code-options">
        {suggestions.map(item => (
          <option key={`${item.code}-${item.title}`} value={`${item.code} - ${item.title}`} />
        ))}
      </datalist>
    </>
  )
}

// ── Badges ────────────────────────────────────────────────────────────
const PRIORITY_META: Record<Priority, { color: string; bg: string; border: string }> = {
  VERY_HIGH: { color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' },
  HIGH:      { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  MEDIUM:    { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
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

function PriorityBadge({ p }: { p: Priority }) {
  const safePriority = p === ('LOW' as Priority) ? 'MEDIUM' : p
  const m = PRIORITY_META[safePriority] ?? PRIORITY_META.MEDIUM
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{safePriority.replace('_', ' ')}</span>
}
function StatusBadge({ s }: { s: OppStatus }) {
  const m = STATUS_META[s] ?? STATUS_META.CANCELED
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{s}</span>
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
  useEscapeKey(onClose)
  return createPortal((
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <motion.div
        className={`relative z-10 w-full ${maxW} max-h-[90vh] overflow-y-auto rounded-2xl`}
        style={{
          background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(10,29,43,0.98))',
          border: '1px solid rgba(215,190,122,0.18)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.46)',
        }}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 z-10" style={{ background: 'rgba(7,19,31,0.96)', borderBottom: '1px solid rgba(215,190,122,0.16)' }}>
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
  ), document.body)
}

// ── Shared: tabbed opportunity modal shell ────────────────────────────
type OppFormTab = 'details' | 'schedule' | 'team' | 'assign' | 'contacts' | 'comments'
const OPP_FORM_TABS: { id: OppFormTab; label: string }[] = [
  { id: 'details',  label: 'Opportunity' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'assign',   label: 'Assignment' },
  { id: 'contacts', label: 'Contact Information' },
  { id: 'comments', label: 'Comments' },
]

// ── SAM.gov contacts panel (shared between create + edit modals) ──────
export function SamGovContactsPanel({ contacts, emptyHint }: { contacts?: SamGovContact[]; emptyHint?: string }) {
  const list = contacts ?? []
  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center bg-white border border-slate-200 mb-3">
          <UserIcon size={16} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">No contacts on file</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          {emptyHint ?? 'Contacts are pulled automatically when the opportunity is imported from SAM.gov.'}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Imported from SAM.gov</p>
        <span className="text-[10px] uppercase tracking-widest text-slate-400">Read only · stays with the contract</span>
      </div>
      {list.map(c => (
        <div
          key={c.id}
          className="p-4 rounded-xl border"
          style={{ background: 'rgba(255,255,255,0.045)', borderColor: 'rgba(215,190,122,0.24)' }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {c.fullName || c.title || 'Unnamed contact'}
              </p>
              {c.title && c.fullName && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{c.title}</p>
              )}
            </div>
            {c.type && (
              <span
                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: 'rgba(215,190,122,0.18)', color: '#F8E8B8', border: '1px solid rgba(215,190,122,0.35)' }}
              >
                {c.type}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 break-all">
                <Mail size={11} className="flex-shrink-0" /> {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600">
                <Phone size={11} className="flex-shrink-0" /> {c.phone}
              </a>
            )}
            {c.fax && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="text-[10px] font-bold">FAX</span> {c.fax}
              </span>
            )}
          </div>
          {c.additionalInfo && (
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{c.additionalInfo}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function OppModalShell({ title, subtitle, tab, setTab, onClose, extraHeader, footer, children }: {
  title: string; subtitle?: string
  tab: OppFormTab; setTab: (t: OppFormTab) => void
  onClose: () => void
  extraHeader?: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
  useEscapeKey(onClose)
  return createPortal((
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <motion.div
        className="relative z-10 w-full max-w-4xl rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
        style={{
          height: 'min(88vh, 760px)',
          background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(10,29,43,0.98))',
          borderColor: 'rgba(215,190,122,0.18)',
        }}
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
        <div
          className="flex-shrink-0 px-7 py-4 border-t"
          style={{ background: 'rgba(7,19,31,0.88)', borderColor: 'rgba(215,190,122,0.16)' }}
        >
          {footer}
        </div>
      </motion.div>
    </motion.div>
  ), document.body)
}

// ── Edit Modal ────────────────────────────────────────────────────────
export function EditModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { updateOpportunity, requestDeletion, deletionRequests, currentUser, employees } = useStore()
  const [tab, setTab] = useState<OppFormTab>('details')
  const [form, setForm] = useState<Partial<Opportunity>>({ ...opp })
  const [showDeleteReq, setShowDeleteReq] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [newComment, setNewComment] = useState('')
  const [newCommentAttachments, setNewCommentAttachments] = useState<FileAttachment[]>([])
  const [saving, setSaving] = useState(false)

  const canEditDetails = hasPermission(currentUser, 'opportunity:edit')
  const canComment = hasPermission(currentUser, 'opportunity:comment')
  const canRequestDelete = hasPermission(currentUser, 'opportunity:deleteRequest')
  const hasPendingDelete = deletionRequests.some(r => r.opportunityId === opp.id && r.status === 'PENDING')
  const allowedAssignees = useMemo(() => {
    const ids = assignableEmployeesForUser(employees, currentUser, 'BD').map(employee => employee.id)
    if (form.assignedTo && !ids.includes(form.assignedTo)) ids.push(form.assignedTo)
    return ids
  }, [employees, currentUser, form.assignedTo])
  const set = (k: keyof Opportunity, v: any) => setForm(p => ({ ...p, [k]: v }))
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  useEffect(() => {
    if (!canEditDetails && canComment) setTab('comments')
  }, [canComment, canEditDetails])

  const handleSave = async () => {
    if (!canEditDetails) {
      if (!canComment) {
        toast.error('You do not have permission to edit this opportunity.')
        return
      }
      if (!newComment.trim()) {
        toast.error('Add a comment before saving.')
        setTab('comments')
        return
      }
      const updatedComments = [
        ...(opp.comments ?? []),
        {
          id: crypto.randomUUID(),
          text: newComment.trim(),
          author: currentUser?.username ?? 'unknown',
          createdAt: new Date().toISOString(),
          attachments: newCommentAttachments,
        },
      ]
      setSaving(true)
      const saved = await updateOpportunity(opp.id, { comments: updatedComments })
      setSaving(false)
      if (saved) {
        toast.success('Comment added')
        onClose()
      }
      return
    }
    if (!form.solicitation?.trim()) { toast.error('Solicitation title is required'); setTab('details'); return }
    if (!form.type) { toast.error('Contract type is required'); setTab('details'); return }
    if (!form.dueDate) { toast.error('Due date is required'); setTab('schedule'); return }
    if (form.assignedTo && form.assignedTo !== opp.assignedTo && !allowedAssignees.includes(form.assignedTo)) {
      toast.error('You can only assign opportunities inside your team.')
      setTab('assign')
      return
    }
    const updatedComments = [...(form.comments ?? [])]
    if (newComment.trim()) {
      updatedComments.push({
        id: crypto.randomUUID(),
        text: newComment.trim(),
        author: currentUser?.username ?? 'unknown',
        createdAt: new Date().toISOString(),
        attachments: newCommentAttachments,
      })
    }
    setSaving(true)
    const saved = await updateOpportunity(opp.id, { ...form, comments: updatedComments })
    setSaving(false)
    if (saved) {
      toast.success('Opportunity updated')
      onClose()
    }
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
          {canRequestDelete && !hasPendingDelete && (
            <button type="button" onClick={() => setShowDeleteReq(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
              <Trash2 size={12} /> Request Deletion
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving && <Loader size={13} className="animate-spin" />}
              {saving ? 'Saving...' : canEditDetails ? 'Save Changes' : 'Save Comment'}
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Contract Type</label>
              <select value={form.type ?? ''} onChange={e => set('type', e.target.value || undefined)} className="select-field">
                <option value="">Select type...</option>
                {TYPES_DISPLAY.filter(t => t.value !== 'All').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Set Aside</label>
              <select value={form.setAside ?? 'SB'} onChange={e => set('setAside', e.target.value as any)} className="select-field">
                {SET_ASIDES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>NAICS Code</label>
              <NaicsInput value={form.naicsCode ?? ''} onChange={value => set('naicsCode', value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Priority</label>
              <select value={form.priority ?? 'MEDIUM'} onChange={e => set('priority', e.target.value as Priority)} className="select-field">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Due Date *</label>
              <input
                type="date"
                value={form.dueDate ?? ''}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'dueDate', e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <TimezoneInput
                id="edit-opportunity-timezone-options"
                value={form.timezone ?? 'Africa/Casablanca'}
                reference={form}
                onChange={value => setForm(prev => applyScheduleFieldChange(prev, 'timezone', value))}
              />
            </div>
          </div>
          {form.localTime && (
            <p className="text-[11px] text-indigo-600 -mt-2 flex items-center gap-1 font-medium">
              <Clock size={10} /> Morocco (GMT+1):{' '}
              {formatMoroccoDisplay(form.localTime, form.timezone, form.dueDate, form.moroccoTime, form.moroccoDate)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>SAM.gov Link</label>
              <input value={form.link ?? ''} onChange={e => set('link', e.target.value)} className="input-field" placeholder="https://sam.gov/opp/..." />
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
              <div><label className={lbl}>Manager</label><input value={form.bdm ?? ''} onChange={e => set('bdm', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Team Lead</label><input value={form.bds ?? ''} onChange={e => set('bds', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Associate</label><input value={form.supportAgent ?? ''} onChange={e => set('supportAgent', e.target.value)} className="input-field" /></div>
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
              Select anyone in the hierarchy. Workload lines show total active assignments and same due-day assignments.
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || opp.dueDate || undefined}
            excludeOpportunityId={opp.id}
            allowedEmployeeIds={allowedAssignees}
            team="BD"
          />
        </div>
      )}

      {/* ── Contacts tab (read-only SAM.gov pointOfContact snapshot) ── */}
      {tab === 'contacts' && (
        <SamGovContactsPanel
          contacts={form.samGovContacts}
          emptyHint="No contacts captured. They are populated automatically when an opportunity is imported from SAM.gov."
        />
      )}

      {/* ── Comments tab ── */}
      {tab === 'comments' && (
        <div className="space-y-4">
          <div>
            <label className={lbl}>Mandatory Events</label>
            <textarea value={form.mandatoryEvents ?? ''} onChange={e => set('mandatoryEvents', e.target.value)} rows={3} className="input-field w-full resize-none" placeholder="Site visit, pre-bid meeting, Q&A deadline..." />
          </div>
          <p className="text-sm font-semibold text-slate-700">Comments</p>
          {(form.comments ?? []).length === 0 && (
            <p className="text-xs text-slate-400">No comments yet.</p>
          )}
          <div className="space-y-3">
            {(form.comments ?? []).map((c: Comment) => (
              <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-600">{c.text}</p>
                <CommentAttachments attachments={c.attachments} />
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-4">
            <label className={lbl}>Add a Comment</label>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              rows={3}
              className="input-field w-full resize-none"
              placeholder="Type your comment here..."
            />
            <div className="mt-3">
              <CommentAttachmentPicker
                attachments={newCommentAttachments}
                onChange={setNewCommentAttachments}
                uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Comment will be saved when you click "{canEditDetails ? 'Save Changes' : 'Save Comment'}".</p>
          </div>
        </div>
      )}

      {/* Delete request panel */}
      <AnimatePresence>
        {showDeleteReq && (
          <motion.div className="mt-5 border border-red-200 rounded-xl p-4 bg-red-50"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <p className="text-xs font-bold text-red-600 mb-2">Reason for deletion request</p>
            <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3}
              className="input-field w-full resize-none text-sm" placeholder="Explain why this opportunity should be deleted..." />
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

function DeleteOpportunityModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { currentUser, deletionRequests, requestDeletion } = useStore()
  const [reason, setReason] = useState('')
  const hasPendingDelete = deletionRequests.some(r => r.opportunityId === opp.id && r.status === 'PENDING')
  const canDelete = hasPermission(currentUser, 'opportunity:deleteRequest')

  const submit = () => {
    if (!canDelete) {
      toast.error('You do not have permission to request opportunity deletion.')
      return
    }
    if (hasPendingDelete) {
      toast.error('A deletion request is already pending for this opportunity.')
      return
    }
    if (reason.trim().length < 10) {
      toast.error('Please provide a reason before deleting.')
      return
    }

    requestDeletion(opp.id, currentUser?.username ?? '', reason.trim())
    toast.success('Deletion request submitted')
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-[#020617]/70 px-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-red-400/20 bg-[#07131F] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="border-b border-red-400/15 bg-gradient-to-r from-red-950/35 via-[#102820]/80 to-[#0A1D2B]/80 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-300/25 bg-red-400/10 text-red-200">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-200/80">Delete Opportunity</p>
              <h2 className="mt-1 truncate text-lg font-black text-[#F8FBF7]" title={opp.solicitation}>
                {opp.solicitation}
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-400">{opp.solicitationId || 'No solicitation ID'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Close delete dialog"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.08] px-4 py-3">
            <p className="text-sm font-semibold text-red-100">
              This creates an admin deletion request. The opportunity is only removed after approval.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Reason for deletion
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              className="input-field w-full resize-none"
              placeholder="Explain why this opportunity should be deleted..."
              autoFocus
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#D7BE7A]/15 bg-[#06111D]/90 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={hasPendingDelete || !canDelete}
            className="flex items-center gap-1.5 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-2 text-sm font-black text-red-100 transition-all hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// ── Sourcing Modal ────────────────────────────────────────────────────
function parseSourcingComments(notes: string | undefined): Comment[] {
  if (!notes) return []
  try {
    const parsed = JSON.parse(notes)
    if (Array.isArray(parsed)) return parsed.filter(c => c?.text && c?.createdAt)
  } catch {
    // Legacy notes were stored as one plain text field.
  }
  return [{ id: 'legacy-note', text: notes, author: 'legacy', createdAt: new Date().toISOString() }]
}

function serializeSourcingComments(comments: Comment[]) {
  return JSON.stringify(comments)
}

// Deterministic avatar background color from a string (company name).
const SOURCING_AVATAR_PALETTE = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500',
  'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-fuchsia-500',
]
function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return SOURCING_AVATAR_PALETTE[Math.abs(hash) % SOURCING_AVATAR_PALETTE.length]
}
function avatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function normalizeWebsite(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
}

const SET_ASIDE_OPTIONS: { value: string; label: string }[] = [
  { value: 'SB',     label: 'Small Business' },
  { value: 'SDVOSB', label: 'SDVOSB' },
  { value: 'WOSB',   label: 'WOSB' },
  { value: 'HUBZone',label: 'HUBZone' },
  { value: 'VOSB',   label: 'VOSB' },
  { value: '8(a)',   label: '8(a)' },
  { value: 'UNRES',  label: 'Unrestricted' },
]

type SourcingDraft = {
  companyName: string
  contactName: string
  email: string
  phone: string
  website: string
  quoteFile: string
  setAside: string
  newComment: string
}

const EMPTY_DRAFT: SourcingDraft = {
  companyName: '', contactName: '', email: '', phone: '', website: '',
  quoteFile: '', setAside: 'SB', newComment: '',
}

export function SourcingModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { subcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor, currentUser } = useStore()
  const canWriteSourcing = hasPermission(currentUser, 'sourcing:write')
  const oppSubs = useMemo(
    () => subcontractors
      .filter(s => s.opportunityId === opp.id)
      .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '')),
    [subcontractors, opp.id],
  )

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'quote' | 'comment'>('all')
  const [mode, setMode] = useState<'view' | 'add'>(oppSubs.length === 0 ? 'add' : 'view')
  const [selectedId, setSelectedId] = useState<string | null>(oppSubs[0]?.id ?? null)
  const [draft, setDraft] = useState<SourcingDraft>(EMPTY_DRAFT)
  const [dirty, setDirty] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Keep selection valid when the underlying list changes.
  useEffect(() => {
    if (mode === 'add') return
    if (selectedId && oppSubs.some(s => s.id === selectedId)) return
    setSelectedId(oppSubs[0]?.id ?? null)
    if (oppSubs.length === 0) setMode('add')
  }, [oppSubs, selectedId, mode])

  const selected = mode === 'view' ? oppSubs.find(s => s.id === selectedId) ?? null : null

  // Hydrate draft when entering view mode or switching selection.
  useEffect(() => {
    if (mode === 'add') {
      setDraft(EMPTY_DRAFT)
      setDirty(false)
      return
    }
    if (selected) {
      setDraft({
        companyName: selected.companyName ?? '',
        contactName: selected.contactName ?? '',
        email:       selected.email ?? '',
        phone:       selected.phone ?? '',
        website:     selected.website ?? '',
        quoteFile:   selected.quoteFile ?? '',
        setAside:    selected.setAside || 'SB',
        newComment:  '',
      })
      setDirty(false)
    }
  }, [mode, selected?.id])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return oppSubs.filter(s => {
      if (filter === 'quote'   && !s.quoteFile) return false
      if (filter === 'comment' && parseSourcingComments(s.notes).length === 0) return false
      if (!needle) return true
      return [s.companyName, s.contactName, s.email, s.phone].some(v =>
        (v || '').toLowerCase().includes(needle))
    })
  }, [oppSubs, search, filter])

  const counts = useMemo(() => ({
    all:     oppSubs.length,
    quote:   oppSubs.filter(s => !!s.quoteFile).length,
    comment: oppSubs.filter(s => parseSourcingComments(s.notes).length > 0).length,
  }), [oppSubs])

  const setD = <K extends keyof SourcingDraft>(k: K, v: SourcingDraft[K]) => {
    setDraft(p => ({ ...p, [k]: v }))
    setDirty(true)
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setD('quoteFile', file.name)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error(`Could not copy ${label}`),
    )
  }

  const saveAdd = (keepOpen: boolean) => {
    if (!draft.companyName.trim()) {
      toast.error('Company name is required')
      return
    }
    addSubcontractor({
      companyName: draft.companyName.trim(),
      contactName: draft.contactName.trim(),
      email:       draft.email.trim(),
      phone:       draft.phone.trim(),
      website:     draft.website.trim() || undefined,
      quoteFile:   draft.quoteFile,
      notes: draft.newComment.trim()
        ? serializeSourcingComments([{
            id: crypto.randomUUID(),
            text: draft.newComment.trim(),
            author: currentUser?.username ?? '',
            createdAt: new Date().toISOString(),
          }])
        : '',
      naicsCode: '',
      setAside: draft.setAside || 'SB',
      opportunityId: opp.id,
      createdBy: currentUser?.username ?? '',
    })
    toast.success('Subcontractor added')
    if (keepOpen) {
      setDraft(EMPTY_DRAFT)
      setDirty(false)
    } else {
      setMode('view')
      setDraft(EMPTY_DRAFT)
      setDirty(false)
    }
  }

  const saveEdit = () => {
    if (!selected) return
    if (!draft.companyName.trim()) {
      toast.error('Company name is required')
      return
    }
    const previousComments = parseSourcingComments(selected.notes)
    const nextComments = [...previousComments]
    if (draft.newComment.trim()) {
      nextComments.push({
        id: crypto.randomUUID(),
        text: draft.newComment.trim(),
        author: currentUser?.username ?? '',
        createdAt: new Date().toISOString(),
      })
    }
    updateSubcontractor(selected.id, {
      companyName: draft.companyName.trim(),
      contactName: draft.contactName.trim(),
      email:       draft.email.trim(),
      phone:       draft.phone.trim(),
      website:     draft.website.trim() || undefined,
      quoteFile:   draft.quoteFile,
      setAside:    draft.setAside,
      notes: serializeSourcingComments(nextComments),
    })
    toast.success('Saved')
    setDraft(p => ({ ...p, newComment: '' }))
    setDirty(false)
  }

  const removeSelected = () => {
    if (!selected) return
    if (!canWriteSourcing) {
      toast.error('You do not have permission to update sourcing.')
      return
    }
    if (!confirm(`Remove ${selected.companyName} from this sourcing list?`)) return
    deleteSubcontractor(selected.id)
    toast.success('Subcontractor removed')
    setSelectedId(null)
  }

  const detailComments = selected ? parseSourcingComments(selected.notes) : []

  return (
    <ModalWrap onClose={onClose} title="Sourcing" subtitle={opp.solicitation} maxW="max-w-6xl">
      <div className="grid h-[min(82vh,720px)] grid-cols-1 md:grid-cols-[300px_1fr] bg-white">
        {/* ── Left pane: searchable list ───────────────────────────── */}
        <aside className="flex flex-col border-r border-slate-200 bg-slate-50">
          <div className="px-3 pt-3 pb-2 space-y-2 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by company, contact, email…"
                className="w-full pl-8 pr-7 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setMode('add'); setSelectedId(null) }}
              className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === 'add'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              <Plus size={13} /> New subcontractor
            </button>
            <div className="flex gap-1">
              {([
                { id: 'all',     label: `All ${counts.all}` },
                { id: 'quote',   label: `Quote ${counts.quote}` },
                { id: 'comment', label: `Notes ${counts.comment}` },
              ] as const).map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    filter === chip.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {filtered.length === 0 && (
              <div className="px-3 py-10 text-center">
                {oppSubs.length === 0 ? (
                  <>
                    <div className="mx-auto w-10 h-10 rounded-full bg-white border border-dashed border-slate-300 flex items-center justify-center mb-2">
                      <Building2 size={16} className="text-slate-400" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No subcontractors yet</p>
                    <p className="mt-1 text-[11px] text-slate-500">Use “New subcontractor” to add the first quote.</p>
                  </>
                ) : (
                  <>
                    <Search size={16} className="mx-auto text-slate-400 mb-1" />
                    <p className="text-xs font-bold text-slate-700">No matches</p>
                    <p className="mt-1 text-[11px] text-slate-500">Try a different search or filter.</p>
                  </>
                )}
              </div>
            )}
            {filtered.map(s => {
              const isSelected = mode === 'view' && selectedId === s.id
              const commentCount = parseSourcingComments(s.notes).length
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setMode('view'); setSelectedId(s.id) }}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all border ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                      : 'bg-white border-transparent hover:bg-white hover:border-slate-200'
                  }`}
                >
                  <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${avatarColor(s.companyName)}`}>
                    {avatarInitials(s.companyName)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-800 truncate">{s.companyName}</span>
                    <span className="block text-[10px] text-slate-500 truncate">
                      {s.contactName || s.email || s.phone || '—'}
                    </span>
                  </span>
                  <span className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                    {s.quoteFile && (
                      <span title="Has quote file" className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Paperclip size={9} />
                      </span>
                    )}
                    {commentCount > 0 && (
                      <span title={`${commentCount} note${commentCount === 1 ? '' : 's'}`} className="inline-flex items-center gap-0.5 px-1 h-4 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold">
                        <MessageSquare size={8} /> {commentCount}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Right pane: detail or new entry ───────────────────────── */}
        <section className="flex flex-col overflow-hidden bg-white">
          {mode === 'view' && selected && (
            <>
              <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-200">
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black text-white ${avatarColor(selected.companyName)}`}>
                    {avatarInitials(selected.companyName)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-slate-900 truncate">{selected.companyName}</h3>
                    <p className="text-xs text-slate-500 truncate">
                      {[selected.contactName, selected.email, selected.phone].filter(Boolean).join(' · ') || 'No contact info yet'}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Added by {selected.createdBy || '—'} · {formatDateTime(selected.createdAt)}
                    </p>
                  </div>
                  {canWriteSourcing && (
                    <button
                      type="button"
                      onClick={removeSelected}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 transition-all hover:bg-rose-100"
                      title="Delete subcontractor"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <a
                    href={selected.email ? `mailto:${selected.email}` : undefined}
                    onClick={e => { if (!selected.email) e.preventDefault() }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                      selected.email
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Mail size={11} /> Email
                  </a>
                  <button
                    type="button"
                    disabled={!selected.email}
                    onClick={() => copyToClipboard(selected.email, 'Email')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Copy size={11} /> Copy
                  </button>
                  <a
                    href={selected.phone ? `tel:${selected.phone}` : undefined}
                    onClick={e => { if (!selected.phone) e.preventDefault() }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                      selected.phone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Phone size={11} /> Call
                  </a>
                  <a
                    href={selected.website ? normalizeWebsite(selected.website) : undefined}
                    target="_blank" rel="noreferrer"
                    onClick={e => { if (!selected.website) e.preventDefault() }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                      selected.website
                        ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Globe size={11} /> Website
                  </a>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Profile</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Company name *</label>
                      <input value={draft.companyName} onChange={e => setD('companyName', e.target.value)} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Contact name</label>
                      <input value={draft.contactName} onChange={e => setD('contactName', e.target.value)} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Set-aside</label>
                      <select value={draft.setAside} onChange={e => setD('setAside', e.target.value)} className="input-field">
                        {SET_ASIDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Email</label>
                      <input type="email" value={draft.email} onChange={e => setD('email', e.target.value)} className="input-field" placeholder="contact@vendor.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Phone</label>
                      <input value={draft.phone} onChange={e => setD('phone', e.target.value)} className="input-field" placeholder="+1 (555) 555-5555" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Website</label>
                      <input value={draft.website} onChange={e => setD('website', e.target.value)} className="input-field" placeholder="example.com" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Quote file</p>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
                  {draft.quoteFile ? (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-md bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                          <FileText size={13} className="text-emerald-600" />
                        </span>
                        <span className="text-xs font-bold text-emerald-900 truncate">{draft.quoteFile}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 rounded">Replace</button>
                        <button type="button" onClick={() => setD('quoteFile', '')} className="w-6 h-6 rounded flex items-center justify-center text-emerald-700 hover:bg-emerald-100">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                    >
                      <Upload size={13} /> Attach quote file
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
                    Notes <span className="text-slate-300">·</span> {detailComments.length}
                  </p>
                  <div className="space-y-2">
                    {detailComments.length === 0 && (
                      <p className="text-xs text-slate-400 px-1">No notes yet — drop a quick update so the team has context.</p>
                    )}
                    {detailComments.map(c => (
                      <div key={c.id} className="flex items-start gap-2">
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white ${avatarColor(c.author || 'anon')}`}>
                          {avatarInitials(c.author || '?')}
                        </span>
                        <div className="flex-1 min-w-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-bold text-slate-700">{c.author || 'unknown'}</span>
                            <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap">{c.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <textarea
                      value={draft.newComment}
                      onChange={e => setD('newComment', e.target.value)}
                      rows={2}
                      placeholder="Add a timestamped note (saves on Save changes)…"
                      className="input-field w-full resize-none"
                    />
                  </div>
                </div>
              </div>

              <footer className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 bg-slate-50">
                {canWriteSourcing ? (
                  <button
                    type="button"
                    onClick={removeSelected}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  {dirty && <span className="text-[10px] font-bold text-amber-600">Unsaved changes</span>}
                  <button
                    type="button"
                    disabled={!dirty}
                    onClick={saveEdit}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                  >
                    <CheckCircle2 size={12} /> Save changes
                  </button>
                </div>
              </footer>
            </>
          )}

          {mode === 'view' && !selected && (
            <div className="flex-1 flex items-center justify-center p-10">
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Building2 size={20} className="text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-700">Select a subcontractor</p>
                <p className="mt-1 text-xs text-slate-500">Pick one from the list, or add a new candidate.</p>
              </div>
            </div>
          )}

          {mode === 'add' && (
            <>
              <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">Sourcing</p>
                <h3 className="mt-0.5 text-base font-black text-slate-900">Add a new subcontractor</h3>
                <p className="text-xs text-slate-500">Quick capture — only the company name is required. The rest can be filled in over time.</p>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Profile</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Company name *</label>
                      <input
                        autoFocus
                        value={draft.companyName}
                        onChange={e => setD('companyName', e.target.value)}
                        className="input-field"
                        placeholder="Legal company name"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Contact name</label>
                      <input value={draft.contactName} onChange={e => setD('contactName', e.target.value)} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Set-aside</label>
                      <select value={draft.setAside} onChange={e => setD('setAside', e.target.value)} className="input-field">
                        {SET_ASIDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Email</label>
                      <input type="email" value={draft.email} onChange={e => setD('email', e.target.value)} className="input-field" placeholder="contact@vendor.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Phone</label>
                      <input value={draft.phone} onChange={e => setD('phone', e.target.value)} className="input-field" placeholder="+1 (555) 555-5555" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Website</label>
                      <input value={draft.website} onChange={e => setD('website', e.target.value)} className="input-field" placeholder="example.com" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Quote file</p>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
                  {draft.quoteFile ? (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-md bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                          <FileText size={13} className="text-emerald-600" />
                        </span>
                        <span className="text-xs font-bold text-emerald-900 truncate">{draft.quoteFile}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 rounded">Replace</button>
                        <button type="button" onClick={() => setD('quoteFile', '')} className="w-6 h-6 rounded flex items-center justify-center text-emerald-700 hover:bg-emerald-100">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                    >
                      <Upload size={13} /> Attach quote file
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Initial note</p>
                  <textarea
                    value={draft.newComment}
                    onChange={e => setD('newComment', e.target.value)}
                    rows={3}
                    placeholder="Where did this lead come from? Any context for the team?"
                    className="input-field w-full resize-none"
                  />
                </div>
              </div>
              <footer className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    if (oppSubs.length === 0) {
                      onClose()
                    } else {
                      setMode('view')
                      setSelectedId(oppSubs[0]?.id ?? null)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveAdd(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  >
                    Save & add another
                  </button>
                  <button
                    type="button"
                    onClick={() => saveAdd(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Plus size={12} /> Add subcontractor
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </ModalWrap>
  )
}

// ── Submit Modal ──────────────────────────────────────────────────────
// Color tokens for opportunity type pills used in the Submit modal hero.
const SUBMIT_TYPE_TONES: Record<string, { bg: string; text: string; ring: string }> = {
  OTJ:       { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  RECURRING: { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  BPA:       { bg: 'bg-sky-100',     text: 'text-sky-700',     ring: 'ring-sky-200' },
  IDIQ:      { bg: 'bg-violet-100',  text: 'text-violet-700',  ring: 'ring-violet-200' },
  'S&D':     { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-200' },
  SUPPLY:    { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-200' },
}

function submitTypeTone(type: string) {
  return SUBMIT_TYPE_TONES[type] || { bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-200' }
}

function submitFileExt(name: string) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : 'FILE'
}

function submitDeadlineMeta(dueDate: string): { label: string; tone: 'overdue' | 'urgent' | 'warning' | 'ok' } {
  if (!dueDate) return { label: 'No deadline', tone: 'ok' }
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return { label: 'Invalid date', tone: 'ok' }
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const target = new Date(due);  target.setHours(0, 0, 0, 0)
  const days = Math.round((target.getTime() - start.getTime()) / 86400000)
  if (days < 0)  return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, tone: 'overdue' }
  if (days === 0) return { label: 'Due today', tone: 'urgent' }
  if (days === 1) return { label: 'Due tomorrow', tone: 'urgent' }
  if (days <= 3)  return { label: `${days} days left`, tone: 'urgent' }
  if (days <= 7)  return { label: `${days} days left`, tone: 'warning' }
  return { label: `${days} days left`, tone: 'ok' }
}

const SUBMIT_DEADLINE_TONE: Record<'overdue' | 'urgent' | 'warning' | 'ok', string> = {
  overdue: 'bg-rose-100 text-rose-700 border-rose-200',
  urgent:  'bg-rose-100 text-rose-700 border-rose-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  ok:      'bg-slate-100 text-slate-600 border-slate-200',
}

function SubmitModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { submitOpportunity, currentUser } = useStore()
  const uploadedBy = currentUser?.username ?? currentUser?.name ?? 'current_user'
  const [proposalAttachments, setProposalAttachments] = useState<FileAttachment[]>(() => {
    if (opp.proposalAttachments?.length) return opp.proposalAttachments
    const legacyNames = Array.from(new Set([...(opp.proposals ?? []), ...(opp.assignedOpportunities ?? [])].filter(Boolean)))
    return legacyNames.map((name, index) => legacyProposalAttachment(name, index, uploadedBy))
  })
  const proposalFileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Financial fields vary by contract type
  const isOTJ       = opp.type === 'OTJ'
  const showYearlyMonthly = !isOTJ

  const [contractAmount, setContractAmount] = useState<string>(opp.contractAmount ? String(opp.contractAmount) : '')
  const [yearlyValue, setYearlyValue]       = useState<string>(opp.baseAmount ? String(opp.baseAmount) : '')
  const [monthlyValue, setMonthlyValue]     = useState<string>(opp.monthlyPayment ? String(opp.monthlyPayment) : '')
  const [monthlyOverridden, setMonthlyOverridden] = useState(false)

  const handleYearlyChange = (val: string) => {
    setYearlyValue(val)
    if (!monthlyOverridden) {
      const n = parseFloat(val)
      setMonthlyValue(isNaN(n) ? '' : (n / 12).toFixed(2))
    }
  }

  const addFile = async (file: File): Promise<FileAttachment | null> => {
    if (!file) return null
    try {
      const attachment = await fileToProposalAttachment(file, new Date().toISOString(), uploadedBy)
      setProposalAttachments(prev => [...prev, attachment])
      if (proposalFileInputRef.current) proposalFileInputRef.current.value = ''
      toast.success('Proposal file uploaded')
      return attachment
    } catch (err) {
      console.error(err)
      toast.error('Proposal file could not be uploaded.')
      return null
    }
  }

  const onDropFiles = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const list = Array.from(e.dataTransfer.files || [])
    for (const f of list) await addFile(f)
  }

  const confirm = async () => {
    const vals: { contractAmount?: number; baseAmount?: number; monthlyPayment?: number } = {}
    if (contractAmount) vals.contractAmount = parseFloat(contractAmount)
    if (yearlyValue)    vals.baseAmount     = parseFloat(yearlyValue)
    if (monthlyValue)   vals.monthlyPayment = parseFloat(monthlyValue)
    const proposalNames = proposalAttachments.map(att => att.name).filter(Boolean)
    submitOpportunity(opp.id, {
      ...vals,
      proposals: proposalNames,
      assignedOpportunities: proposalNames,
      proposalAttachments,
    })
    toast.success('Proposal submitted! Status updated.')
    onClose()
  }

  const tone = submitTypeTone(opp.type)
  const deadline = submitDeadlineMeta(opp.dueDate)
  const previewTotal   = parseFloat(contractAmount)
  const previewYearly  = parseFloat(yearlyValue)
  const previewMonthly = parseFloat(monthlyValue)
  const dueDateLabel = opp.dueDate
    ? new Date(opp.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const dueTimeLabel = opp.localTime ? formatLocalDueTimeShared(opp.localTime, opp.timezone) : ''

  return (
    <ModalWrap onClose={onClose} title="Submit Proposal" subtitle={opp.solicitation} maxW="max-w-2xl">
      <div className="flex flex-col bg-white" style={{ maxHeight: 'min(86vh, 780px)' }}>
        {/* Hero card */}
        <div className="flex-shrink-0 px-6 pt-5">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}>
                {typeLabel(opp.type)}
              </span>
              <span className="font-mono text-[10px] text-slate-500">{opp.solicitationId || '—'}</span>
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${SUBMIT_DEADLINE_TONE[deadline.tone]}`}>
                <Clock size={9} /> {deadline.label}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-bold text-slate-900 break-words">
              {opp.solicitation || 'Untitled solicitation'}
            </h3>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Calendar size={11} className="text-slate-400" />
              Due {dueDateLabel}{dueTimeLabel ? ` · ${dueTimeLabel}` : ''}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contract Value */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <DollarSign size={13} className="text-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Contract value</p>
            </div>
            <div className="space-y-3">
              <MoneyInput
                label="Total contract amount"
                value={contractAmount}
                onChange={setContractAmount}
                preview={previewTotal}
              />
              {showYearlyMonthly && (
                <>
                  <MoneyInput
                    label="Yearly value"
                    value={yearlyValue}
                    onChange={handleYearlyChange}
                    preview={previewYearly}
                  />
                  <MoneyInput
                    label="Monthly value"
                    hint={monthlyOverridden ? 'Manual override' : 'Auto = yearly ÷ 12'}
                    value={monthlyValue}
                    onChange={val => { setMonthlyOverridden(true); setMonthlyValue(val) }}
                    preview={previewMonthly}
                    accent="emerald"
                  />
                </>
              )}
              {isOTJ && (
                <p className="text-[11px] text-slate-500">
                  OTJ contracts are billed once at the total contract amount — no yearly / monthly breakdown.
                </p>
              )}
            </div>
          </section>

          {/* Proposal files */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <FileText size={13} className="text-indigo-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Proposal files <span className="text-slate-300">·</span> {proposalAttachments.length}
              </p>
            </div>
            <input
              ref={proposalFileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0] ?? null
                if (file) addFile(file)
              }}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFiles}
              onClick={() => proposalFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all ${
                dragOver
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              <Upload size={18} className={dragOver ? 'text-indigo-600' : 'text-slate-400'} />
              <p className={`text-xs font-bold ${dragOver ? 'text-indigo-700' : 'text-slate-700'}`}>
                {dragOver ? 'Drop to upload' : (proposalAttachments.length > 0 ? 'Add another file' : 'Drop files here or click to upload')}
              </p>
              <p className="text-[10px] text-slate-500">PDF, DOCX, XLSX up to a few MB. Files attach instantly.</p>
            </div>

            {proposalAttachments.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {proposalAttachments.map((att, i) => (
                  <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-indigo-200">
                    <span className="flex-shrink-0 inline-flex h-7 w-9 items-center justify-center rounded-md bg-indigo-100 text-[9px] font-black text-indigo-700">
                      {submitFileExt(att.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{att.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {att.attachedAt ? formatDateTime(att.attachedAt) : 'Saved file reference'}
                        {formatFileSize(att.size) ? ` · ${formatFileSize(att.size)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProposalAttachments(p => p.filter((_, j) => j !== i))}
                      className="flex-shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sticky footer */}
        <footer className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 bg-slate-50">
          <p className="text-[10px] text-slate-500">
            Submitting moves the opportunity to <span className="font-bold text-slate-700">Submitted</span>.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            >
              <Send size={12} /> Submit proposal
            </button>
          </div>
        </footer>
      </div>
    </ModalWrap>
  )
}

// Money input with $ prefix and inline formatted preview used inside SubmitModal.
function MoneyInput({
  label,
  value,
  onChange,
  hint,
  preview,
  accent = 'slate',
}: {
  label: string
  value: string
  onChange: (val: string) => void
  hint?: string
  preview?: number
  accent?: 'slate' | 'emerald'
}) {
  const showPreview = typeof preview === 'number' && Number.isFinite(preview) && preview > 0
  const accentText = accent === 'emerald' ? 'text-emerald-600' : 'text-slate-600'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</label>
        {hint && <span className="text-[10px] font-semibold text-slate-400">{hint}</span>}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          className="input-field w-full pl-7 text-right tabular-nums no-spin"
        />
      </div>
      {showPreview && (
        <p className={`mt-1 text-right text-[11px] font-bold tabular-nums ${accentText}`}>
          = {formatCurrency(preview as number)}
        </p>
      )}
    </div>
  )
}

// ── Create Modal ──────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const { createOpportunity, currentUser, employees } = useStore()
  const [tab, setTab] = useState<OppFormTab>('details')
  const [samUrl, setSamUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [initialComment, setInitialComment] = useState('')
  const [initialCommentAttachments, setInitialCommentAttachments] = useState<FileAttachment[]>([])
  const samApiKey = getBuildSamGovApiKey()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Opportunity>>({
    priority: 'MEDIUM', status: 'ACTIVE', type: undefined, setAside: 'SB',
    period: new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase() + ' ' + new Date().getFullYear(),
    capturedOn: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    bdm: '', bds: '', naicsCode: '', solicitationId: '', solicitation: '',
    client: '', location: '', dueDate: '', localTime: '', timezone: 'Africa/Casablanca',
    comments: [], proposals: [], proposalAttachments: [], subcontractors: [], assignedTo: undefined,
  })
  const allowedAssignees = useMemo(
    () => assignableEmployeesForUser(employees, currentUser, 'BD').map(employee => employee.id),
    [employees, currentUser],
  )
  const set = (k: keyof Opportunity, v: any) => setForm(p => ({ ...p, [k]: v }))
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  const handleImport = async () => {
    const url = samUrl.trim()
    if (!url || importing) return

    if (!samApiKey) {
      toast.error('SAM.gov API key is not configured. Check VITE_SAM_GOV_API_KEY in your deployment secrets.')
      return
    }

    let endpoint = ''
    try {
      endpoint = buildSamGovOpportunityEndpoint(url, samApiKey)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse the SAM.gov URL.')
      return
    }

    setImporting(true)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const details = await readSamGovError(res)
        if (res.status === 429) {
          throw new Error('SAM.gov rate limit reached. Wait a few minutes, then try again.')
        }
        throw new Error(`SAM.gov returned ${res.status}: ${details}`)
      }

      const json = await res.json()
      const opp = json.opportunitiesData?.[0]
      if (!opp) {
        toast.error('Opportunity not found on SAM.gov. Check the URL.')
        return
      }

      const mapped = mapSamGovOpportunityToForm(opp, url)
      // Batch all form updates in a single setForm call to avoid stale-closure issues
      setForm(prev => ({
        ...prev,
        solicitation:  mapped.solicitation || prev.solicitation,
        solicitationId: mapped.solicitationId || prev.solicitationId,
        client:        mapped.client || prev.client || 'Unknown agency',
        naicsCode:     mapped.naicsCode || prev.naicsCode,
        setAside:      mapped.setAside,
        type:          undefined,
        location:      mapped.location || prev.location,
        dueDate:       mapped.dueDate || prev.dueDate,
        localTime:     mapped.localTime || prev.localTime,
        timezone:      mapped.timezone || prev.timezone,
        moroccoTime:   mapped.moroccoTime || prev.moroccoTime,
        moroccoDate:   mapped.moroccoDate || prev.moroccoDate,
        link:          url,
        samGovContacts: mapped.samGovContacts?.length ? mapped.samGovContacts : prev.samGovContacts,
      }))

      toast.success(
        mapped.samGovContacts?.length
          ? `Details imported from SAM.gov \u2014 ${mapped.samGovContacts.length} contact${mapped.samGovContacts.length === 1 ? '' : 's'} attached.`
          : 'Details imported from SAM.gov!'
      )
      setTab('details')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[SAM.gov import]', err)
      toast.error(`Import failed: ${msg}`)
    } finally {
      setImporting(false)
    }
  }

  const handleCreate = async () => {
    if (!form.solicitation?.trim()) { toast.error('Solicitation title is required'); setTab('details'); return }
    if (!form.type) { toast.error('Contract type is required'); setTab('details'); return }
    if (!form.dueDate) { toast.error('Due date is required'); setTab('schedule'); return }
    if (form.assignedTo && !allowedAssignees.includes(form.assignedTo)) {
      toast.error('You can only assign opportunities inside your team.')
      setTab('assign')
      return
    }
    const comments: Comment[] = []
    if (initialComment.trim()) {
      comments.push({
        id: crypto.randomUUID(),
        text: initialComment.trim(),
        author: currentUser?.username ?? 'unknown',
        createdAt: new Date().toISOString(),
        attachments: initialCommentAttachments,
      })
    }
    setSaving(true)
    const saved = await createOpportunity({ ...form, comments } as Omit<Opportunity, 'id'>)
    setSaving(false)
    if (saved) {
      toast.success('Opportunity created and saved to Supabase.')
      onClose()
    }
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
            placeholder="Paste a SAM.gov URL to auto-fill all fields..."
          />
          <button type="button" onClick={handleImport} disabled={importing || !samUrl.trim()}
            className="btn-primary flex-shrink-0 disabled:opacity-40">
            {importing ? <Loader size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            {importing ? 'Importing...' : 'Import'}
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
            <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Saving...' : 'Create Opportunity'}
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Contract Type</label>
              <select value={form.type ?? ''} onChange={e => set('type', e.target.value || undefined)} className="select-field">
                <option value="">Select type...</option>
                {TYPES_DISPLAY.filter(t => t.value !== 'All').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Set Aside</label>
              <select value={form.setAside ?? 'SB'} onChange={e => set('setAside', e.target.value as any)} className="select-field">
                {SET_ASIDES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>NAICS Code</label>
              <NaicsInput value={form.naicsCode ?? ''} onChange={value => set('naicsCode', value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Priority</label>
              <select value={form.priority ?? 'MEDIUM'} onChange={e => set('priority', e.target.value as any)} className="select-field">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Due Date *</label>
              <input
                type="date"
                value={form.dueDate ?? ''}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'dueDate', e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <TimezoneInput
                id="create-opportunity-timezone-options"
                value={form.timezone ?? 'Africa/Casablanca'}
                reference={form}
                onChange={value => setForm(prev => applyScheduleFieldChange(prev, 'timezone', value))}
              />
            </div>
          </div>
          {form.localTime && (
            <p className="text-[11px] text-indigo-600 -mt-2 flex items-center gap-1 font-medium">
              <Clock size={10} /> Morocco (GMT+1):{' '}
              {formatMoroccoDisplay(form.localTime, form.timezone, form.dueDate, form.moroccoTime, form.moroccoDate)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>SAM.gov Link</label>
              <input value={form.link ?? ''} onChange={e => set('link', e.target.value)} className="input-field" placeholder="https://sam.gov/opp/..." />
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
              <div><label className={lbl}>Manager</label><input value={form.bdm ?? ''} onChange={e => set('bdm', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Team Lead</label><input value={form.bds ?? ''} onChange={e => set('bds', e.target.value)} className="input-field" /></div>
              <div><label className={lbl}>Associate</label><input value={form.supportAgent ?? ''} onChange={e => set('supportAgent', e.target.value)} className="input-field" /></div>
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
              Select anyone in the hierarchy. Workload lines show total active assignments and same due-day assignments.
              {!form.dueDate && <span className="text-amber-600 font-medium"> - Set a due date in the Schedule tab to enable same-day counts.</span>}
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || undefined}
            allowedEmployeeIds={allowedAssignees}
            team="BD"
          />
        </div>
      )}

      {/* ── Contacts tab (read-only SAM.gov pointOfContact snapshot) ── */}
      {tab === 'contacts' && (
        <SamGovContactsPanel
          contacts={form.samGovContacts}
          emptyHint="Paste a SAM.gov URL above and click Import to pull the agency points of contact."
        />
      )}

      {/* ── Comments tab ── */}
      {tab === 'comments' && (
        <div className="space-y-4">
          <div>
            <label className={lbl}>Mandatory Events</label>
            <textarea
              value={form.mandatoryEvents ?? ''}
              onChange={e => set('mandatoryEvents', e.target.value)}
              rows={3}
              className="input-field w-full resize-none"
              placeholder="Site visit, pre-bid meeting, Q&A deadline..."
            />
          </div>
          <p className="text-sm font-semibold text-slate-700">Initial Comment</p>
          <p className="text-xs text-slate-400">Optionally add a comment when creating this opportunity.</p>
          <textarea
            value={initialComment}
            onChange={e => setInitialComment(e.target.value)}
            rows={5}
            className="input-field w-full resize-none"
            placeholder="Add an initial comment or note about this opportunity..."
          />
          <CommentAttachmentPicker
            attachments={initialCommentAttachments}
            onChange={setInitialCommentAttachments}
            uploadedBy={currentUser?.username ?? currentUser?.name ?? 'unknown'}
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
  onSourcing,
  onSubmit,
  onRequestDeletion,
  onCancel,
  canEdit,
  canCancel,
  canRequestDeletion,
  deletionPending,
}: {
  o: Opportunity
  canSubmit: boolean
  canEdit: boolean
  canCancel: boolean
  canRequestDeletion: boolean
  onViewDetails: () => void
  onEdit: () => void
  onSourcing: () => void
  onSubmit: () => void
  onRequestDeletion: () => void
  onCancel: () => void
  deletionPending: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const submittable = OPP_VIEW_STATUSES.includes(o.status as any)

  return (
    <FloatingActionMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      trigger={<MoreHorizontal size={14} />}
    >
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onViewDetails() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <ExternalLink size={12} /> View Details
            </button>
            {canEdit && (
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
                className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                <Edit2 size={12} /> Edit / Comment
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onSourcing() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <Users2 size={12} /> Sourcing
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
            {(canCancel || canRequestDeletion) && (
              <>
                <div className="my-1 border-t border-slate-100" />
                {canCancel && (
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onCancel() }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                    style={{ color: '#DC2626' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
                    <Ban size={12} /> Cancel
                  </button>
                )}
                {canRequestDeletion && (
                  <button
                    disabled={deletionPending}
                    onClick={e => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      if (!deletionPending) onRequestDeletion()
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: '#DC2626' }}
                    onMouseEnter={e => { if (!deletionPending) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' } }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
                    <Trash2 size={12} /> {deletionPending ? 'Deletion Pending' : 'Delete'}
                  </button>
                )}
              </>
            )}
    </FloatingActionMenu>
  )
}

// ── Paginator ─────────────────────────────────────────────────────────
function Paginator({
  total, page, pageSize, onPage, onPageSize,
}: {
  total: number; page: number; pageSize: number
  onPage: (p: number) => void; onPageSize: (s: number) => void
}) {
  const totalPages = pageSize === 0 ? 1 : Math.ceil(total / pageSize)
  const start = pageSize === 0 ? 1 : (page - 1) * pageSize + 1
  const end   = pageSize === 0 ? total : Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/60">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
          className="select-field py-1 text-xs w-auto min-w-[64px]">
          {PAGE_SIZE_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 0 ? 'All' : s}</option>
          ))}
        </select>
        <span className="ml-2 font-medium text-slate-600">
          {total === 0 ? '0' : `${start}–${end}`} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronLeft size={13} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '...')[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...')
            acc.push(p)
            return acc
          }, [])
          .map((p, i) =>
            p === '...'
              ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">...</span>
              : (
                <button
                  key={p}
                  onClick={() => onPage(p as number)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                    page === p
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}>
                  {p}
                </button>
              )
          )}
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────
type SortKey = keyof Opportunity
type SortDir = 'asc' | 'desc'

const ROLE_LABEL: Record<string, string> = {
  BD_MANAGER: 'Manager',
  TEAM_LEAD: 'Team Lead',
  ASSOCIATE: 'Associate',
}
const ROLE_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  BD_MANAGER: { color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  TEAM_LEAD:  { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  ASSOCIATE:  { color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC' },
}

const COLUMN_FILTERS = [
  { key: 'priority',       label: 'Priority',     placeholder: 'Any priority' },
  { key: 'period',         label: 'Period',       placeholder: 'Any period' },
  { key: 'capturedOn',     label: 'Captured On',  placeholder: 'Any capture date' },
  { key: 'type',           label: 'Type',         placeholder: 'Any type' },
  { key: 'naicsCode',      label: 'NAICS',        placeholder: 'Any NAICS' },
  { key: 'solicitationId', label: 'ID',           placeholder: 'Any ID' },
  { key: 'solicitation',   label: 'Solicitation', placeholder: 'Any solicitation' },
  { key: 'setAside',       label: 'Set Aside',    placeholder: 'Any set aside' },
  { key: 'localTime',      label: 'Due Date Time', placeholder: 'Any due date or time' },
  { key: 'location',       label: 'Location',     placeholder: 'Any location' },
  { key: 'manager',        label: 'Manager',      placeholder: 'Any manager' },
  { key: 'teamLead',       label: 'Team Lead',    placeholder: 'Any team lead' },
  { key: 'associate',      label: 'Associate',    placeholder: 'Any associate' },
] as const

type ColumnFilterKey = typeof COLUMN_FILTERS[number]['key']
type ColumnFilters = Record<ColumnFilterKey, string>

const EMPTY_COLUMN_FILTERS: ColumnFilters = COLUMN_FILTERS.reduce((acc, col) => {
  acc[col.key] = ''
  return acc
}, {} as ColumnFilters)

function getColumnFilterValue(o: Opportunity, key: ColumnFilterKey, employees: ReturnType<typeof useStore.getState>['employees']) {
  const chain = getAssignmentChain(employees, o.assignedTo)
  switch (key) {
    case 'type':
      return typeLabel(o.type)
    case 'localTime':
      return [
        formatOpportunitySourceDueDateTime(o),
        formatOpportunityMoroccoDueDateTime(o),
      ].filter(Boolean).join(' ')
    case 'manager':
      return chain.manager?.name ?? ''
    case 'teamLead':
      return chain.teamLead?.name ?? ''
    case 'associate':
      return chain.associate?.name ?? ''
    default:
      return String(o[key] ?? '')
  }
}

function ColumnFilterInput({
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
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <input
        value={value}
        list={id}
        onChange={e => onChange(e.target.value)}
        className="input-field text-xs py-1.5 w-full"
        placeholder={placeholder}
      />
      <datalist id={id}>
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

function dueDateLabel(dueDate: string | undefined): string {
  if (!dueDate) return '-'
  return new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function dueDateReference(opp: Pick<Opportunity, 'dueDate' | 'localTime' | 'timezone'>): Date {
  const utcMs = opportunityDeadlineTimeMs(opp)
  if (utcMs !== null) return new Date(utcMs)
  if (opp.dueDate) return new Date(`${opp.dueDate}T12:00:00Z`)
  return new Date()
}

export function formatOpportunitySourceDueDateTime(
  opp: Pick<Opportunity, 'dueDate' | 'localTime' | 'timezone'>,
): string {
  const date = dueDateLabel(opp.dueDate)
  if (!isCompleteClockTime(opp.localTime)) return date
  const timezoneCode = timezoneCodeForDisplay(opp.timezone, dueDateReference(opp)) || opp.timezone
  const time = formatLocalDueTimeShared(opp.localTime, timezoneCode)
  return opp.dueDate ? `${date} at ${time}` : time
}

export function formatOpportunityMoroccoDueDateTime(
  opp: Pick<Opportunity, 'dueDate' | 'localTime' | 'timezone' | 'moroccoTime' | 'moroccoDate'>,
): string {
  return formatMoroccoDisplay(opp.localTime, opp.timezone, opp.dueDate, opp.moroccoTime, opp.moroccoDate)
}

function DueDateTimeCell({ opp }: { opp: Opportunity }) {
  const [tooltip, setTooltip] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null)
  const localTime = formatOpportunityMoroccoDueDateTime(opp)
  const sourceDateTime = formatOpportunitySourceDueDateTime(opp)
  const hasSourceClock = isCompleteClockTime(opp.localTime)

  const showTooltip = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    const width = 320
    const margin = 10
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
    const openUp = rect.bottom + 180 > window.innerHeight && rect.top > 190
    setTooltip({
      left,
      top: openUp ? rect.top - 10 : rect.bottom + 10,
      placement: openUp ? 'top' : 'bottom',
    })
  }

  return (
    <div className="inline-flex">
      <div
        className="inline-flex max-w-[250px] cursor-help items-center gap-1.5 text-xs font-semibold text-[#F8FBF7] transition-colors hover:text-[#D7BE7A]"
        onMouseEnter={e => showTooltip(e.currentTarget)}
        onMouseLeave={() => setTooltip(null)}
        onFocus={e => showTooltip(e.currentTarget)}
        onBlur={() => setTooltip(null)}
        tabIndex={0}
      >
        <Clock size={12} className="flex-shrink-0 text-[#D7BE7A]" />
        <span className="truncate" title={sourceDateTime}>{sourceDateTime}</span>
      </div>
      {tooltip && createPortal(
        <div
          className="pointer-events-none fixed z-[100] w-80 rounded-2xl border border-[#D7BE7A]/25 bg-[#06131F] p-3 text-left shadow-[0_18px_46px_rgba(0,0,0,0.42)]"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: tooltip.placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D7BE7A]">Local Time</p>
            <Clock size={13} className="text-[#D7BE7A]" />
          </div>
          <div className="space-y-2 text-xs">
            {localTime ? (
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200">Morocco local time</p>
                <p className="mt-0.5 text-sm font-black text-emerald-100">{localTime}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">Conversion unavailable</p>
                <p className="mt-0.5 text-sm font-black text-amber-50">
                  {hasSourceClock ? 'Check the source timezone.' : 'Add the source due time to calculate GMT+1.'}
                </p>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-400">SAM.gov original</span>
              <span className="max-w-[190px] text-right font-bold text-[#F8FBF7]">{sourceDateTime}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default function PipelinePage() {
  const { opportunities, employees, currentUser, deletionRequests, moveOpportunityToBDTracker, deleteSubcontractor } = useStore()
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')

  // ── Filter state ──
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => ({ ...EMPTY_COLUMN_FILTERS }))
  const [dueDateRange, setDueDateRange] = useState<Period | null>(null)

  // ── Modal state ──
  const [showCreate, setShowCreate]   = useState(false)
  const [editOpp, setEditOpp]         = useState<Opportunity | null>(null)
  const [sourcingOpp, setSourcingOpp] = useState<Opportunity | null>(null)
  const [submitOpp, setSubmitOpp]     = useState<Opportunity | null>(null)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [deleteOpp, setDeleteOpp]     = useState<Opportunity | null>(null)

  // ── Sort state ──
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'dueDate', dir: 'asc' })

  // ── Pagination state ──
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const canCreateOpportunity = hasPermission(currentUser, 'opportunity:create')
  const canSubmit = hasPermission(currentUser, 'opportunity:submitProposal')
  const canEditOpportunities = hasPermission(currentUser, 'opportunity:edit')
  const canCommentOpportunities = hasPermission(currentUser, 'opportunity:comment')
  const canCancelOpportunities = hasPermission(currentUser, 'opportunity:cancel')
  const canRequestDeletion = hasPermission(currentUser, 'opportunity:deleteRequest')
  const canWriteSourcing = hasPermission(currentUser, 'sourcing:write')
  const canOpenEditModal = canEditOpportunities || canCommentOpportunities
  const pendingDeletionIds = useMemo(
    () => new Set(deletionRequests.filter(r => r.status === 'PENDING').map(r => r.opportunityId)),
    [deletionRequests],
  )

  useEffect(() => {
    if (!globalRecordId) return
    const target = opportunities.find(o => o.id === globalRecordId || o.solicitationId === globalRecordId)
    if (!target) return
    setColumnFilters({ ...EMPTY_COLUMN_FILTERS })
    setDueDateRange(null)
    setPage(1)
    setSelectedOpp(target)
  }, [globalRecordId, opportunities])

  const filterOptions = useMemo(() => {
    const visibleOpps = opportunities.filter(o => !o.isDeleted && !o.nonSubmissionReportId && OPP_VIEW_STATUSES.includes(o.status as any) && isAssignedToAssociate(employees, o.assignedTo))
    return COLUMN_FILTERS.reduce((acc, col) => {
      const values = visibleOpps
        .map(o => getColumnFilterValue(o, col.key, employees))
        .map(v => v.trim())
        .filter(Boolean)
      acc[col.key] = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
      return acc
    }, {} as Record<ColumnFilterKey, string[]>)
  }, [opportunities, employees])

  const filtered = useMemo(() => {
    let list = opportunities.filter(o => !o.isDeleted && !o.nonSubmissionReportId && OPP_VIEW_STATUSES.includes(o.status as any) && isAssignedToAssociate(employees, o.assignedTo))

    if (dueDateRange) list = list.filter(o => filterByPeriod(o.dueDate, dueDateRange))

    COLUMN_FILTERS.forEach(col => {
      const q = columnFilters[col.key].trim().toLowerCase()
      if (!q) return
      list = list.filter(o => getColumnFilterValue(o, col.key, employees).toLowerCase().includes(q))
    })

    list.sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? ''
      const r = String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? r : -r
    })
    return list
  }, [opportunities, employees, sort, dueDateRange, columnFilters])

  // Paginated slice
  const paginated = useMemo(() => {
    if (pageSize === 0) return filtered
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  // Reset page when filters change
  const resetPage = () => setPage(1)

  const toggleSort = (key: SortKey) => {
    setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    resetPage()
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sort.key !== k) return <ChevronsUpDown size={9} className="text-slate-400" />
    return sort.dir === 'asc' ? <ChevronUp size={9} className="text-indigo-500" /> : <ChevronDown size={9} className="text-indigo-500" />
  }

  const clearAll = () => {
    setColumnFilters({ ...EMPTY_COLUMN_FILTERS })
    setDueDateRange(null)
    resetPage()
  }

  const hasFilters = !!dueDateRange || Object.values(columnFilters).some(v => v.trim())

  const handleCancel = (o: Opportunity) => {
    if (!canCancelOpportunities) {
      toast.error('Only the Capture Manager can cancel contract opportunities.')
      return
    }
    moveOpportunityToBDTracker(o.id, 'CANCELED', 'Canceled from Contract Opportunities')
    toast.success(`"${o.solicitation}" canceled.`)
  }

  const handleDelete = (o: Opportunity) => {
    if (!canRequestDeletion) {
      toast.error('You do not have permission to request opportunity deletion.')
      return
    }
    if (pendingDeletionIds.has(o.id)) {
      toast.error('A deletion request is already pending for this opportunity.')
      return
    }
    setDeleteOpp(o)
  }

  const handleDeleteSourcing = (subId: string, companyName?: string) => {
    if (!canWriteSourcing) {
      toast.error('You do not have permission to update sourcing.')
      return
    }
    if (!confirm(`Remove ${companyName || 'this subcontractor'} from this opportunity?`)) return
    deleteSubcontractor(subId)
    setSelectedOpp(prev =>
      prev
        ? { ...prev, subcontractors: (prev.subcontractors || []).filter(s => s.id !== subId) }
        : prev,
    )
    toast.success('Subcontractor removed')
  }

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES - PIPELINE</p>
          <h1 className="text-2xl font-black text-slate-900">Contract Opportunities</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateOpportunity && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus size={14} /> New Opportunity
            </button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="glass rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <p className="text-xs font-bold text-slate-700">Column filters</p>
            <p className="text-[11px] text-slate-500">Type in any column filter and choose a suggestion from the dropdown.</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
          {hasFilters && (
            <button onClick={clearAll}
              className="btn-ghost text-xs flex items-center gap-1 text-slate-500">
              <X size={11} /> Clear all
            </button>
          )}

          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <Download size={12} /> Export
          </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3 pt-2 border-t border-slate-100">
          {COLUMN_FILTERS.map(col => (
            <ColumnFilterInput
              key={col.key}
              id={`pipeline-filter-${col.key}`}
              label={col.label}
              value={columnFilters[col.key]}
              placeholder={col.placeholder}
              suggestions={filterOptions[col.key] ?? []}
              onChange={value => {
                setColumnFilters(prev => ({ ...prev, [col.key]: value }))
                resetPage()
              }}
            />
          ))}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Due Date</label>
            <PeriodFilter
              value={dueDateRange}
              onChange={value => {
                setDueDateRange(value)
                resetPage()
              }}
              placeholder="All dates"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-visible">
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <Filter size={12} className="text-slate-400" />
          <p className="text-xs font-semibold text-slate-500">{filtered.length} results - select a row to see details</p>
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { label: 'Priority',    k: 'priority' },
                  { label: 'Period',      k: 'period' },
                  { label: 'Captured On', k: 'capturedOn' },
                  { label: 'Type',        k: 'type' },
                  { label: 'NAICS',       k: 'naicsCode' },
                  { label: 'ID',          k: 'solicitationId' },
                  { label: 'Solicitation', k: 'solicitation' },
                  { label: 'Set Aside',   k: 'setAside' },
                  { label: 'Due Date Time', k: 'dueDate', title: 'Hover a due date time to see Morocco time' },
                  { label: 'Location',    k: 'location' },
                  { label: 'Manager',     k: '' },
                  { label: 'Team Lead',   k: '' },
                  { label: 'Associate',   k: '' },
                  { label: 'Actions',     k: '' },
                ].map(col => (
                  <th key={col.k || col.label} title={'title' in col ? col.title : undefined}>
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
                {paginated.map((o, i) => (
                  <motion.tr key={o.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.015, duration: 0.2 }}
                    onClick={() => setSelectedOpp(o)}
                    className={`cursor-pointer ${o.deletionRequested ? 'opacity-50' : ''}`}>
                    <td><PriorityBadge p={o.priority} /></td>
                    <td className="text-slate-500 text-xs">{o.period}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{o.capturedOn}</td>
                    <td>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">{typeLabel(o.type)}</span>
                    </td>
                    <td><span className="text-slate-500 text-xs font-mono">{o.naicsCode}</span></td>
                    <td><span className="text-indigo-600 text-xs font-mono font-semibold">{o.solicitationId}</span></td>
                    <td className="max-w-[200px]">
                      <p className="truncate text-xs text-slate-800 font-medium" title={o.solicitation}>{o.solicitation}</p>
                    </td>
                    <td>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{o.setAside}</span>
                    </td>
                    <td><DueDateTimeCell opp={o} /></td>
                    <td><span className="text-slate-500 text-xs">{o.location}</span></td>
                    {(() => {
                      const chain = getAssignmentChain(employees, o.assignedTo)
                      return (
                        <>
                          <td><span className="text-slate-600 text-xs">{chain.manager?.name || '-'}</span></td>
                          <td><span className="text-slate-600 text-xs">{chain.teamLead?.name || '-'}</span></td>
                          <td>
                            {chain.associate ? (
                              <span className="text-xs text-slate-700 font-semibold whitespace-nowrap">{chain.associate.name}</span>
                            ) : <span className="text-slate-400 text-xs">-</span>}
                          </td>
                        </>
                      )
                    })()}
                    <td onClick={e => e.stopPropagation()}>
                      <RowMenu
                        o={o}
                        canSubmit={canSubmit}
                        onViewDetails={() => setSelectedOpp(o)}
                        onEdit={() => setEditOpp(o)}
                        onSourcing={() => setSourcingOpp(o)}
                        onSubmit={() => setSubmitOpp(o)}
                        onCancel={() => handleCancel(o)}
                        onRequestDeletion={() => handleDelete(o)}
                        canEdit={canOpenEditModal}
                        canCancel={canCancelOpportunities}
                        canRequestDeletion={canRequestDeletion}
                        deletionPending={pendingDeletionIds.has(o.id)}
                      />
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
        {/* Paginator */}
        {filtered.length > 0 && (
          <Paginator
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={s => { setPageSize(s); setPage(1) }}
          />
        )}
      </div>

      {/* Detail modal */}
      <DetailDrawer
        isOpen={!!selectedOpp}
        onClose={() => setSelectedOpp(null)}
        title={selectedOpp?.solicitation ?? ''}
        subtitle={selectedOpp ? `${selectedOpp.solicitationId} - ${selectedOpp.client}` : ''}
        width={1080}
        placement="modal"
        showBackdrop
        variant="premium"
      >
        {selectedOpp && (
          <>
            <div className="mb-6 rounded-3xl border border-[#D7BE7A]/20 bg-gradient-to-r from-[#102820]/90 via-[#0A2327]/90 to-[#0A1D2B]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge p={selectedOpp.priority} />
                <span className="rounded-lg border border-[#7DD3FC]/30 bg-[#7DD3FC]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#BAE6FD]">{typeLabel(selectedOpp.type)}</span>
                <span className="rounded-lg border border-[#D7BE7A]/25 bg-[#D7BE7A]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[#F8FBF7]">{selectedOpp.solicitationId}</span>
              </div>
              <div className="mt-3 grid gap-3 text-xs text-slate-300 md:grid-cols-3">
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Agency</p>
                  <p className="truncate font-semibold text-[#F8FBF7]" title={selectedOpp.client}>{selectedOpp.client || '-'}</p>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Due</p>
                  <p className="truncate font-semibold text-[#F8FBF7]">
                    {formatOpportunitySourceDueDateTime(selectedOpp)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Location</p>
                  <p className="truncate font-semibold text-[#F8FBF7]" title={selectedOpp.location}>{selectedOpp.location || '-'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DrawerSection title="Overview" variant="premium">
                <DrawerField label="Client"    value={selectedOpp.client} variant="premium" />
                <DrawerField label="Type"      value={typeLabel(selectedOpp.type)} variant="premium" />
                <DrawerField label="Set-Aside" value={selectedOpp.setAside} variant="premium" />
                <DrawerField label="NAICS"     value={selectedOpp.naicsCode} variant="premium" />
                <DrawerField label="Location"  value={selectedOpp.location} variant="premium" />
                <DrawerField label="Period"    value={selectedOpp.period} variant="premium" />
              </DrawerSection>

              <DrawerSection title="Team" variant="premium">
                {(() => {
                  const chain = getAssignmentChain(employees, selectedOpp.assignedTo)
                  return (
                    <>
                      <DrawerField label="Manager" value={chain.manager?.name || '-'} variant="premium" />
                      <DrawerField label="Team Lead" value={chain.teamLead?.name || '-'} variant="premium" />
                      <DrawerField label="Associate" value={chain.associate?.name || '-'} variant="premium" />
                    </>
                  )
                })()}
              </DrawerSection>

              <DrawerSection title="Schedule" variant="premium">
                <DrawerField label="Due Date"  value={new Date(selectedOpp.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} variant="premium" />
                <DrawerField label="Source Time" value={formatOpportunitySourceDueDateTime(selectedOpp)} variant="premium" />
                {formatOpportunityMoroccoDueDateTime(selectedOpp) && (
                  <DrawerField label="Morocco (GMT+1)" value={
                    <span className="font-bold text-[#7DD3FC]">
                      {formatOpportunityMoroccoDueDateTime(selectedOpp)}
                    </span>
                  } variant="premium" />
                )}
                <DrawerField label="Captured On" value={selectedOpp.capturedOn} variant="premium" />
              </DrawerSection>

            </div>

            {selectedOpp.mandatoryEvents && (
              <DrawerSection title="Mandatory Events" variant="premium">
                <p className="py-3 text-sm leading-6 text-slate-200">{selectedOpp.mandatoryEvents}</p>
              </DrawerSection>
            )}

            {selectedOpp.comments && selectedOpp.comments.length > 0 && (
              <DrawerSection title={`Comments (${selectedOpp.comments.length})`} variant="premium">
                {selectedOpp.comments.map((c: Comment) => (
                  <div key={c.id} className="border-b border-[#D7BE7A]/15 py-3 last:border-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-[#F8FBF7]">{c.author}</span>
                      <span className="text-[10px] font-medium text-slate-400">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-xs leading-5 text-slate-300">{c.text}</p>
                    <CommentAttachments attachments={c.attachments} />
                  </div>
                ))}
              </DrawerSection>
            )}

            {selectedOpp.subcontractors && selectedOpp.subcontractors.length > 0 && (
              <DrawerSection title={`Sourcing (${selectedOpp.subcontractors.length})`} variant="premium">
                {selectedOpp.subcontractors.map(s => (
                  <div key={s.id} className="border-b border-[#D7BE7A]/15 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#F8FBF7]">{s.companyName}</p>
                        <p className="text-xs text-slate-400">{s.contactName || s.email || s.phone || '-'}</p>
                        {s.quoteFile && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#7DD3FC]">
                            <FileText size={9} /> {s.quoteFile}
                          </p>
                        )}
                      </div>
                      {canWriteSourcing && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSourcing(s.id, s.companyName)}
                          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 transition-all hover:border-rose-300/60 hover:bg-rose-500/20 hover:text-rose-100"
                          title="Delete subcontractor"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </DrawerSection>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-5 mt-4 flex flex-wrap gap-2 border-t border-[#D7BE7A]/15 bg-[#07131F]/95 px-6 py-4 backdrop-blur">
              {canOpenEditModal && (
                <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setEditOpp(selectedOpp) }}>
                  <Edit2 size={12} /> {canEditOpportunities ? 'Edit' : 'Comment'}
                </button>
              )}
              <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSourcingOpp(selectedOpp) }}>
                <Users2 size={12} /> Sourcing
              </button>
              {canSubmit && OPP_VIEW_STATUSES.includes(selectedOpp.status as any) && (
                <button className="btn-primary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSubmitOpp(selectedOpp) }}>
                  <Send size={12} /> Submit Proposal
                </button>
              )}
              {(canCancelOpportunities || canRequestDeletion) && (
                <>
                  {canCancelOpportunities && (
                    <button className="btn-secondary text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setSelectedOpp(null); handleCancel(selectedOpp) }}>
                      <Ban size={12} /> Cancel
                    </button>
                  )}
                  {canRequestDeletion && (
                  <button
                    className="btn-secondary text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={pendingDeletionIds.has(selectedOpp.id)}
                    onClick={() => { setSelectedOpp(null); handleDelete(selectedOpp) }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </DetailDrawer>

      {/* Modals */}
      <AnimatePresence>
        {showCreate    && <CreateModal onClose={() => setShowCreate(false)} />}
        {editOpp       && <EditModal opp={editOpp} onClose={() => setEditOpp(null)} />}
        {sourcingOpp   && <SourcingModal opp={sourcingOpp} onClose={() => setSourcingOpp(null)} />}
        {submitOpp     && <SubmitModal opp={submitOpp} onClose={() => setSubmitOpp(null)} />}
        {deleteOpp     && <DeleteOpportunityModal opp={deleteOpp} onClose={() => setDeleteOpp(null)} />}
      </AnimatePresence>
    </div>
  )
}
