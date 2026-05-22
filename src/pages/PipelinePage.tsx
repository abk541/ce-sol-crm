import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, ExternalLink, Loader,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Edit2, Users2, Send, Trash2, Clock,
  FileText, PlusCircle, Download, Filter, MoreHorizontal,
  Ban, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Opportunity, Priority, OppStatus, Comment, FileAttachment } from '../types'
import { TIMEZONES } from '../data/mock'
import { formatCurrency } from '../lib/utils'
import { assignableEmployeesForUser, getAssignmentChain, isAssignedToAssociate, ROLE_DISPLAY_LABELS } from '../lib/team'
import { NAICS_CODES } from '../data/naics'
import toast from 'react-hot-toast'
import DetailDrawer, { DrawerSection, DrawerField } from '../components/shared/DetailDrawer'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'
import FloatingActionMenu from '../components/shared/FloatingActionMenu'
import {
  formatLocalDueTime as formatLocalDueTimeShared,
  formatMoroccoDueTime as formatMoroccoDueTimeShared,
  normalizeUtcOffset,
  opportunityDeadlineTimeMs,
  timezoneLabelFromOffset,
  utcToMoroccoClock,
} from '../lib/timezone'

// ── Constants ─────────────────────────────────────────────────────────
const TYPES_DISPLAY: { value: string; label: string }[] = [
  { value: 'All',       label: 'All' },
  { value: 'OTJ',       label: 'OTJ' },
  { value: 'RECURRING', label: 'RECURRING' },
  { value: 'BPA',       label: 'BPA' },
  { value: 'IDIQ',      label: 'IDIQ' },
  { value: 'S&D',       label: 'Delivery' },
  { value: 'SUPPLY',    label: 'SUPPLY' },
]
const SET_ASIDES = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']
const PRIORITIES: Priority[] = ['MEDIUM', 'HIGH', 'VERY_HIGH']
const SAM_TIMEZONE_ALIASES: Record<string, string> = {
  'EASTERN STANDARD TIME': 'EST',
  'EASTERN DAYLIGHT TIME': 'EDT',
  'CENTRAL STANDARD TIME': 'CST',
  'CENTRAL DAYLIGHT TIME': 'CDT',
  'MOUNTAIN STANDARD TIME': 'MST',
  'MOUNTAIN DAYLIGHT TIME': 'MDT',
  'PACIFIC STANDARD TIME': 'PST',
  'PACIFIC DAYLIGHT TIME': 'PDT',
  'HAWAII STANDARD TIME': 'HST',
  'GREENWICH MEAN TIME': 'GMT',
}

// Pre-submission view statuses only
const OPP_VIEW_STATUSES: OppStatus[] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

const TZ_ABBREVS = Object.keys(TIMEZONES)

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 0] // 0 = All
function getBuildSamGovApiKey() {
  return ((import.meta.env.VITE_SAM_GOV_API_KEY as string | undefined) ?? '').trim()
}

export function formatSamGovDate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function samGovEasternToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`)
}

export function getSamGovPostedRange(now = new Date()) {
  const postedTo = samGovEasternToday(now)
  const postedFrom = new Date(postedTo)
  postedFrom.setFullYear(postedTo.getFullYear() - 1)
  postedFrom.setDate(postedFrom.getDate() + 1)
  return {
    postedFrom: formatSamGovDate(postedFrom),
    postedTo: formatSamGovDate(postedTo),
  }
}

export function buildSamGovOpportunityEndpoint(url: string, apiKey: string, now = new Date()) {
  const trimmedUrl = url.trim()
  const trimmedKey = apiKey.trim()
  if (!trimmedUrl) throw new Error('SAM.gov URL is required.')
  if (!trimmedKey) throw new Error('SAM.gov API key is required.')

  const oppIdMatch = trimmedUrl.match(/\/opp\/([a-f0-9]{32})/i)
  const solNumMatch = trimmedUrl.match(/[?&]q=([^&]+)/) || trimmedUrl.match(/\/([A-Z0-9\-]{6,})\/?(?:view)?$/i)
  const solNum = solNumMatch ? decodeURIComponent(solNumMatch[1]).trim() : ''
  if (!oppIdMatch && (!solNum || !/\d/.test(solNum))) {
    throw new Error('Could not parse the SAM.gov URL. Paste the full URL from the opportunity page.')
  }

  const { postedFrom, postedTo } = getSamGovPostedRange(now)
  const params = new URLSearchParams({
    limit: '1',
    offset: '0',
    api_key: trimmedKey,
    postedFrom,
    postedTo,
  })
  if (oppIdMatch) params.set('noticeid', oppIdMatch[1])
  else params.set('solnum', solNum)

  return `https://api.sam.gov/opportunities/v2/search?${params.toString()}`
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
  if (val === 'S&D') return 'Delivery'
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

