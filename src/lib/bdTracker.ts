import type { BDSubmission, Employee, Opportunity } from '../types'
import { isSubmittedLifecycleRow } from './dashboardMetrics'
import { findBDSubmissionOpportunity, getBDSubmissionAssignmentChain } from './team'
import { opportunityDeadlineTimeMs } from './timezone'

export interface BDTrackerAssociateOutcome {
  key: string
  name: string
  submitted: number
  nonSubmitted: number
  dropped: number
  total: number
}

export type ParsedBDTrackerAmount =
  | { valid: true; value: number | null }
  | { valid: false }

/** Blank optional amounts clear the stored value; the required total clears to zero. */
export function parseBDTrackerAmount(raw: string, required = false): ParsedBDTrackerAmount {
  if (!raw.trim()) return { valid: true, value: required ? 0 : null }
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0
    ? { valid: true, value }
    : { valid: false }
}

export function bdTrackerAssociateOutcomes(
  submissions: readonly BDSubmission[],
  opportunities: Opportunity[],
  employees: Employee[],
): BDTrackerAssociateOutcome[] {
  const counts = new Map<string, BDTrackerAssociateOutcome>()

  for (const submission of submissions) {
    const chain = getBDSubmissionAssignmentChain(employees, submission, opportunities)
    const name = chain.associate?.name || submission.supportAgent || 'Unassigned'
    const key = chain.associate?.id
      ? `employee:${chain.associate.id}`
      : `name:${name.trim().toLowerCase()}`
    const current = counts.get(key) ?? {
      key,
      name,
      submitted: 0,
      nonSubmitted: 0,
      dropped: 0,
      total: 0,
    }

    if (submission.status === 'NOT_SUBMITTED') current.nonSubmitted += 1
    else if (submission.status === 'DROPPED') current.dropped += 1
    else if (isSubmittedLifecycleRow(submission)) current.submitted += 1
    else continue

    current.total += 1
    counts.set(key, current)
  }

  return [...counts.values()]
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
}

function dueDateOrder(value: string | undefined): number | null {
  const match = (value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const order = Date.UTC(year, month - 1, day)
  const date = new Date(order)
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? order
    : null
}

function legacyTrackerDeadlineTimeMs(submission: BDSubmission, dueDate: string): number | null {
  const value = (submission.localTime ?? '').trim()
  const match = value.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\d{1,2}:\d{2})(?:\s+(.+))?$/i)
  if (!match) return null
  return opportunityDeadlineTimeMs({
    dueDate,
    localTime: match[1],
    timezone: match[2] || 'GMT+1',
  })
}

function submissionDeadlineSortKey(
  submission: BDSubmission,
  opportunities: Opportunity[],
): { dueDate: number | null; dueTime: number | null } {
  const opportunity = findBDSubmissionOpportunity(submission, opportunities)
  const dueDate = opportunity?.dueDate || submission.dueDate
  const linkedDueTime = opportunity
    ? opportunityDeadlineTimeMs({
      dueDate,
      localTime: opportunity.localTime,
      timezone: opportunity.timezone,
    })
    : null

  return {
    dueDate: dueDateOrder(dueDate),
    dueTime: linkedDueTime ?? legacyTrackerDeadlineTimeMs(submission, dueDate),
  }
}

export function sortBDSubmissionsByDueDateTime(
  submissions: readonly BDSubmission[],
  opportunities: Opportunity[],
): BDSubmission[] {
  const keys = new Map<BDSubmission, ReturnType<typeof submissionDeadlineSortKey>>()
  const keyFor = (submission: BDSubmission) => {
    const existing = keys.get(submission)
    if (existing) return existing
    const created = submissionDeadlineSortKey(submission, opportunities)
    keys.set(submission, created)
    return created
  }

  return [...submissions].sort((left, right) => {
    const leftKey = keyFor(left)
    const rightKey = keyFor(right)

    if (leftKey.dueDate === null && rightKey.dueDate !== null) return 1
    if (leftKey.dueDate !== null && rightKey.dueDate === null) return -1
    if (leftKey.dueDate !== rightKey.dueDate) {
      return (leftKey.dueDate ?? 0) - (rightKey.dueDate ?? 0)
    }

    if (leftKey.dueTime === null && rightKey.dueTime !== null) return 1
    if (leftKey.dueTime !== null && rightKey.dueTime === null) return -1
    if (leftKey.dueTime !== rightKey.dueTime) {
      return (leftKey.dueTime ?? 0) - (rightKey.dueTime ?? 0)
    }

    return left.solicitationId.localeCompare(right.solicitationId)
      || left.solicitation.localeCompare(right.solicitation)
      || left.id - right.id
  })
}
