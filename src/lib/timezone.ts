import { TIMEZONES } from '../data/mock'

const MOROCCO_GMT_PLUS_ONE_MS = 60 * 60 * 1000
const FIXED_TIMEZONE_OFFSETS: Record<string, number> = {
  GMT: 0,
  UTC: 0,
  'GMT+1': 60,
  EST: -5 * 60,
  EDT: -4 * 60,
  CST: -6 * 60,
  CDT: -5 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  PST: -8 * 60,
  PDT: -7 * 60,
  HST: -10 * 60,
  AST: 3 * 60,
  EET: 2 * 60,
  IRT: (3 * 60) + 30,
  CET: 60,
}

const OFFSET_TIMEZONE_CANDIDATES: Record<string, string[]> = {
  '-10:00': ['Pacific/Honolulu'],
  '-09:00': ['America/Anchorage', 'Pacific/Gambier'],
  '-08:00': ['America/Los_Angeles', 'America/Vancouver', 'Pacific/Pitcairn'],
  '-07:00': ['America/Denver', 'America/Phoenix', 'America/Edmonton'],
  '-06:00': ['America/Chicago', 'America/Regina', 'America/Mexico_City'],
  '-05:00': ['America/New_York', 'America/Chicago', 'America/Bogota', 'America/Lima'],
  '-04:00': ['America/New_York', 'America/Puerto_Rico', 'America/Halifax'],
  '-03:00': ['America/Sao_Paulo', 'America/Argentina/Buenos_Aires'],
  '-02:00': ['Atlantic/South_Georgia'],
  '-01:00': ['Atlantic/Azores', 'Atlantic/Cape_Verde'],
  '+00:00': ['Europe/London', 'UTC', 'Atlantic/Reykjavik'],
  '+01:00': ['Africa/Casablanca', 'Europe/Paris', 'Europe/London'],
  '+02:00': ['Europe/Athens', 'Africa/Cairo', 'Asia/Amman'],
  '+03:00': ['Asia/Riyadh', 'Europe/Moscow', 'Africa/Nairobi'],
  '+03:30': ['Asia/Tehran'],
  '+04:00': ['Asia/Dubai'],
  '+04:30': ['Asia/Kabul'],
  '+05:00': ['Asia/Karachi'],
  '+05:30': ['Asia/Kolkata'],
  '+05:45': ['Asia/Kathmandu'],
  '+06:00': ['Asia/Dhaka'],
  '+06:30': ['Asia/Yangon'],
  '+07:00': ['Asia/Bangkok'],
  '+08:00': ['Asia/Singapore', 'Asia/Shanghai'],
  '+08:45': ['Australia/Eucla'],
  '+09:00': ['Asia/Tokyo', 'Asia/Seoul'],
  '+09:30': ['Australia/Darwin', 'Australia/Adelaide'],
  '+10:00': ['Australia/Sydney', 'Pacific/Guam'],
  '+10:30': ['Australia/Lord_Howe'],
  '+11:00': ['Pacific/Noumea'],
  '+12:00': ['Pacific/Auckland', 'Pacific/Fiji'],
  '+12:45': ['Pacific/Chatham'],
  '+13:00': ['Pacific/Tongatapu'],
  '+14:00': ['Pacific/Kiritimati'],
}

export function normalizeUtcOffset(offset: string | undefined): string {
  const raw = (offset ?? '').trim()
  if (!raw) return ''
  if (raw === 'Z') return '+00:00'
  if (/^[+-]\d{4}$/.test(raw)) return `${raw.slice(0, 3)}:${raw.slice(3)}`
  if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw
  return raw
}

export function timezoneLabelFromOffset(offset: string): string {
  const normalised = normalizeUtcOffset(offset)
  if (!normalised) return ''
  return normalised === '+00:00' ? 'GMT' : `UTC${normalised}`
}

export function isValidIanaTimeZone(timeZone: string | undefined): boolean {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function resolveIanaTimeZone(timeZoneLabel: string | undefined): string | undefined {
  const value = (timeZoneLabel ?? '').trim()
  if (!value) return undefined
  if (TIMEZONES[value]) return TIMEZONES[value]
  if (isValidIanaTimeZone(value)) return value
  return undefined
}

export function fixedOffsetMinutes(label: string | undefined): number | null {
  const value = (label ?? '').trim()
  if (!value) return null
  const fixed = FIXED_TIMEZONE_OFFSETS[value.toUpperCase()]
  if (fixed !== undefined) return fixed

  const match = value.match(/^(?:UTC|GMT)([+-])(\d{2})(?::?(\d{2}))?$/i)
  if (!match) return null

  const sign = match[1] === '+' ? 1 : -1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '00')
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return sign * ((hours * 60) + minutes)
}