/**
 * Maps a fixed UTC-offset string (e.g. "-05:00") to a TIMEZONES abbreviation
 * key. US offsets pick the daylight or standard label that matches the actual
 * offset — e.g. -04:00 is EDT (Eastern Daylight), -05:00 is EST (Eastern
 * Standard). SAM.gov sends the explicit offset in effect at the deadline,
 * so this preserves the same abbreviation the SAM.gov UI shows.
 */
function offsetToTzAbbrev(offset: string): string {
  const MAP: Record<string, string> = {
    Z: 'GMT', '+00:00': 'GMT', '-00:00': 'GMT',
    '-04:00': 'EDT',   // Eastern Daylight (was incorrectly mapped to EST)
    '-05:00': 'EST',   // Eastern Standard
    '-06:00': 'CST',   // Central Standard (also CDT in some agencies — defaulting to CST)
    '-07:00': 'MST',   // Mountain Standard (also PDT — defaulting to MST)
    '-08:00': 'PST',   // Pacific Standard
    '-09:00': 'PST',
    '-10:00': 'HST',   // Hawaii (no DST)
    '+01:00': 'GMT+1',
    '+02:00': 'EET',
    '+03:00': 'AST', '+03:30': 'IRT',
  }
  return MAP[offset] ?? offset   // keep raw offset when unknown
}

/** Adds exactly 1 hour (Morocco = UTC+1) to the given UTC milliseconds. */
function utcPlusOneHour(utcMs: number): { moroccoDate: string; moroccoTime: string } {
  const d = new Date(utcMs + 60 * 60 * 1000)
  return {
    moroccoDate: d.toISOString().slice(0, 10),
    moroccoTime: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  }
}

function normaliseSamGovTimezone(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (!raw) return ''

  const upper = raw.toUpperCase()
  if (TIMEZONES[upper]) return upper
  if (SAM_TIMEZONE_ALIASES[upper]) return SAM_TIMEZONE_ALIASES[upper]
  if (/^(?:UTC|GMT)?[+-]\d{2}:?\d{2}$/i.test(raw)) {
    return timezoneLabelFromOffset(normalizeUtcOffset(raw.replace(/^(?:UTC|GMT)/i, '')))
  }
  return TIMEZONES[raw] ? raw : ''
}

export function extractSamGovDeadlineTimezone(opp: any): string {
  const candidates = [
    opp?.responseDeadLineTimeZone,
    opp?.responseDeadlineTimeZone,
    opp?.responseDeadLineTimezone,
    opp?.responseDeadlineTimezone,
    opp?.deadlineTimeZone,
    opp?.deadlineTimezone,
    opp?.timeZone,
    opp?.timezone,
  ]
  for (const candidate of candidates) {
    const normalised = normaliseSamGovTimezone(candidate)
    if (normalised) return normalised
  }
  return ''
}

export function parseSamGovDeadline(raw: string | undefined, specifiedTimezone = ''): {
  dueDate: string; localTime: string; timezone: string; moroccoDate: string; moroccoTime: string
} {
  const empty = { dueDate: '', localTime: '', timezone: 'GMT+1', moroccoDate: '', moroccoTime: '' }
  if (!raw) return empty

  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/)
  if (m) {
    const dateStr = m[1]   // "2026-05-27"
    const timeStr = m[2]   // "10:00" — local clock time as stated in the ISO string
    const rawOff  = m[3] ?? ''

    if (rawOff) {
      // Normalise compact form e.g. "-0500" → "-05:00"
      const normalised = normalizeUtcOffset(rawOff)
      const { moroccoDate, moroccoTime } = utcToMoroccoClock(new Date(raw).getTime())
      return {
        dueDate: dateStr,
        localTime: formatTime12h(timeStr),
        timezone: specifiedTimezone || timezoneLabelFromOffset(normalised),
        moroccoDate,
        moroccoTime: formatTime12h(moroccoTime),
      }
    }

    // No UTC offset present — treat local time as already in Morocco (GMT+1)
    return {
      dueDate: dateStr,
      localTime: formatTime12h(timeStr),
      timezone: 'GMT+1',
      moroccoDate: dateStr,
      moroccoTime: formatTime12h(timeStr),
    }
  }

  // Fallback: let Date parse it and treat the result as UTC
  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) return empty
  const utcDate = parsed.toISOString().slice(0, 10)
  const utcTime = `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`
  const { moroccoDate, moroccoTime } = utcToMoroccoClock(parsed.getTime())
  return {
    dueDate: utcDate,
    localTime: formatTime12h(utcTime),
    timezone: 'GMT',
    moroccoDate,
    moroccoTime: formatTime12h(moroccoTime),
  }
}

/**
 * Extracts the Client / Agency name from a SAM.gov opportunity record.
 *
 * Priority (matches the SAM.gov UI):
 *   1. Sub-tier   — the field SAM.gov labels "Sub-tier"
 *   2. Department / Ind. Agency — when sub-tier is missing
 *
 * The v2 Opportunities API returns the agency hierarchy in any of three
 * shapes depending on endpoint and record age, so we probe all of them:
 *   • flat strings:    subtierName / departmentName
 *   • nested objects:  subTier.name / department.name
 *   • joined path:     fullParentPathName = "DEPT.SUBTIER.OFFICE"
 */
