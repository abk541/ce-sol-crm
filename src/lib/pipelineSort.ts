import type { Opportunity } from '../types'
import {
  isCompleteClockTime,
  opportunityDeadlineTimeMs,
  parseClockTime,
  utcToMoroccoClock,
} from './timezone'

type DueOpportunity = Pick<
  Opportunity,
  'id' | 'solicitationId' | 'dueDate' | 'localTime' | 'timezone' | 'moroccoDate' | 'moroccoTime'
>

interface MoroccoDeadlineParts {
  day: number
  time: number | null
}

function moroccoDayValue(date: string | undefined): number | null {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null
  const value = Date.UTC(year, month - 1, day)
  return Number.isFinite(value) ? value : null
}

function moroccoClockParts(
  date: string | undefined,
  time: string | undefined,
): MoroccoDeadlineParts | null {
  const day = moroccoDayValue(date)
  if (day === null || !isCompleteClockTime(time)) return null
  const { hour, minute } = parseClockTime(time)
  return {
    day,
    time: (hour * 60 * 60 * 1000) + (minute * 60 * 1000),
  }
}

function opportunityMoroccoDeadlineParts(
  opportunity: DueOpportunity,
): MoroccoDeadlineParts | null {
  const saved = moroccoClockParts(opportunity.moroccoDate, opportunity.moroccoTime)
  if (saved) return saved

  const absoluteDeadline = opportunityDeadlineTimeMs(opportunity)
  if (absoluteDeadline !== null) {
    const converted = utcToMoroccoClock(absoluteDeadline)
    return moroccoClockParts(converted.moroccoDate, converted.moroccoTime)
  }

  const day = moroccoDayValue(opportunity.moroccoDate || opportunity.dueDate)
  return day === null ? null : { day, time: null }
}

/**
 * Comparable deadline expressed on the Morocco calendar. Saved Morocco fields
 * win; older rows are converted from their source timezone. A dated record with
 * no usable time sorts after timed records on that same date.
 */
export function opportunityMoroccoDeadlineValue(opportunity: DueOpportunity): number | null {
  const parts = opportunityMoroccoDeadlineParts(opportunity)
  if (!parts) return null
  return parts.day + (parts.time ?? (24 * 60 * 60 * 1000 - 1))
}

export function compareOpportunityDeadlines(
  left: DueOpportunity,
  right: DueOpportunity,
  direction: 'asc' | 'desc' = 'asc',
): number {
  const leftDeadline = opportunityMoroccoDeadlineParts(left)
  const rightDeadline = opportunityMoroccoDeadlineParts(right)

  // Incomplete deadlines stay at the bottom in both directions.
  if (leftDeadline === null && rightDeadline !== null) return 1
  if (leftDeadline !== null && rightDeadline === null) return -1

  if (leftDeadline && rightDeadline) {
    const dayOrder = leftDeadline.day - rightDeadline.day
    if (dayOrder !== 0) return direction === 'asc' ? dayOrder : -dayOrder

    // A known Morocco time is more precise and stays before an unknown time
    // on the same date, even when the requested date order is descending.
    if (leftDeadline.time === null && rightDeadline.time !== null) return 1
    if (leftDeadline.time !== null && rightDeadline.time === null) return -1

    const timeOrder = (leftDeadline.time ?? 0) - (rightDeadline.time ?? 0)
    if (timeOrder !== 0) return direction === 'asc' ? timeOrder : -timeOrder
  }

  const solicitationOrder = (left.solicitationId || '').localeCompare(right.solicitationId || '')
  if (solicitationOrder !== 0) return solicitationOrder
  return left.id.localeCompare(right.id)
}
