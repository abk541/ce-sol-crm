import { apiRequest, envelopeData } from './api'
import { dbToBDSubmission, dbToNonSubReport, dbToOpp } from './db'
import type {
  BDSubmission,
  FileAttachment,
  MandatoryEvent,
  NonSubmissionReport,
  Opportunity,
} from '../types'

export interface OpportunityWorkflowResult {
  opportunity: Partial<Opportunity> | null
  submission: BDSubmission
}

export interface OpportunityReturnWorkflowResult {
  opportunity: Partial<Opportunity> | null
  submission: BDSubmission | null
}

export interface PendingNonSubmissionWorkflowResult {
  opportunity: Partial<Opportunity>
  report: NonSubmissionReport
}

type SubmitValues = {
  contractAmount?: number
  baseAmount?: number
  monthlyPayment?: number
  proposals?: string[]
  assignedOpportunities?: string[]
  proposalAttachments?: FileAttachment[]
}

type TrackerEditValues = Partial<Pick<BDSubmission,
  | 'submittedOn'
  | 'solicitationId'
  | 'setAside'
  | 'type'
  | 'solicitation'
  | 'dueDate'
  | 'localTime'
  | 'location'
  | 'bdm'
  | 'bds'
  | 'supportAgent'
  | 'value'
  | 'comment'
>>

export type OpportunityWorkflowEditValues = Partial<Pick<Opportunity,
  | 'solicitation'
  | 'client'
  | 'type'
  | 'setAside'
  | 'naicsCode'
  | 'dueDate'
  | 'localTime'
  | 'timezone'
  | 'location'
  | 'contractAmount'
  | 'value'
  | 'mandatoryEvents'
  | 'proposalAttachments'
  | 'proposals'
  | 'bdm'
  | 'bds'
  | 'supportAgent'
>> & {
  assignedTo?: string | null
  mandatoryEventsList?: MandatoryEvent[]
  baseAmount?: number | null
  monthlyPayment?: number | null
}

type RawWorkflowResult = {
  opportunity: Record<string, unknown> | null
  submission: Record<string, unknown> | null
  report?: Record<string, unknown> | null
}

async function requestWorkflow(body: Record<string, unknown>): Promise<RawWorkflowResult | null> {
  try {
    const response = await apiRequest<{ data: RawWorkflowResult }>(
      '/opportunity-workflows',
      { method: 'POST', body: JSON.stringify(body) },
    )
    return envelopeData<RawWorkflowResult>(response)
  } catch (error) {
    console.error('[workflow] opportunity workflow failed', error)
    return null
  }
}

async function runWorkflow(body: Record<string, unknown>): Promise<OpportunityWorkflowResult | null> {
  const result = await requestWorkflow(body)
  if (!result?.submission) {
    if (result) console.error('[workflow] expected a BD Tracker row in the workflow response')
    return null
  }
  return {
    opportunity: result.opportunity ? dbToOpp(result.opportunity) : null,
    submission: dbToBDSubmission(result.submission),
  }
}

export function submitOpportunityWorkflow(
  opportunityId: string,
  expectedOpportunityStatus: Opportunity['status'],
  values: SubmitValues = {},
  expectedSubmissionStatus?: BDSubmission['status'],
): Promise<OpportunityWorkflowResult | null> {
  return runWorkflow({
    action: 'submit',
    opportunityId,
    expectedOpportunityStatus,
    ...(expectedSubmissionStatus ? { expectedSubmissionStatus } : {}),
    values,
  })
}

export function transitionOpportunityWorkflow(input: {
  opportunityId?: string
  submissionId?: number
  status: BDSubmission['status']
  expectedOpportunityStatus?: Opportunity['status']
  expectedSubmissionStatus?: BDSubmission['status']
  comment?: string | null
  nonSubmissionReportId?: string
  reviewNote?: string
}): Promise<OpportunityWorkflowResult | null> {
  return runWorkflow({
    action: 'transition',
    ...(input.opportunityId ? { opportunityId: input.opportunityId } : { submissionId: input.submissionId }),
    status: input.status,
    ...(input.expectedOpportunityStatus ? { expectedOpportunityStatus: input.expectedOpportunityStatus } : {}),
    ...(input.expectedSubmissionStatus ? { expectedSubmissionStatus: input.expectedSubmissionStatus } : {}),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.nonSubmissionReportId ? { nonSubmissionReportId: input.nonSubmissionReportId } : {}),
    ...(input.reviewNote ? { reviewNote: input.reviewNote } : {}),
  })
}