export function extractSamGovAgency(opp: any): string {
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const pathParts: string[] = typeof opp?.fullParentPathName === 'string'
    ? opp.fullParentPathName.split('.').map((p: string) => p.trim()).filter(Boolean)
    : []

  // 1. Sub-tier (preferred — labelled "Client / Agency" in our form)
  const subTier =
    trim(opp?.subTier) ||
    trim(opp?.subTier?.name) ||
    trim(opp?.subtierName) ||
    (pathParts.length >= 2 ? pathParts[1] : '')
  if (subTier) return subTier

  // 2. Department / Ind. Agency (fallback)
  const department =
    trim(opp?.department) ||
    trim(opp?.department?.name) ||
    trim(opp?.departmentName) ||
    (pathParts.length >= 1 ? pathParts[0] : '')
  if (department) return department

  // 3. Last-resort fallbacks (older response shapes)
  return trim(opp?.organizationName) || trim(opp?.agencyName) || 'Unknown'
}

export function mapSamGovOpportunityToForm(opp: any, url: string) {
  const setAsideMap: Record<string, string> = {
    SBA: 'SB',
    SDVOSBC: 'SDVOSB',
    WOSB: 'WOSB',
    HZC: 'HUBZone',
    VOSB: 'VOSB',
    '8AN': '8(a)',
    NONE: 'UNRES',
  }
  const pop = opp.placeOfPerformance
  const locationParts = [pop?.city?.name, pop?.state?.code].filter(Boolean)
  const deadline = parseSamGovDeadline(opp.responseDeadLine, extractSamGovDeadlineTimezone(opp))
  return {
    solicitation: opp.title ?? '',
    solicitationId: opp.solicitationNumber ?? '',
    client: extractSamGovAgency(opp),
    naicsCode: opp.naicsCode ?? '',
    setAside: (setAsideMap[opp.typeOfSetAside ?? ''] ?? 'UNRES') as Opportunity['setAside'],
    type: undefined,
    location: locationParts.join(', '),
    dueDate: deadline.dueDate,
    localTime: deadline.localTime,
    timezone: deadline.timezone,
    moroccoTime: deadline.moroccoTime,
    moroccoDate: deadline.moroccoDate,
    link: url,
  }
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

function parseClockTime(time: string | undefined) {
  const value = (time || '').trim()
  const twelve = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (twelve) {
    let hour = Number(twelve[1])
    const minute = Number(twelve[2] ?? 0)
    const marker = twelve[3].toUpperCase()
    if (marker === 'PM' && hour < 12) hour += 12
    if (marker === 'AM' && hour === 12) hour = 0
    return { hour, minute }
  }
  const twentyFour = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFour) return { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) }
  return { hour: 0, minute: 0 }
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const { hour, minute } = parseClockTime(time)
  const utcGuess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0))
  const offset = timeZoneOffsetMs(utcGuess, timeZone)
  return new Date(utcGuess.getTime() - offset)
}

/** Inverse of zonedDateTimeToUtc: returns the wall-clock date + 24h time in the target zone. */
function utcToZonedClock(utc: Date, timeZone: string): { date: string; time24: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(utc)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  // Intl's en-US locale can emit "24" for midnight; normalise to "00".
  const h = get('hour') === '24' ? '00' : get('hour')
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time24: `${h}:${get('minute')}`,
  }
}

function applyTimezoneChange(
  current: Partial<Opportunity>,
  newTz: string,
): Partial<Opportunity> {
  return syncMoroccoProjection({ ...current, timezone: newTz })
}

