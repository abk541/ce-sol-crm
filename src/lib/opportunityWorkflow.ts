import { apiRequest, envelopeData } from './api'
import { dbToBDSubmission, dbToOpp } from './db'
import type { BDSubmission, FileAttachment, MandatoryEvent, Opportunity } from '../types'

export interface OpportunityWorkflowResult {
  opportunity: Partial<Opportunity> | null
  submission: BDSubmission
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
  submission: Record<string, unknown>
}

async function runWorkflow(body: Record<string, unknown>): Promise<OpportunityWorkflowResult | null> {
  try {
    const response = await apiRequest<{ data: RawWorkflowResult }>(
      '/opportunity-workflows',
      { method: 'POST', body: JSON.stringify(body) },
    )
    const result = envelopeData<RawWorkflowResult>(response)
    return {
      opportunity: result.opportunity ? dbToOpp(result.opportunity) : null,
      submission: dbToBDSubmission(result.submission),
    }
  } catch (error) {
    console.error('[workflow] opportunity workflow failed', error)
    return null
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

export function returnOpportunityToPipelineWorkflow(input: {
  submissionId: number
  expectedOpportunityStatus: Opportunity['status']
  expectedSubmissionStatus: BDSubmission['status']
  targetOpportunityStatus: 'ACTIVE' | 'NEW_ASSIGNMENT'
  nonSubmissionReportId?: string
  nonSubmissionExempt?: boolean
}): Promise<OpportunityWorkflowResult | null> {
  return runWorkflow({
    action: 'return',
    submissionId: input.submissionId,
    expectedOpportunityStatus: input.expectedOpportunityStatus,
    expectedSubmissionStatus: input.expectedSubmissionStatus,
    targetOpportunityStatus: input.targetOpportunityStatus,
    ...(input.nonSubmissionReportId ? { nonSubmissionReportId: input.nonSubmissionReportId } : {}),
    ...(input.nonSubmissionExempt !== undefined ? { nonSubmissionExempt: input.nonSubmissionExempt } : {}),
  })
}
