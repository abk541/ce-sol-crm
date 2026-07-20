import type { BDSubmission, Contract, Employee, Opportunity, OppStatus } from '../types'
import { isAssignedToAssociate } from './team'

export const CONTRACT_OPPORTUNITY_STATUSES: OppStatus[] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

export const SUBMITTED_LIFECYCLE_STATUSES: BDSubmission['status'][] = [
  'SUBMITTED',
  'DISCUSSING',
  'AWARDED',
  'LOST',
]

const submittedStatusSet = new Set<BDSubmission['status']>(SUBMITTED_LIFECYCLE_STATUSES)

export function isSubmittedLifecycleRow(submission: BDSubmission): boolean {
  return submittedStatusSet.has(submission.status)
}

export function submissionBusinessKey(submission: BDSubmission): string {
  const solicitationId = submission.solicitationId.trim().toLowerCase()
  return solicitationId ? `solicitation:${solicitationId}` : `row:${submission.id}`
}

function submissionRecency(submission: BDSubmission): number {
  const timestamp = new Date(submission.submittedOn || submission.dueDate || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function uniqueBDSubmissionRows(submissions: BDSubmission[]): BDSubmission[] {
  const byOpportunity = new Map<string, BDSubmission>()
  for (const submission of submissions) {
    const key = submissionBusinessKey(submission)
    const current = byOpportunity.get(key)
    if (
      !current ||
      submissionRecency(submission) > submissionRecency(current) ||
      (submissionRecency(submission) === submissionRecency(current) && submission.id > current.id)
    ) {
      byOpportunity.set(key, submission)
    }
  }
  return [...byOpportunity.values()]
}

export function submittedLifecycleRows(submissions: BDSubmission[]): BDSubmission[] {
  return uniqueBDSubmissionRows(submissions).filter(isSubmittedLifecycleRow)
}

export function isContractOpportunityVisible(
  opportunity: Opportunity,
  employees: Employee[],
  requireAssociate: boolean,
): boolean {
  if (opportunity.isDeleted || opportunity.nonSubmissionReportId) return false
  if (!CONTRACT_OPPORTUNITY_STATUSES.includes(opportunity.status)) return false
  return requireAssociate
    ? isAssignedToAssociate(employees, opportunity.assignedTo)
    : !!opportunity.assignedTo
}

export function contractOpportunityRows(
  opportunities: Opportunity[],
  employees: Employee[],
  requireAssociate: boolean,
): Opportunity[] {
  return opportunities.filter(opportunity =>
    isContractOpportunityVisible(opportunity, employees, requireAssociate))
}

function uniqueOpportunities(opportunities: Opportunity[]): Opportunity[] {
  const seen = new Set<string>()
  return opportunities.filter(opportunity => {
    const solicitationId = opportunity.solicitationId.trim().toLowerCase()
    const key = solicitationId ? `solicitation:${solicitationId}` : `opportunity:${opportunity.id}`
    if (opportunity.isDeleted || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface DashboardMonthBucket {
  key: string
  month: string
}

export function dashboardMonthBuckets(
  period: { from: string; to: string } | null,
  fallbackCount = 6,
  maximumCount = 24,
): DashboardMonthBucket[] {
  const now = new Date()
  const fallback = () => Array.from({ length: fallbackCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - fallbackCount + index + 1, 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      month: date.toLocaleDateString('en-US', { month: 'short' }),
    }
  })

  if (!period?.from || !period.to) return fallback()
  const [fromYear, fromMonth] = period.from.split('-').map(Number)
  const [toYear, toMonth] = period.to.split('-').map(Number)
  if (!fromYear || !fromMonth || !toYear || !toMonth) return fallback()

  const start = new Date(fromYear, fromMonth - 1, 1)
  const end = new Date(toYear, toMonth - 1, 1)
  if (start > end) return fallback()

  const buckets: DashboardMonthBucket[] = []
  const cursor = new Date(start)
  while (cursor <= end && buckets.length < maximumCount) {
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      month: cursor.toLocaleDateString('en-US', {
        month: 'short',
        year: start.getFullYear() === end.getFullYear() ? undefined : '2-digit',
      }),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets.length ? buckets : fallback()
}

export function dashboardPercent(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export interface BdDashboardSummary {
  activeOpportunities: Opportunity[]
  capturedOpportunities: Opportunity[]
  capturedCount: number
  submittedOpportunities: BDSubmission[]
  awardedSubmissions: BDSubmission[]
  submittedValue: number
  captureRate: number
  winRate: number
}

export function calculateBdDashboardSummary({
  activeOpportunities,
  capturedOpportunities,
  trackerRows,
  valueForSubmission,
}: {
  activeOpportunities: Opportunity[]
  capturedOpportunities: Opportunity[]
  trackerRows: BDSubmission[]
  valueForSubmission: (submission: BDSubmission) => number
}): BdDashboardSummary {
  const active = uniqueOpportunities(activeOpportunities)
  const captured = uniqueOpportunities(capturedOpportunities)
  const uniqueTracker = uniqueBDSubmissionRows(trackerRows)
  const capturedKeys = new Set(captured.map(opportunity => {
    const solicitationId = opportunity.solicitationId.trim().toLowerCase()
    return solicitationId ? `solicitation:${solicitationId}` : `opportunity:${opportunity.id}`
  }))
  active.forEach(opportunity => {
    const solicitationId = opportunity.solicitationId.trim().toLowerCase()
    capturedKeys.add(solicitationId ? `solicitation:${solicitationId}` : `opportunity:${opportunity.id}`)
  })
  uniqueTracker.forEach(row => capturedKeys.add(submissionBusinessKey(row)))
  const capturedCount = capturedKeys.size
  const submitted = uniqueTracker.filter(isSubmittedLifecycleRow)
  const awarded = submitted.filter(submission => submission.status === 'AWARDED')

  return {
    activeOpportunities: active,
    capturedOpportunities: captured,
    capturedCount,
    submittedOpportunities: submitted,
    awardedSubmissions: awarded,
    submittedValue: submitted.reduce((sum, submission) => sum + valueForSubmission(submission), 0),
    captureRate: dashboardPercent(submitted.length, capturedCount),
    winRate: dashboardPercent(awarded.length, submitted.length),
  }
}

export function isActiveContractAdminRecord(contract: Contract): boolean {
  return !['ARCHIVED', 'TERMINATED'].includes(contract.status)
}

function firstNonZeroNumber(...values: Array<number | string | undefined | null>): number {
  for (const value of values) {
    const next = Number(value)
    if (Number.isFinite(next) && next !== 0) return next
  }
  return 0
}

export function dashboardContractValue(contract: Contract): number {
  return firstNonZeroNumber(contract.value, contract.baseAmount, contract.monthlyPayment)
}

export function dashboardContractGrossProfit(contract: Contract): number {
  const lockedSubkSpend = (contract.lockedSubcontractors || [])
    .reduce((sum, subcontractor) => sum + firstNonZeroNumber(subcontractor.paymentRate), 0)
  const baseYearLineTotal = (contract.lineItems || [])
    .filter(line => line.year === 'base')
    .reduce((sum, line) => sum + firstNonZeroNumber(line.amount, line.quantity * line.rate), 0)
  const baseYearTotal = baseYearLineTotal || firstNonZeroNumber(contract.baseAmount)
  const total = dashboardContractValue(contract)

  return contract.type === 'RECURRING'
    ? total - baseYearTotal - lockedSubkSpend
    : total - lockedSubkSpend
}
