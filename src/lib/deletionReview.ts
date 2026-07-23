import { apiRequest, envelopeData } from './api'

export type DeletionReviewDecision = 'APPROVED' | 'DECLINED'

export interface DeletionReviewResult {
  requestId: string
  opportunityId: string
  decision: DeletionReviewDecision
  requesterId: string
  reviewedBy: string
  reviewedAt: string
  notificationId: string
  notificationTitle: string
  notificationMessage: string
}

export async function reviewDeletionRequestWorkflow(
  requestId: string,
  decision: DeletionReviewDecision,
): Promise<DeletionReviewResult | null> {
  try {
    const response = await apiRequest<unknown>('/deletion-reviews', {
      method: 'POST',
      body: JSON.stringify({ requestId, decision }),
    })
    return envelopeData<DeletionReviewResult>(response)
  } catch (error) {
    console.error('[workflow] deletion review failed', error)
    return null
  }
}