export function parseClockTime(time: string | undefined) {
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

export function isCompleteClockTime(time: string | undefined): boolean {
  if (!time?.trim()) return false
  const value = time.trim()
  return /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.test(value) || /^\d{1,2}:\d{2}$/.test(value)
}

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
  const hour = value('hour') === 24 ? 0 : value('hour')
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), hour, value('minute'), value('second'))
  return asUtc - date.getTime()
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    return Math.round(timeZoneOffsetMs(date, timeZone) / 60_000)
  } catch {
    return null
  }
}

export function ianaTimeZoneFromOffset(offset: string, referenceDate = new Date()): string {
  const normalised = normalizeUtcOffset(offset)
  if (!normalised) return ''

  const targetMinutes = fixedOffsetMinutes(timezoneLabelFromOffset(normalised))
  const candidates = OFFSET_TIMEZONE_CANDIDATES[normalised] ?? []
  if (targetMinutes !== null) {
    const matchingCandidate = candidates.find(zone => timeZoneOffsetMinutes(referenceDate, zone) === targetMinutes)
    if (matchingCandidate) return matchingCandidate

    const supported = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined
    const matchingSupported = supported?.find(zone => timeZoneOffsetMinutes(referenceDate, zone) === targetMinutes)
    if (matchingSupported) return matchingSupported
  }

  return candidates[0] || timezoneLabelFromOffset(normalised)
}

export function zonedDateTimeToUtc(date: string, time: string, timeZoneLabel: string | undefined): Date | null {
  if (!date || !isCompleteClockTime(time)) return null

  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null

  const { hour, minute } = parseClockTime(time)
  const utcGuessMs = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0)
  const offsetMinutes = fixedOffsetMinutes(timeZoneLabel)

  if (offsetMinutes !== null) {
    return new Date(utcGuessMs - offsetMinutes * 60_000)
  }

  const ianaSource = resolveIanaTimeZone(timeZoneLabel)
  if (!ianaSource) return null

  const utcGuess = new Date(utcGuessMs)
  const offset = timeZoneOffsetMs(utcGuess, ianaSource)
  return new Date(utcGuess.getTime() - offset)
}

export function utcToZonedClock(utc: Date, timeZone: string): { date: string; time24: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(utc)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const h = get('hour') === '24' ? '00' : get('hour')
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time24: `${h}:${get('minute')}`,
  }
}

export function utcToMoroccoClock(utcMs: number): { moroccoDate: string; moroccoTime: string } {
  const d = new Date(utcMs + MOROCCO_GMT_PLUS_ONE_MS)
  return {
    moroccoDate: d.toISOString().slice(0, 10),
    moroccoTime: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  }
}

export function opportunityDeadlineTimeMs(input: {
  dueDate?: string
  localTime?: string
  timezone?: string
}): number | null {
  const utc = zonedDateTimeToUtc(input.dueDate ?? '', input.localTime ?? '', input.timezone || 'GMT+1')
  return utc && Number.isFinite(utc.getTime()) ? utc.getTime() : null
}

export function formatLocalDueTime(time: string | undefined, sourceTzAbbrev?: string): string {
  if (!time) return '-'
  return `${formatTime12h(time)} ${sourceTzAbbrev ?? ''}`.trim()
}

export function formatMoroccoDueTime(input: {
  localTime?: string
  timezone?: string
  dueDate?: string
  moroccoTime?: string
  moroccoDate?: string
}): string {
  if (!isCompleteClockTime(input.localTime)) return 'Enter a complete local time'

  let moroccoTime = input.moroccoTime
  let moroccoDate = input.moroccoDate

  if (!moroccoTime || !moroccoDate) {
    const utcMs = opportunityDeadlineTimeMs(input)
    if (utcMs === null) return `${formatLocalDueTime(input.localTime, input.timezone)}`
    const converted = utcToMoroccoClock(utcMs)
    moroccoTime = formatTime12h(converted.moroccoTime)
    moroccoDate = converted.moroccoDate
  }

  const crossesMidnight = moroccoDate && input.dueDate && moroccoDate !== input.dueDate
  const dateSuffix = crossesMidnight
    ? ` (${new Date(moroccoDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
    : ''

  return `${formatTime12h(moroccoTime)}${dateSuffix} GMT+1`
}