export function editOpportunityWorkflow(input: {
  opportunityId?: string
  submissionId?: number
  expectedOpportunityStatus?: Opportunity['status']
  expectedSubmissionStatus?: BDSubmission['status']
  values: TrackerEditValues
  opportunityValues?: OpportunityWorkflowEditValues
}): Promise<OpportunityWorkflowResult | null> {
  return runWorkflow({
    action: 'edit',
    ...(input.opportunityId ? { opportunityId: input.opportunityId } : { submissionId: input.submissionId }),
    ...(input.expectedOpportunityStatus ? { expectedOpportunityStatus: input.expectedOpportunityStatus } : {}),
    ...(input.expectedSubmissionStatus ? { expectedSubmissionStatus: input.expectedSubmissionStatus } : {}),
    values: input.values,
    ...(input.opportunityValues ? { opportunityValues: input.opportunityValues } : {}),
  })
}

export function deleteOpportunityWorkflow(input: {
  submissionId: number
  expectedOpportunityStatus?: Opportunity['status']
  expectedSubmissionStatus: BDSubmission['status']
}): Promise<OpportunityWorkflowResult | null> {
  return runWorkflow({
    action: 'delete',
    submissionId: input.submissionId,
    ...(input.expectedOpportunityStatus ? { expectedOpportunityStatus: input.expectedOpportunityStatus } : {}),
    expectedSubmissionStatus: input.expectedSubmissionStatus,
  })
}

type ReturnWorkflowCommon = {
  expectedOpportunityStatus: Opportunity['status']
  targetOpportunityStatus: 'ACTIVE' | 'NEW_ASSIGNMENT'
  nonSubmissionExempt?: boolean
}

export type ReturnOpportunityToPipelineInput = ReturnWorkflowCommon & (
  | {
      submissionId: number
      expectedSubmissionStatus: BDSubmission['status']
      nonSubmissionReportId?: string
      opportunityId?: never
    }
  | {
      opportunityId: string
      nonSubmissionReportId: string
      submissionId?: never
      expectedSubmissionStatus?: never
    }
)

export async function returnOpportunityToPipelineWorkflow(
  input: ReturnOpportunityToPipelineInput,
): Promise<OpportunityReturnWorkflowResult | null> {
  const result = await requestWorkflow({
    action: 'return',
    ...(input.submissionId !== undefined
      ? { submissionId: input.submissionId }
      : { opportunityId: input.opportunityId }),
    expectedOpportunityStatus: input.expectedOpportunityStatus,
    ...(input.expectedSubmissionStatus !== undefined
      ? { expectedSubmissionStatus: input.expectedSubmissionStatus }
      : {}),
    targetOpportunityStatus: input.targetOpportunityStatus,
    ...(input.nonSubmissionReportId ? { nonSubmissionReportId: input.nonSubmissionReportId } : {}),
    ...(input.nonSubmissionExempt !== undefined ? { nonSubmissionExempt: input.nonSubmissionExempt } : {}),
  })
  if (!result?.opportunity) return null
  return {
    opportunity: dbToOpp(result.opportunity),
    submission: result.submission ? dbToBDSubmission(result.submission) : null,
  }
}

export async function createPendingNonSubmissionWorkflow(input: {
  opportunityId: string
  expectedOpportunityStatus: Opportunity['status']
  expectedDueDate: string
  expectedLocalTime: string
  expectedTimezone?: string
  expectedDeadlineMs: number
  agentUsername: string
  reason: string
}): Promise<PendingNonSubmissionWorkflowResult | null> {
  const result = await requestWorkflow({
    action: 'create_pending_report',
    opportunityId: input.opportunityId,
    expectedOpportunityStatus: input.expectedOpportunityStatus,
    values: {
      agentUsername: input.agentUsername,
      reason: input.reason,
      expectedDueDate: input.expectedDueDate,
      expectedLocalTime: input.expectedLocalTime,
      ...(input.expectedTimezone ? { expectedTimezone: input.expectedTimezone } : {}),
      expectedDeadlineMs: input.expectedDeadlineMs,
    },
  })
  if (!result?.opportunity || !result.report) return null
  return {
    opportunity: dbToOpp(result.opportunity),
    report: dbToNonSubReport(result.report),
  }
}

export async function createManualNonSubmissionWorkflow(input: {
  opportunityId: string
  expectedOpportunityStatus: Opportunity['status']
  agentUsername: string
  reason: string
}): Promise<PendingNonSubmissionWorkflowResult | null> {
  const result = await requestWorkflow({
    action: 'create_manual_report',
    opportunityId: input.opportunityId,
    expectedOpportunityStatus: input.expectedOpportunityStatus,
    values: {
      agentUsername: input.agentUsername,
      reason: input.reason,
    },
  })
  if (!result?.opportunity || !result.report) return null
  return {
    opportunity: dbToOpp(result.opportunity),
    report: dbToNonSubReport(result.report),
  }
}
