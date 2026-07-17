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

export function submittedLifecycleRows(submissions: BDSubmission[]): BDSubmission[] {
  const seen = new Set<number>()
  return submissions.filter(submission => {
    if (!isSubmittedLifecycleRow(submission) || seen.has(submission.id)) return false
    seen.add(submission.id)
    return true
  })
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
    if (opportunity.isDeleted || seen.has(opportunity.id)) return false
    seen.add(opportunity.id)
    return true
  })
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
  const trackerIds = new Set(trackerRows.map(row => row.id))
  const capturedCount = active.length + trackerIds.size
  const submitted = submittedLifecycleRows(trackerRows)
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
