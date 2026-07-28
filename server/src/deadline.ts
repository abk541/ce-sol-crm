const FIXED_TIMEZONE_OFFSETS: Readonly<Record<string, number>> = {
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
  AKST: -9 * 60,
  AKDT: -8 * 60,
  HST: -10 * 60,
  HADT: -9 * 60,
  KSA: 3 * 60,
  AST: 3 * 60,
  GST: 4 * 60,
  EET: 2 * 60,
  EEST: 3 * 60,
  IRT: (3 * 60) + 30,
  IRST: (3 * 60) + 30,
  CET: 60,
  CEST: 2 * 60,
  BST: 60,
  IST: (5 * 60) + 30,
  SGT: 8 * 60,
  JST: 9 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60,
  NZST: 12 * 60,
  NZDT: 13 * 60,
}

function fixedOffsetMinutes(label: string): number | null {
  const value = label.trim()
  const fixed = FIXED_TIMEZONE_OFFSETS[value.toUpperCase()]
  if (fixed !== undefined) return fixed

  const match = /^(?:UTC|GMT)([+-])(\d{2})(?::?(\d{2}))?$/i.exec(value)
  if (!match) return null
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '00')
  if (hours > 23 || minutes > 59) return null
  return (match[1] === '+' ? 1 : -1) * ((hours * 60) + minutes)
}

function clockParts(value: string): { hour: number; minute: number } | null {
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim())
  if (twelveHour) {
    let hour = Number(twelveHour[1])
    const minute = Number(twelveHour[2] ?? '00')
    const marker = twelveHour[3]!.toUpperCase()
    if (hour < 1 || hour > 12 || minute > 59) return null
    if (marker === 'PM' && hour < 12) hour += 12
    if (marker === 'AM' && hour === 12) hour = 0
    return { hour, minute }
  }

  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!twentyFourHour) return null
  const hour = Number(twentyFourHour[1])
  const minute = Number(twentyFourHour[2])
  return hour <= 23 && minute <= 59 ? { hour, minute } : null
}

function ianaOffsetMs(date: Date, timeZone: string): number | null {
  try {
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
    const value = (type: string) =>
      Number(parts.find(part => part.type === type)?.value ?? Number.NaN)
    const formattedHour = value('hour')
    const hour = formattedHour === 24 ? 0 : formattedHour
    const asUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      hour,
      value('minute'),
      value('second'),
    )
    return Number.isFinite(asUtc) ? asUtc - date.getTime() : null
  } catch {
    return null
  }
}

export function opportunityDeadlineTimeMs(input: {
  dueDate: unknown
  localTime: unknown
  timezone: unknown
}): number | null {
  if (typeof input.dueDate !== 'string' || typeof input.localTime !== 'string') return null
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.dueDate.trim())
  const clock = clockParts(input.localTime)
  if (!dateMatch || !clock) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const utcGuessMs = Date.UTC(year, month - 1, day, clock.hour, clock.minute, 0)
  const utcGuess = new Date(utcGuessMs)
  if (
    utcGuess.getUTCFullYear() !== year
    || utcGuess.getUTCMonth() !== month - 1
    || utcGuess.getUTCDate() !== day
  ) return null

  const timezone = typeof input.timezone === 'string' && input.timezone.trim()
    ? input.timezone.trim()
    : 'GMT+1'
  const fixedOffset = fixedOffsetMinutes(timezone)
  if (fixedOffset !== null) return utcGuessMs - (fixedOffset * 60_000)

  const ianaOffset = ianaOffsetMs(utcGuess, timezone)
  return ianaOffset === null ? null : utcGuessMs - ianaOffset
}
