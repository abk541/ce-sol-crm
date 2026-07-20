import type { Opportunity, SamGovContact } from '../types'
import { TIMEZONES } from '../data/mock'
import { isSupabaseConnected, supabase } from './supabase'
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

const SAM_GOV_FUNCTION = 'sam-gov-import'

export interface SamGovOpportunityReference {
  noticeId?: string
  solicitationNumber?: string
}

function invalidSamGovUrl(): never {
  throw new Error('Could not parse the SAM.gov URL. Paste the full URL from the opportunity page.')
}

/** Parses only identifiers. The browser never constructs or receives the API URL or secret. */
export function parseSamGovOpportunityReference(url: string): SamGovOpportunityReference {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) invalidSamGovUrl()

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    invalidSamGovUrl()
  }

  const host = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || (host !== 'sam.gov' && !host.endsWith('.sam.gov'))) {
    invalidSamGovUrl()
  }

  const noticeId = parsed.pathname.match(/\/opp\/([a-f0-9]{32})(?:\/|$)/i)?.[1]
  if (noticeId) return { noticeId: noticeId.toLowerCase() }

  const pathSegments = parsed.pathname.split('/').filter(Boolean)
  const finalSegment = pathSegments[pathSegments.length - 1]
  const lastSegment = finalSegment?.toLowerCase() === 'view'
    ? pathSegments[pathSegments.length - 2]
    : finalSegment
  const solicitationNumber = (parsed.searchParams.get('q') ?? lastSegment ?? '').trim()
  if (
    solicitationNumber.length < 3 ||
    solicitationNumber.length > 128 ||
    !/\d/.test(solicitationNumber) ||
    /[\u0000-\u001f\u007f]/.test(solicitationNumber)
  ) {
    invalidSamGovUrl()
  }

  return { solicitationNumber }
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (typeof Response !== 'undefined' && context instanceof Response) {
    try {
      const payload = await context.clone().json() as {
        error?: { message?: unknown }
        message?: unknown
      }
      const message = payload.error?.message ?? payload.message
      if (typeof message === 'string' && message.trim()) return message.trim()
    } catch {
      // Fall back to the SDK's generic error below.
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message
  return 'The SAM.gov integration request failed.'
}

async function invokeSamGovFunction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isSupabaseConnected || !supabase) {
    throw new Error('Supabase is not connected. Sign in to use the SAM.gov integration.')
  }

  const { data, error } = await supabase.functions.invoke(SAM_GOV_FUNCTION, { body })
  if (error) throw new Error(await functionErrorMessage(error))
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The SAM.gov integration returned an invalid response.')
  }
  return data as Record<string, unknown>
}

/** Returns only whether the server secret exists; the secret never reaches the browser. */
export async function getSamGovImportStatus(): Promise<boolean> {
  const data = await invokeSamGovFunction({ action: 'status' })
  return data.configured === true
}

/** Fetches one opportunity through the authenticated server-side proxy. */
export async function importSamGovOpportunity(url: string): Promise<Record<string, any>> {
  const trimmedUrl = url.trim()
  parseSamGovOpportunityReference(trimmedUrl)

  const data = await invokeSamGovFunction({ action: 'import', url: trimmedUrl })
  const opportunity = data.opportunity
  if (!opportunity || typeof opportunity !== 'object' || Array.isArray(opportunity)) {
    throw new Error('Opportunity not found on SAM.gov. Check the URL.')
  }

  return opportunity as Record<string, any>
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

export function extractSamGovContacts(opp: any): SamGovContact[] {
  const raw = opp?.pointOfContact
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const out: SamGovContact[] = []

  if (Array.isArray(raw)) {
    raw.forEach((c: any, idx: number) => {
      if (!c || typeof c !== 'object') return
      const fullName = trim(c.fullName) || trim(c.name)
      const email = trim(c.email)
      const phone = trim(c.phone)
      const fax = trim(c.fax)
      const title = trim(c.title)
      const type = trim(c.type)
      const additionalInfo = trim(c.additionalInfo?.content) || trim(c.additionalInfo)
      if (!(fullName || email || phone || fax || title || additionalInfo)) return
      out.push({
        id: `sgc-${idx}-${(fullName || email || phone || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
        kind: 'POC',
        type: type || undefined,
        title: title || undefined,
        fullName: fullName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        fax: fax || undefined,
        additionalInfo: additionalInfo || undefined,
      })
    })
  }

  const contractingOffice = extractSamGovContractingOfficeContact(opp)
  if (contractingOffice) out.push(contractingOffice)

  return out
}

function formatSamGovAddress(address: any): string {
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  if (!address) return ''
  if (typeof address === 'string') return trim(address)
  const city = trim(address.city?.name) || trim(address.city)
  const state = trim(address.state?.code) || trim(address.state?.name) || trim(address.state)
  const country = trim(address.country?.code) || trim(address.country?.name) || trim(address.countryCode)
  const lineParts = [
    trim(address.streetAddress),
    trim(address.streetAddress2),
    trim(address.line1),
    trim(address.line2),
    [city, state, trim(address.zip) || trim(address.zipcode) || trim(address.postalCode)].filter(Boolean).join(', '),
    country,
  ].filter(Boolean)
  return lineParts.join(' - ')
}

function extractSamGovContractingOfficeContact(opp: any): SamGovContact | null {
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const officeAddress =
    opp?.officeAddress ??
    opp?.contractingOfficeAddress ??
    opp?.organizationAddress ??
    opp?.office?.address
  const officeName =
    trim(opp?.officeName) ||
    trim(opp?.contractingOfficeName) ||
    trim(opp?.contractingOffice) ||
    trim(opp?.office?.name) ||
    trim(opp?.organizationName)
  const email =
    trim(opp?.contractingOfficeEmail) ||
    trim(opp?.officeEmail) ||
    trim(opp?.office?.email)
  const phone =
    trim(opp?.contractingOfficePhone) ||
    trim(opp?.officePhone) ||
    trim(opp?.office?.phone)
  const address = formatSamGovAddress(officeAddress)

  if (!(officeName || email || phone || address)) return null
  return {
    id: `sgc-office-${(officeName || email || phone || 'contracting-office').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
    kind: 'CONTRACTING_OFFICE',
    type: 'Contracting Office',
    title: 'Contracting Office',
    fullName: officeName || 'Contracting Office',
    email: email || undefined,
    phone: phone || undefined,
    additionalInfo: address || undefined,
  }
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
    samGovContacts: extractSamGovContacts(opp),
  }
}
