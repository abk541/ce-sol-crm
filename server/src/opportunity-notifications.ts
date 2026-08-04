import type { QueryResultRow } from 'pg'
import type { Queryable } from './db.js'
import { opportunityDeadlineTimeMs } from './deadline.js'

interface NotificationActor {
  id: string
  name: string
  role: string
}

interface NotificationTarget {
  id: string
}

interface AssociateTargetCandidate extends NotificationTarget {
  username: string
  name: string
  email: string
  assigned_id: string
  assigned_name: string
  assigned_email: string
  assigned_role: string
}

const normalized = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
)

function deadlineTimeMs(opportunity: Readonly<Record<string, unknown>>): number | null {
  return opportunityDeadlineTimeMs({
    dueDate: opportunity.due_date,
    localTime: opportunity.local_time,
    timezone: opportunity.timezone,
  })
}

export function opportunityDeadlineChanged(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): boolean {
  const beforeMs = deadlineTimeMs(before)
  const afterMs = deadlineTimeMs(after)
  if (beforeMs !== null || afterMs !== null) return beforeMs !== afterMs

  return ['due_date', 'local_time', 'timezone'].some((column) => (
    normalized(before[column]).toLowerCase() !== normalized(after[column]).toLowerCase()
  ))
}

function deadlineLabel(opportunity: Readonly<Record<string, unknown>>): string {
  const values = [opportunity.due_date, opportunity.local_time, opportunity.timezone]
    .map(normalized)
    .filter(Boolean)
  return values.join(' ') || 'No deadline'
}

async function currentNotificationActor(client: Queryable): Promise<NotificationActor | null> {
  const result = await client.query<NotificationActor>(
    `select profile.id::text as id,
            coalesce(nullif(btrim(profile.name), ''), nullif(btrim(profile.username), ''), 'User') as name,
            profile.role::text as role
       from public.users profile
      where profile.auth_user_id = app_auth.request_account_id()
        and profile.status = 'active'
      limit 1`,
  )
  return result.rows[0] ?? null
}

async function assignedAssociateTargets(
  client: Queryable,
  assignedEmployeeId: unknown,
  agentUsername?: unknown,
  resolutionOrder: 'assignment-first' | 'agent-first' = 'assignment-first',
): Promise<NotificationTarget[]> {
  const assignedId = normalized(assignedEmployeeId)
  const agent = normalized(agentUsername).toLowerCase()
  if (!assignedId && !agent) return []

  const result = await client.query<AssociateTargetCandidate>(
    `select candidate.id::text as id,
            coalesce(candidate.username, '')::text as username,
            coalesce(candidate.name, '')::text as name,
            coalesce(candidate.email, '')::text as email,
            coalesce(assigned.id::text, '') as assigned_id,
            coalesce(assigned.name, '')::text as assigned_name,
            coalesce(assigned.email, '')::text as assigned_email,
            coalesce(assigned.role::text, '') as assigned_role
       from public.users candidate
       left join public.employees assigned on assigned.id::text = $1
      where candidate.status = 'active'
        and candidate.role = 'ASSOCIATE'
      order by candidate.id`,
    [assignedId],
  )
  const target = resolveAssignedAssociateTarget(result.rows, agent, resolutionOrder)
  return target ? [{ id: target.id }] : []
}

function uniqueCandidate(
  candidates: readonly AssociateTargetCandidate[],
  predicate: (candidate: AssociateTargetCandidate) => boolean,
): AssociateTargetCandidate | null {
  const matches = candidates.filter(predicate)
  return matches.length === 1 ? matches[0]! : null
}

function resolveAssignmentTarget(
  candidates: readonly AssociateTargetCandidate[],
): AssociateTargetCandidate | null {
  if (candidates.length === 0) return null
  const assigned = candidates[0]!
  const hasAssociateAssignment = normalized(assigned.assigned_role).toUpperCase() === 'ASSOCIATE'
  if (!hasAssociateAssignment) return null

  const assignedId = normalized(assigned.assigned_id).toLowerCase()
  const exactId = uniqueCandidate(
    candidates,
    candidate => assignedId !== '' && normalized(candidate.id).toLowerCase() === assignedId,
  )
  if (exactId) return exactId

  const assignedEmail = normalized(assigned.assigned_email).toLowerCase()
  const exactEmail = uniqueCandidate(
    candidates,
    candidate => assignedEmail !== '' && normalized(candidate.email).toLowerCase() === assignedEmail,
  )
  if (exactEmail) return exactEmail

  const assignedName = normalized(assigned.assigned_name).toLowerCase()
  return uniqueCandidate(
    candidates,
    candidate => assignedName !== '' && normalized(candidate.name).toLowerCase() === assignedName,
  )
}

function resolveAgentTarget(
  candidates: readonly AssociateTargetCandidate[],
  agentUsername: unknown,
): AssociateTargetCandidate | null {
  const agent = normalized(agentUsername).toLowerCase()
  const exactUsername = uniqueCandidate(
    candidates,
    candidate => agent !== '' && normalized(candidate.username).toLowerCase() === agent,
  )
  if (exactUsername) return exactUsername

  const emailPrefix = uniqueCandidate(
    candidates,
    candidate => agent !== '' && normalized(candidate.email).toLowerCase().split('@', 1)[0] === agent,
  )
  if (emailPrefix) return emailPrefix

  return null
}

/**
 * Resolves legacy employee/account identities without ever guessing between
 * duplicate names, emails, usernames, or email prefixes. Every fallback must
 * identify exactly one active Associate candidate. Deadline changes are about
 * the current assignment; report decisions are about the original reporter.
 */