function isCompleteClockTime(time: string | undefined): boolean {
  if (!time?.trim()) return false
  const value = time.trim()
  return /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.test(value) || /^\d{1,2}:\d{2}$/.test(value)
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

/** Normalises any of "10:00", "10:00 AM", "5:30PM", "17:30" to canonical "h:MM AM/PM". */
export function formatTime12h(time: string | undefined): string {
  if (!time) return ''
  const value = String(time).trim()
  const twelve = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (twelve) {
    const h = Number(twelve[1])
    const min = twelve[2] ?? '00'
    return `${h}:${min} ${twelve[3].toUpperCase()}`
  }
  const twentyFour = value.match(/^(\d{1,2}):(\d{2})/)
  if (twentyFour) {
    const h = Number(twentyFour[1])
    const min = twentyFour[2]
    if (!Number.isFinite(h)) return value
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${min} ${period}`
  }
  return value
}

function formatOpportunityTime(time: string | undefined, sourceTzAbbrev?: string, date?: string): string {
  if (!time) return '-'
  const ianaSource = sourceTzAbbrev ? TIMEZONES[sourceTzAbbrev] : undefined
  try {
    if (sourceTzAbbrev === 'GMT' || sourceTzAbbrev?.startsWith('UTC')) return formatLocalDueTimeShared(time, sourceTzAbbrev)
    if (ianaSource && date) {
      const utc = zonedDateTimeToUtc(date, time, ianaSource)
      return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaSource,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      }).format(utc)
    }
    const { hour: h, minute: m } = parseClockTime(time)
    const d = new Date()
    d.setHours(h || 0, m || 0, 0, 0)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return `${time} ${sourceTzAbbrev ?? ''}`.trim()
  }
}

function convertTime(time: string, sourceTzAbbrev: string, date?: string): string {
  const ianaSource = TIMEZONES[sourceTzAbbrev]
  if (!ianaSource || !time) return `${time} ${sourceTzAbbrev}`
  try {
    const actualUTC = zonedDateTimeToUtc(date || new Date().toISOString().slice(0, 10), time, ianaSource)
    const moroccoStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Etc/GMT-1',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'shortOffset',
    }).format(actualUTC)
    return `${moroccoStr} (Morocco)`
  } catch { return `${time} ${sourceTzAbbrev}` }
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
  return formatMoroccoDueTimeShared({ localTime, timezone, dueDate, moroccoTime, moroccoDate })
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
type OppFormTab = 'details' | 'schedule' | 'team' | 'assign' | 'comments'
const OPP_FORM_TABS: { id: OppFormTab; label: string }[] = [
  { id: 'details',  label: 'Opportunity' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'assign',   label: 'Assignment' },
  { id: 'comments', label: 'Comments' },
]

function OppModalShell({ title, subtitle, tab, setTab, onClose, extraHeader, footer, children }: {
  title: string; subtitle?: string
  tab: OppFormTab; setTab: (t: OppFormTab) => void
  onClose: () => void
  extraHeader?: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
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
function EditModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { updateOpportunity, requestDeletion, deletionRequests, currentUser, employees } = useStore()
  const [tab, setTab] = useState<OppFormTab>('details')
  const [form, setForm] = useState<Partial<Opportunity>>({ ...opp })
  const [showDeleteReq, setShowDeleteReq] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [newComment, setNewComment] = useState('')
  const [newCommentAttachments, setNewCommentAttachments] = useState<FileAttachment[]>([])
  const [saving, setSaving] = useState(false)

  const isManager = currentUser?.role === 'BD_MANAGER'
  const hasPendingDelete = deletionRequests.some(r => r.opportunityId === opp.id && r.status === 'PENDING')
  const allowedAssignees = useMemo(() => {
    const ids = assignableEmployeesForUser(employees, currentUser).map(employee => employee.id)
    if (form.assignedTo && !ids.includes(form.assignedTo)) ids.push(form.assignedTo)
    return ids
  }, [employees, currentUser, form.assignedTo])
  const set = (k: keyof Opportunity, v: any) => setForm(p => ({ ...p, [k]: v }))
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  const handleSave = async () => {
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
          {isManager && !hasPendingDelete && (
            <button type="button" onClick={() => setShowDeleteReq(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
              <Trash2 size={12} /> Request Deletion
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving && <Loader size={13} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
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
          <div className="grid grid-cols-3 gap-4">
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
              <label className={lbl}>Local Time (HH:MM)</label>
              <input
                value={form.localTime ?? ''}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'localTime', e.target.value))}
                onBlur={e => {
                  const normalised = formatTime12h(e.target.value.trim())
                  if (normalised && normalised !== e.target.value) {
                    setForm(prev => applyScheduleFieldChange(prev, 'localTime', normalised))
                  }
                }}
                className="input-field"
                placeholder="5:00 PM"
              />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <select
                value={form.timezone ?? 'GMT+1'}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'timezone', e.target.value))}
                className="select-field"
              >
                {TZ_ABBREVS.map(t => <option key={t}>{t}</option>)}
              </select>
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
              Select anyone in the hierarchy. The ⚠ badge shows when they already have a contract ending on the same due date.
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || opp.dueDate || undefined}
            allowedEmployeeIds={allowedAssignees}
          />
        </div>
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
            <p className="text-[10px] text-slate-400 mt-1">Comment will be saved when you click "Save Changes".</p>
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

function SourcingModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { subcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor, currentUser } = useStore()
  const [tab, setTab] = useState<'list' | 'add'>('list')
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', comment: '', quoteFile: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ companyName: '', contactName: '', email: '', phone: '', newComment: '', quoteFile: '', comments: [] as Comment[] })

  const oppSubs = subcontractors.filter(s => s.opportunityId === opp.id)
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setEF = (k: string, v: string) => setEditForm(p => ({ ...p, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyName) return
    addSubcontractor({
      companyName: form.companyName,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      quoteFile: form.quoteFile,
      notes: form.comment.trim()
        ? serializeSourcingComments([{
            id: crypto.randomUUID(),
            text: form.comment.trim(),
            author: currentUser?.username ?? '',
            createdAt: new Date().toISOString(),
          }])
        : '',
      naicsCode: '',
      setAside: 'SB',
      opportunityId: opp.id,
      createdBy: currentUser?.username ?? '',
    })
    toast.success('Sourcing entry added')
    setForm({ companyName: '', contactName: '', email: '', phone: '', comment: '', quoteFile: '' })
    setTab('list')
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditForm({ companyName: s.companyName, contactName: s.contactName, email: s.email, phone: s.phone, newComment: '', quoteFile: s.quoteFile ?? '', comments: parseSourcingComments(s.notes) })
  }

  const saveEdit = (id: string) => {
    const comments = [...editForm.comments]
    if (editForm.newComment.trim()) {
      comments.push({
        id: crypto.randomUUID(),
        text: editForm.newComment.trim(),
        author: currentUser?.username ?? '',
        createdAt: new Date().toISOString(),
      })
    }
    updateSubcontractor(id, {
      companyName: editForm.companyName,
      contactName: editForm.contactName,
      email: editForm.email,
      phone: editForm.phone,
      quoteFile: editForm.quoteFile,
      notes: serializeSourcingComments(comments),
    })
    toast.success('Sourcing entry updated')
    setEditingId(null)
  }

  return (
    <ModalWrap onClose={onClose} title="Sourcing" subtitle={opp.solicitation} maxW="max-w-5xl">
      <div className="px-6 pt-4 pb-2">
        <div className="flex gap-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200 inline-flex">
          <button onClick={() => setTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'list' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            Sourcing ({oppSubs.length})
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
            <div className="py-10 text-center text-slate-400 text-sm">No sourcing entries registered yet</div>
          ) : (
            <div className="space-y-3 mt-2">
              {oppSubs.map(s => (
                <motion.div key={s.id} layout
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-all">
                  {editingId === s.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Company Name *</label>
                          <input value={editForm.companyName} onChange={e => setEF('companyName', e.target.value)} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Contact Name</label>
                          <input value={editForm.contactName} onChange={e => setEF('contactName', e.target.value)} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                          <input value={editForm.email} onChange={e => setEF('email', e.target.value)} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                          <input value={editForm.phone} onChange={e => setEF('phone', e.target.value)} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Quote File</label>
                          <div className="flex gap-2">
                            <input value={editForm.quoteFile} onChange={e => setEF('quoteFile', e.target.value)} className="input-field flex-1" placeholder="filename.pdf" />
                            <button type="button" className="btn-secondary text-xs px-2" onClick={() => {
                              const name = prompt('Enter file name:')
                              if (name) setEF('quoteFile', name)
                            }}>
                              <FileText size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Comments</label>
                          <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3">
                            {editForm.comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
                            {editForm.comments.map(c => (
                              <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                  <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                                  <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                                </div>
                                <p className="text-xs text-slate-600">{c.text}</p>
                              </div>
                            ))}
                            <textarea value={editForm.newComment} onChange={e => setEF('newComment', e.target.value)} rows={3} className="input-field w-full resize-none" placeholder="Add a timestamped sourcing comment..." />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs">Cancel</button>
                        <button type="button" onClick={() => saveEdit(s.id)} className="btn-primary text-xs">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{s.companyName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.contactName} - {s.email} - {s.phone}</p>
                        {s.quoteFile && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <FileText size={10} className="text-slate-400" />
                            <span className="text-[10px] text-indigo-600 font-semibold">{s.quoteFile}</span>
                          </div>
                        )}
                        {parseSourcingComments(s.notes).length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {parseSourcingComments(s.notes).map(c => (
                              <div key={c.id} className="rounded-lg bg-white/80 px-3 py-2 border border-slate-100">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[10px] font-semibold text-slate-600">{c.author}</span>
                                  <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5">{c.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] mt-1.5 text-slate-400">Added by {s.createdBy} - {formatDateTime(s.createdAt)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(s)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => { deleteSubcontractor(s.id); toast.success('Sourcing entry removed') }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}
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
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quote File</label>
                <div className="flex gap-2">
                  <input value={form.quoteFile} onChange={e => setF('quoteFile', e.target.value)} className="input-field flex-1" placeholder="filename.pdf" />
                  <button type="button" className="btn-secondary text-xs px-2" onClick={() => {
                    const name = prompt('Enter file name:')
                    if (name) setF('quoteFile', name)
                  }}>
                    <FileText size={11} />
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Initial Comment</label>
                <textarea value={form.comment} onChange={e => setF('comment', e.target.value)} rows={4} className="input-field w-full resize-none" placeholder="Add the first sourcing comment..." />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setTab('list')} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary"><PlusCircle size={13} /> Add Sourcing</button>
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

  // Financial fields vary by contract type
  const isOTJ       = opp.type === 'OTJ'
  const isRecurring = opp.type === 'RECURRING'

  const [contractAmount, setContractAmount] = useState<string>(opp.contractAmount ? String(opp.contractAmount) : '')
  const [yearlyValue, setYearlyValue]       = useState<string>(opp.baseAmount ? String(opp.baseAmount) : '')
  const [monthlyValue, setMonthlyValue]     = useState<string>(opp.monthlyPayment ? String(opp.monthlyPayment) : '')
  const [monthlyOverridden, setMonthlyOverridden] = useState(false)

  const handleYearlyChange = (val: string) => {
    setYearlyValue(val)
    if (!monthlyOverridden) {
      const n = parseFloat(val)
      setMonthlyValue(isNaN(n) ? '' : String(Math.round(n / 12)))
    }
  }

  const addFile = () => { if (!newFile.trim()) return; setProposals(p => [...p, newFile.trim()]); setNewFile('') }

  const confirm = () => {
    const vals: { contractAmount?: number; baseAmount?: number; monthlyPayment?: number } = {}
    if (contractAmount) vals.contractAmount = parseFloat(contractAmount)
    if (yearlyValue)    vals.baseAmount     = parseFloat(yearlyValue)
    if (monthlyValue)   vals.monthlyPayment = parseFloat(monthlyValue)
    submitOpportunity(opp.id, vals)
    toast.success('Proposal submitted! Status updated.')
    onClose()
  }

  return (
    <ModalWrap onClose={onClose} title="Submit Proposal" subtitle={opp.solicitation} maxW="max-w-md">
      <div className="p-6 space-y-4">
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-500 mb-1.5">Opportunity details</p>
          <p className="text-sm font-semibold text-slate-800">{opp.solicitation}</p>
          <p className="text-xs text-slate-500 mt-0.5">{opp.solicitationId} - Due: {new Date(opp.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {opp.localTime && `at ${formatLocalDueTimeShared(opp.localTime, opp.timezone)}`}</p>
          <p className="text-xs text-indigo-600 font-semibold mt-1">{typeLabel(opp.type)}</p>
        </div>

        {/* Financial fields conditional on contract type */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Contract Value</p>

          {/* OTJ: only Total Contract Amount */}
          {isOTJ && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Contract Amount ($)</label>
              <input type="number" value={contractAmount} onChange={e => setContractAmount(e.target.value)} className="input-field" placeholder="0.00" />
            </div>
          )}

          {/* RECURRING: Yearly + Monthly (monthly auto-computes) */}
          {isRecurring && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Contract Amount ($)</label>
                <input type="number" value={contractAmount} onChange={e => setContractAmount(e.target.value)} className="input-field" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Yearly Value ($)</label>
                <input type="number" value={yearlyValue} onChange={e => handleYearlyChange(e.target.value)} className="input-field" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Monthly Value ($) <span className="text-slate-400 font-normal">(auto = yearly / 12)</span>
                </label>
                <input
                  type="number"
                  value={monthlyValue}
                  onChange={e => { setMonthlyOverridden(true); setMonthlyValue(e.target.value) }}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </>
          )}

          {/* BPA / IDIQ / S&D / SUPPLY: all three fields */}
          {!isOTJ && !isRecurring && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Contract Amount ($)</label>
                <input type="number" value={contractAmount} onChange={e => setContractAmount(e.target.value)} className="input-field" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Yearly Value ($)</label>
                <input type="number" value={yearlyValue} onChange={e => handleYearlyChange(e.target.value)} className="input-field" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Monthly Value ($) <span className="text-slate-400 font-normal">(auto = yearly / 12)</span>
                </label>
                <input
                  type="number"
                  value={monthlyValue}
                  onChange={e => { setMonthlyOverridden(true); setMonthlyValue(e.target.value) }}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </>
          )}
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
    client: '', location: '', dueDate: '', localTime: '', timezone: 'GMT+1',
    comments: [], proposals: [], subcontractors: [], assignedTo: undefined,
  })
  const allowedAssignees = useMemo(
    () => assignableEmployeesForUser(employees, currentUser).map(employee => employee.id),
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
      }))

      toast.success('Details imported from SAM.gov!')
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
          <div className="grid grid-cols-3 gap-4">
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
              <label className={lbl}>Local Time (HH:MM)</label>
              <input
                value={form.localTime ?? ''}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'localTime', e.target.value))}
                onBlur={e => {
                  const normalised = formatTime12h(e.target.value.trim())
                  if (normalised && normalised !== e.target.value) {
                    setForm(prev => applyScheduleFieldChange(prev, 'localTime', normalised))
                  }
                }}
                className="input-field"
                placeholder="5:00 PM"
              />
            </div>
            <div>
              <label className={lbl}>Timezone</label>
              <select
                value={form.timezone ?? 'GMT+1'}
                onChange={e => setForm(prev => applyScheduleFieldChange(prev, 'timezone', e.target.value))}
                className="select-field"
              >
                {TZ_ABBREVS.map(t => <option key={t}>{t}</option>)}
              </select>
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
              Select anyone in the hierarchy. The ⚠ badge appears when they already have a contract ending on the same due date.
              {!form.dueDate && <span className="text-amber-600 font-medium"> - Set a due date in the Schedule tab to enable conflict detection.</span>}
            </p>
          </div>
          <HierarchyAssignPicker
            value={form.assignedTo}
            onChange={v => set('assignedTo', v)}
            deadline={form.dueDate || undefined}
            allowedEmployeeIds={allowedAssignees}
          />
        </div>
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
}: {
  o: Opportunity
  canSubmit: boolean
  onViewDetails: () => void
  onEdit: () => void
  onSourcing: () => void
  onSubmit: () => void
  onRequestDeletion: () => void
  onCancel: () => void
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
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
              <Edit2 size={12} /> Edit
            </button>
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
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onCancel() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#DC2626' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
              <Ban size={12} /> Cancel
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onRequestDeletion() }}
              className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
              style={{ color: '#DC2626' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
              <Trash2 size={12} /> Request Deletion
            </button>
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
  { key: 'localTime',      label: 'Local Due Time', placeholder: 'Any local time' },
  { key: 'moroccoDueTime', label: 'Morocco Time', placeholder: 'Any Morocco time' },
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
      return `${o.localTime ?? ''} ${o.timezone ?? ''}`.trim()
    case 'moroccoDueTime':
      return formatMoroccoDisplay(o.localTime, o.timezone, o.dueDate, o.moroccoTime, o.moroccoDate)
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

export default function PipelinePage() {
  const { opportunities, employees, currentUser, moveOpportunityToBDTracker } = useStore()

  // ── Filter state ──
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => ({ ...EMPTY_COLUMN_FILTERS }))
  const [dueDateRange, setDueDateRange] = useState<Period | null>(null)

  // ── Modal state ──
  const [showCreate, setShowCreate]   = useState(false)
  const [editOpp, setEditOpp]         = useState<Opportunity | null>(null)
  const [sourcingOpp, setSourcingOpp] = useState<Opportunity | null>(null)
  const [submitOpp, setSubmitOpp]     = useState<Opportunity | null>(null)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)

  // ── Sort state ──
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'dueDate', dir: 'asc' })

  // ── Pagination state ──
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const canSubmit = ['BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE'].includes(currentUser?.role ?? '')
  const canManageOpportunities = currentUser?.role === 'BD_MANAGER'

  const filterOptions = useMemo(() => {
    const visibleOpps = opportunities.filter(o => !o.isDeleted && OPP_VIEW_STATUSES.includes(o.status as any) && isAssignedToAssociate(employees, o.assignedTo))
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
    let list = opportunities.filter(o => !o.isDeleted && OPP_VIEW_STATUSES.includes(o.status as any) && isAssignedToAssociate(employees, o.assignedTo))

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
    if (!canManageOpportunities) {
      toast.error('Only managers can cancel opportunities.')
      return
    }
    moveOpportunityToBDTracker(o.id, 'CANCELED', 'Canceled from Contract Opportunities')
    toast.success(`"${o.solicitation}" canceled.`)
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
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={14} /> New Opportunity
          </button>
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
                  { label: 'Due Date',    k: 'dueDate' },
                  { label: 'Local Due Time', k: 'localTime' },
                  { label: 'Morocco Time', k: '' },
                  { label: 'Location',    k: 'location' },
                  { label: 'Manager',     k: '' },
                  { label: 'Team Lead',   k: '' },
                  { label: 'Associate',   k: '' },
                  { label: 'Actions',     k: '' },
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
                    <td>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${dueDateColor(o.dueDate)}`}>
                        {new Date(o.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">
                      {formatLocalDueTimeShared(o.localTime, o.timezone)}
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">
                      <Clock size={9} className="inline mr-1 text-amber-300" />
                      {formatMoroccoDisplay(o.localTime, o.timezone, o.dueDate, o.moroccoTime, o.moroccoDate)}
                    </td>
                    <td><span className="text-slate-500 text-xs">{o.location}</span></td>
                    {(() => {
                      const chain = getAssignmentChain(employees, o.assignedTo)
                      return (
                        <>
                          <td><span className="text-slate-600 text-xs">{chain.manager?.name || '-'}</span></td>
                          <td><span className="text-slate-600 text-xs">{chain.teamLead?.name || '-'}</span></td>
                          <td>
                            {chain.associate ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-slate-700 font-medium whitespace-nowrap">{chain.associate.name}</span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
                                  style={{ color: ROLE_COLOR.ASSOCIATE.color, background: ROLE_COLOR.ASSOCIATE.bg, border: `1px solid ${ROLE_COLOR.ASSOCIATE.border}` }}>
                                  Associate
                                </span>
                              </div>
                            ) : <span className="text-slate-400 text-xs">-</span>}
                          </td>
                        </>
                      )
                    })()}
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button title="Edit" onClick={() => setEditOpp(o)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                          <Edit2 size={12} />
                        </button>
                        <button title="Sourcing" onClick={() => setSourcingOpp(o)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-all">
                          <Users2 size={12} />
                        </button>
                        {canSubmit && OPP_VIEW_STATUSES.includes(o.status as any) && (
                          <button title="Submit proposal" onClick={() => setSubmitOpp(o)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                            <Send size={12} />
                          </button>
                        )}
                        {canManageOpportunities && (
                          <button title="Cancel opportunity" onClick={() => handleCancel(o)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Ban size={12} />
                          </button>
                        )}
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
        width={980}
        placement="modal"
        showBackdrop
      >
        {selectedOpp && (
          <>
            <div className="flex gap-2 flex-wrap mb-5 rounded-2xl border border-slate-100 bg-white/5 p-3">
              <PriorityBadge p={selectedOpp.priority} />
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">{typeLabel(selectedOpp.type)}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DrawerSection title="Overview">
                <DrawerField label="Client"    value={selectedOpp.client} />
                <DrawerField label="Type"      value={typeLabel(selectedOpp.type)} />
                <DrawerField label="Set-Aside" value={selectedOpp.setAside} />
                <DrawerField label="NAICS"     value={selectedOpp.naicsCode} />
                <DrawerField label="Location"  value={selectedOpp.location} />
                <DrawerField label="Period"    value={selectedOpp.period} />
              </DrawerSection>

              <DrawerSection title="Team">
                {(() => {
                  const chain = getAssignmentChain(employees, selectedOpp.assignedTo)
                  return (
                    <>
                      <DrawerField label="Manager" value={chain.manager?.name || '-'} />
                      <DrawerField label="Team Lead" value={chain.teamLead?.name || '-'} />
                      <DrawerField label="Associate" value={chain.associate?.name || '-'} />
                    </>
                  )
                })()}
              </DrawerSection>

              <DrawerSection title="Schedule">
                <DrawerField label="Due Date"  value={new Date(selectedOpp.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
                <DrawerField label="Local Due Time" value={formatLocalDueTimeShared(selectedOpp.localTime, selectedOpp.timezone)} />
                {selectedOpp.localTime && (
                  <DrawerField label="Morocco (GMT+1)" value={
                    <span className="text-indigo-600 font-semibold">
                      {formatMoroccoDisplay(selectedOpp.localTime, selectedOpp.timezone, selectedOpp.dueDate, selectedOpp.moroccoTime, selectedOpp.moroccoDate)}
                    </span>
                  } />
                )}
                <DrawerField label="Captured On" value={selectedOpp.capturedOn} />
              </DrawerSection>

              <DrawerSection title="Financials">
                <DrawerField label="Contract Amount"  value={selectedOpp.contractAmount ? formatCurrency(selectedOpp.contractAmount) : '-'} />
                <DrawerField label="Base Amount"      value={selectedOpp.baseAmount ? formatCurrency(selectedOpp.baseAmount) : '-'} />
                <DrawerField label="Monthly Payment"  value={selectedOpp.monthlyPayment ? formatCurrency(selectedOpp.monthlyPayment) + '/mo' : '-'} />
              </DrawerSection>
            </div>

            {selectedOpp.mandatoryEvents && (
              <DrawerSection title="Mandatory Events">
                <p className="py-2.5 text-sm text-slate-600 leading-6">{selectedOpp.mandatoryEvents}</p>
              </DrawerSection>
            )}

            {selectedOpp.comments && selectedOpp.comments.length > 0 && (
              <DrawerSection title={`Comments (${selectedOpp.comments.length})`}>
                {selectedOpp.comments.map((c: Comment) => (
                  <div key={c.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-600">{c.text}</p>
                    <CommentAttachments attachments={c.attachments} />
                  </div>
                ))}
              </DrawerSection>
            )}

            {selectedOpp.subcontractors && selectedOpp.subcontractors.length > 0 && (
              <DrawerSection title={`Sourcing (${selectedOpp.subcontractors.length})`}>
                {selectedOpp.subcontractors.map(s => (
                  <div key={s.id} className="py-2.5 border-b border-slate-50 last:border-0">
                    <p className="text-sm font-semibold text-slate-800">{s.companyName}</p>
                    <p className="text-xs text-slate-500">{s.contactName}</p>
                    {s.quoteFile && (
                      <p className="text-[10px] text-indigo-600 mt-0.5 flex items-center gap-1">
                        <FileText size={9} /> {s.quoteFile}
                      </p>
                    )}
                  </div>
                ))}
              </DrawerSection>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setEditOpp(selectedOpp) }}>
                <Edit2 size={12} /> Edit
              </button>
              <button className="btn-secondary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSourcingOpp(selectedOpp) }}>
                <Users2 size={12} /> Sourcing
              </button>
              {canSubmit && OPP_VIEW_STATUSES.includes(selectedOpp.status as any) && (
                <button className="btn-primary text-xs gap-1.5" onClick={() => { setSelectedOpp(null); setSubmitOpp(selectedOpp) }}>
                  <Send size={12} /> Submit Proposal
                </button>
              )}
              {canManageOpportunities && (
                <button className="btn-secondary text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setSelectedOpp(null); handleCancel(selectedOpp) }}>
                  <Ban size={12} /> Cancel
                </button>
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
      </AnimatePresence>
    </div>
  )
}
