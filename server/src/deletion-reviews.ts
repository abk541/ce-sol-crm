import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { requireCompleted } from './auth.js'
import { asAuthenticatedUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies } from './types.js'

type DeletionDecision = 'APPROVED' | 'DECLINED'

interface DeletionReviewRequest {
  requestId: string
  decision: DeletionDecision
}

export interface DeletionReviewResult {
  requestId: string
  opportunityId: string
  decision: DeletionDecision
  requesterId: string
  reviewedBy: string
  reviewedAt: string
  notificationId: string
  notificationTitle: string
  notificationMessage: string
}

function parseDeletionReview(value: unknown): DeletionReviewRequest {
  const body = asRecord(value)
  assertAllowedKeys(body, ['requestId', 'decision'])
  const requestId = requiredString(body.requestId, 'requestId', 256)
  const decision = requiredString(body.decision, 'decision', 16).toUpperCase()
  if (decision !== 'APPROVED' && decision !== 'DECLINED') {
    throw new ApiError(400, 'invalid_request', 'decision must be APPROVED or DECLINED.')
  }
  return { requestId, decision }
}

async function requireDeletionApproval(client: Queryable): Promise<void> {
  const permission = await client.query<{ allowed: boolean }>(
    `select private.has_permission('opportunity:deleteApprove') as allowed`,
  )
  if (permission.rows[0]?.allowed !== true) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to review deletion requests.')
  }
}

async function reviewDeletionRequest(
  client: Queryable,
  input: DeletionReviewRequest,
  now: Date,
): Promise<DeletionReviewResult> {
  await requireDeletionApproval(client)

  const requestResult = await client.query<{
    id: string
    opportunity_id: string | null
    requested_by: string | null
    status: string
  }>(
    `select id, opportunity_id, requested_by, status
       from public.deletion_requests
      where id = $1
      for update`,
    [input.requestId],
  )
  const request = requestResult.rows[0]
  if (!request) throw new ApiError(404, 'not_found', 'Deletion request not found.')
  if (request.status !== 'PENDING') {
    throw new ApiError(409, 'stale_review', 'This deletion request has already been reviewed.')
  }
  if (!request.opportunity_id) {
    throw new ApiError(409, 'invalid_requester', 'The deletion request is not linked to an opportunity.')
  }

  const identity = (request.requested_by ?? '').trim().toLowerCase()
  if (!identity) {
    throw new ApiError(409, 'invalid_requester', 'The original requester could not be identified safely.')
  }
  const requesterResult = await client.query<{ id: string }>(
    `select id::text as id
       from public.users
      where lower(btrim(coalesce(id::text, ''))) = $1
         or lower(btrim(coalesce(auth_user_id::text, ''))) = $1
         or lower(btrim(coalesce(username, ''))) = $1
         or lower(btrim(coalesce(email, ''))) = $1
         or lower(btrim(coalesce(name, ''))) = $1
      order by id`,
    [identity],
  )
  if (requesterResult.rows.length !== 1) {
    throw new ApiError(409, 'invalid_requester', 'The original requester could not be identified safely.')
  }
  const requesterId = requesterResult.rows[0]!.id

  const reviewerResult = await client.query<{ reviewed_by: string }>(
    `select coalesce(
              nullif(btrim(name), ''),
              nullif(btrim(username), ''),
              'System'
            ) as reviewed_by
       from public.users
      where auth_user_id = app_auth.request_account_id()`,
  )
  const reviewedBy = reviewerResult.rows[0]?.reviewed_by ?? 'System'

  const opportunityResult = await client.query<QueryResultRow>(
    `select id, solicitation
       from public.opportunities
      where id = $1
      for update`,
    [request.opportunity_id],
  )
  const opportunity = opportunityResult.rows[0]
  if (!opportunity) throw new ApiError(409, 'stale_review', 'The linked opportunity no longer exists.')

  const reviewedAt = now.toISOString()
  const updatedRequest = await client.query(
    `update public.deletion_requests
        set status = $1,
            reviewed_by = $2,
            reviewed_at = $3
      where id = $4
        and status = 'PENDING'
      returning id`,
    [input.decision, reviewedBy, reviewedAt, input.requestId],
  )
  if (updatedRequest.rows.length !== 1) {
    throw new ApiError(409, 'stale_review', 'This deletion request changed before it could be reviewed.')
  }

  const updatedOpportunity = await client.query(
    `update public.opportunities
        set is_deleted = case when $1 = 'APPROVED' then true else coalesce(is_deleted, false) end,
            deletion_requested = false
      where id = $2
      returning id`,
    [input.decision, request.opportunity_id],
  )
  if (updatedOpportunity.rows.length !== 1) {
    throw new ApiError(409, 'stale_review', 'The linked opportunity changed before it could be reviewed.')
  }

  const outcome = input.decision === 'APPROVED' ? 'approved' : 'declined'
  const notificationId = `deletion-review-${input.requestId}`
  const notificationTitle = `Deletion request ${outcome}`
  const notificationMessage = `Your deletion request for ${String(opportunity.solicitation ?? 'this opportunity')} was ${outcome} by ${reviewedBy}.`
  const notificationResult = await client.query(
    `insert into public.notifications (
       id, type, title, message, "read", created_at, related_id, target_user_id
     )
     values ($1, 'DELETION_REQUEST', $2, $3, false, $4, $5, $6)
     on conflict (id) do update
       set title = excluded.title,
           message = excluded.message,
           "read" = false,
           created_at = excluded.created_at,
           related_id = excluded.related_id,
           target_user_id = excluded.target_user_id
     returning id`,
    [
      notificationId,
      notificationTitle,
      notificationMessage,
      reviewedAt,
      request.opportunity_id,
      requesterId,
    ],
  )
  if (notificationResult.rows.length !== 1) {
    throw new ApiError(409, 'notification_failed', 'The requester notification could not be saved.')
  }

  return {
    requestId: input.requestId,
    opportunityId: request.opportunity_id,
    decision: input.decision,
    requesterId,
    reviewedBy,
    reviewedAt,
    notificationId,
    notificationTitle,
    notificationMessage,
  }
}

export function registerDeletionReviewRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/deletion-reviews',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const input = parseDeletionReview(request.body)
      const result = await asAuthenticatedUser(
        dependencies.db,
        request.auth?.accountId as string,
        (client) => reviewDeletionRequest(client, input, dependencies.now()),
      )
      return { data: result, error: null }
    },
  )
}

export const __test = {
  parseDeletionReview,
  reviewDeletionRequest,
}