function resolveAssignedAssociateTarget(
  candidates: readonly AssociateTargetCandidate[],
  agentUsername: unknown,
  resolutionOrder: 'assignment-first' | 'agent-first' = 'assignment-first',
): AssociateTargetCandidate | null {
  const assignment = () => resolveAssignmentTarget(candidates)
  const agent = () => resolveAgentTarget(candidates, agentUsername)
  return resolutionOrder === 'agent-first'
    ? agent() ?? assignment()
    : assignment() ?? agent()
}

async function captureManagerTargets(client: Queryable, actorId: string): Promise<NotificationTarget[]> {
  const result = await client.query<NotificationTarget>(
    `select profile.id::text as id
       from public.users profile
      where profile.status = 'active'
        and profile.role = 'CAPTURE_MANAGER'
        and profile.id::text <> $1
      order by profile.id`,
    [actorId],
  )
  return result.rows
}

async function insertPersonalNotifications(
  client: Queryable,
  input: {
    idNamespace: string
    type: string
    title: string
    message: string
    relatedId: string
    targetIds: readonly string[]
    createdAt?: Date
  },
): Promise<number> {
  const targetIds = [...new Set(input.targetIds.filter(Boolean))]
  if (targetIds.length === 0) return 0
  const result = await client.query<{ id: string }>(
    `insert into public.notifications (
       id, type, title, message, read, created_at, related_id, target_role, target_user_id
     )
     select $1 || '-' || md5(target.id || ':' || txid_current()::text),
            $2, $3, $4, false, coalesce($5::timestamptz, statement_timestamp()),
            $6, null, target.id
       from unnest($7::text[]) as target(id)
     on conflict (id) do nothing
     returning id`,
    [
      input.idNamespace,
      input.type,
      input.title,
      input.message,
      input.createdAt?.toISOString() ?? null,
      input.relatedId,
      targetIds,
    ],
  )
  return result.rowCount ?? result.rows.length
}

/**
 * Persists deadline-change alerts in the same transaction as the opportunity
 * patch. Associate edits are sent to every active Capture Manager; edits made
 * by managers are sent only to the opportunity's assigned Associate.
 */
export async function persistOpportunityDeadlineNotifications(
  client: Queryable,
  before: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Promise<number> {
  const after = { ...before, ...patch }
  if (!opportunityDeadlineChanged(before, after)) return 0

  const actor = await currentNotificationActor(client)
  if (!actor) return 0
  const targets = actor.role === 'ASSOCIATE'
    ? await captureManagerTargets(client, actor.id)
    : await assignedAssociateTargets(client, after.assigned_to, undefined, 'assignment-first')
  if (targets.length === 0) return 0

  const previousDeadline = deadlineTimeMs(before)
  const nextDeadline = deadlineTimeMs(after)
  const removed = nextDeadline === null && !normalized(after.due_date) && !normalized(after.local_time)
  const extended = previousDeadline !== null && nextDeadline !== null && nextDeadline > previousDeadline
  const title = removed
    ? 'Opportunity deadline removed'
    : extended
      ? 'Opportunity deadline extended'
      : 'Opportunity deadline updated'
  const solicitation = normalized(after.solicitation) || normalized(after.solicitation_id) || 'An opportunity'
  const previousLabel = deadlineLabel(before)
  const nextLabel = deadlineLabel(after)
  const message = actor.role === 'ASSOCIATE'
    ? removed
      ? `${actor.name} removed the deadline for ${solicitation}. Previous deadline: ${previousLabel}.`
      : `${actor.name} changed the deadline for ${solicitation} from ${previousLabel} to ${nextLabel}.`
    : removed
      ? `${solicitation} no longer has a deadline.`
      : `${solicitation} now has a deadline of ${nextLabel}.`

  return insertPersonalNotifications(client, {
    idNamespace: `deadline-change-${normalized(after.id) || 'opportunity'}`,
    type: 'DEADLINE',
    title,
    message,
    relatedId: normalized(after.id),
    targetIds: targets.map(target => target.id),
  })
}

/** Persists the report decision for its owning Associate in the review transaction. */
export async function persistNonSubmissionReviewNotification(
  client: Queryable,
  input: {
    reportId: string
    opportunity: QueryResultRow
    agentUsername: unknown
    decision: 'APPROVED' | 'DECLINED'
    reviewedAt: Date
  },
): Promise<number> {
  const actor = await currentNotificationActor(client)
  const targets = await assignedAssociateTargets(
    client,
    input.opportunity.assigned_to,
    input.agentUsername,
    'agent-first',
  )
  if (targets.length === 0) return 0

  const outcome = input.decision === 'APPROVED' ? 'approved' : 'declined'
  const solicitation = normalized(input.opportunity.solicitation)
    || normalized(input.opportunity.solicitation_id)
    || 'this opportunity'
  return insertPersonalNotifications(client, {
    idNamespace: `non-sub-review-${input.reportId}`,
    type: 'NON_SUB_REVIEW',
    title: `Non-submission report ${outcome}`,
    message: `Your non-submission report for ${solicitation} was ${outcome} by ${actor?.name ?? 'the Capture Manager'}.`,
    relatedId: normalized(input.opportunity.id),
    targetIds: targets.map(target => target.id),
    createdAt: input.reviewedAt,
  })
}

export const __test = {
  opportunityDeadlineChanged,
  resolveAssignedAssociateTarget,
  persistOpportunityDeadlineNotifications,
  persistNonSubmissionReviewNotification,
}
