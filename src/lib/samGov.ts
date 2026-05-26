import type { Opportunity } from '../types'
import { TIMEZONES } from '../data/mock'
import {
  formatTime12h,
  ianaTimeZoneFromOffset,
  isValidIanaTimeZone,
  normalizeUtcOffset,
  utcToMoroccoClock,
} from './timezone'

const SAM_TIMEZONE_ALIASES: Record<string, string> = {
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  HST: 'Pacific/Honolulu',
  GMT: 'Europe/London',
  UTC: 'UTC',
  'EASTERN STANDARD TIME': 'America/New_York',
  'EASTERN DAYLIGHT TIME': 'America/New_York',
  'CENTRAL STANDARD TIME': 'America/Chicago',
  'CENTRAL DAYLIGHT TIME': 'America/Chicago',
  'MOUNTAIN STANDARD TIME': 'America/Denver',
  'MOUNTAIN DAYLIGHT TIME': 'America/Denver',
  'PACIFIC STANDARD TIME': 'America/Los_Angeles',
  'PACIFIC DAYLIGHT TIME': 'America/Los_Angeles',
  'HAWAII STANDARD TIME': 'Pacific/Honolulu',
  'GREENWICH MEAN TIME': 'Europe/London',
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

function normaliseSamGovTimezone(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (!raw) return ''

  const upper = raw.toUpperCase()
  if (SAM_TIMEZONE_ALIASES[upper]) return SAM_TIMEZONE_ALIASES[upper]
  if (isValidIanaTimeZone(raw)) return raw
  if (raw === 'GMT+1' || raw === 'UTC+01:00' || raw === '+01:00') return 'Africa/Casablanca'
  if (TIMEZONES[upper]) return TIMEZONES[upper]
  if (TIMEZONES[raw]) return TIMEZONES[raw]
  if (/^(?:UTC|GMT)?[+-]\d{2}:?\d{2}$/i.test(raw)) {
    return ianaTimeZoneFromOffset(normalizeUtcOffset(raw.replace(/^(?:UTC|GMT)/i, '')))
  }
  return ''
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
  const empty = { dueDate: '', localTime: '', timezone: 'Africa/Casablanca', moroccoDate: '', moroccoTime: '' }
  if (!raw) return empty

  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/)
  if (m) {
    const dateStr = m[1]
    const timeStr = m[2]
    const rawOff = m[3] ?? ''

    if (rawOff) {
      const normalised = normalizeUtcOffset(rawOff)
      const { moroccoDate, moroccoTime } = utcToMoroccoClock(new Date(raw).getTime())
      return {
        dueDate: dateStr,
        localTime: formatTime12h(timeStr),
        timezone: specifiedTimezone || ianaTimeZoneFromOffset(normalised, new Date(raw)),
        moroccoDate,
        moroccoTime: formatTime12h(moroccoTime),
      }
    }

    return {
      dueDate: dateStr,
      localTime: formatTime12h(timeStr),
      timezone: 'Africa/Casablanca',
      moroccoDate: dateStr,
      moroccoTime: formatTime12h(timeStr),
    }
  }

  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) return empty
  const utcDate = parsed.toISOString().slice(0, 10)
  const utcTime = `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`
  const { moroccoDate, moroccoTime } = utcToMoroccoClock(parsed.getTime())
  return {
    dueDate: utcDate,
    localTime: formatTime12h(utcTime),
    timezone: 'UTC',
    moroccoDate,
    moroccoTime: formatTime12h(moroccoTime),
  }
}

export function extractSamGovAgency(opp: any): string {
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const pathParts: string[] = typeof opp?.fullParentPathName === 'string'
    ? opp.fullParentPathName.split('.').map((p: string) => p.trim()).filter(Boolean)
    : []

  const subTier =
    trim(opp?.subTier) ||
    trim(opp?.subTier?.name) ||
    trim(opp?.subtierName) ||
    (pathParts.length >= 2 ? pathParts[1] : '')
  if (subTier) return subTier

  const department =
    trim(opp?.department) ||
    trim(opp?.department?.name) ||
    trim(opp?.departmentName) ||
    (pathParts.length >= 1 ? pathParts[0] : '')
  if (department) return department

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
