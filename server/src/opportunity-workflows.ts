import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { requireCompleted } from './auth.js'
import { asAuthenticatedUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies } from './types.js'

const TRACKER_STATUSES = new Set([
  'SUBMITTED', 'DISCUSSING', 'AWARDED', 'LOST', 'CANCELED', 'NOT_SUBMITTED', 'DROPPED',
])

const SUBMIT_VALUE_COLUMNS = {
  contractAmount: 'contract_amount',
  baseAmount: 'base_amount',
  monthlyPayment: 'monthly_payment',
  proposals: 'proposals',
  assignedOpportunities: 'assigned_opportunities',
  proposalAttachments: 'proposal_attachments',
} as const

const TRACKER_EDIT_COLUMNS = {
  submittedOn: 'submitted_on',
  solicitationId: 'solicitation_id',
  setAside: 'set_aside',
  type: 'type',
  solicitation: 'solicitation',
  dueDate: 'due_date',
  localTime: 'local_time',
  location: 'location',
  bdm: 'bdm',
  bds: 'bds',
  supportAgent: 'support_agent',
  value: 'value',
  comment: 'comment',
} as const

const OPPORTUNITY_EDIT_COLUMNS = {
  solicitation: 'solicitation',
  client: 'client',
  type: 'type',
  setAside: 'set_aside',
  naicsCode: 'naics_code',
  dueDate: 'due_date',
  localTime: 'local_time',
  timezone: 'timezone',
  location: 'location',
  contractAmount: 'contract_amount',
  baseAmount: 'base_amount',
  monthlyPayment: 'monthly_payment',
  value: 'value',
  mandatoryEvents: 'mandatory_events',
  mandatoryEventsList: 'mandatory_events_list',
  proposalAttachments: 'proposal_attachments',
  proposals: 'proposals',
  assignedTo: 'assigned_to',
  bdm: 'bdm',
  bds: 'bds',
  supportAgent: 'support_agent',
} as const

const ASSIGNMENT_KEYS = new Set(['assignedTo', 'bdm', 'bds', 'supportAgent'])
const TRACKER_ASSIGNMENT_KEYS = new Set(['bdm', 'bds', 'supportAgent'])
const FINANCIAL_KEYS = new Set(['contractAmount', 'baseAmount', 'monthlyPayment', 'value'])
const TRACKER_FINANCIAL_KEYS = new Set(['value'])
const SUBMIT_FINANCIAL_COLUMNS = {
  contractAmount: 'contract_amount',
  baseAmount: 'base_amount',
  monthlyPayment: 'monthly_payment',
} as const
const OPPORTUNITY_SCHEDULE_COLUMNS = {
  dueDate: 'due_date',
  localTime: 'local_time',
  timezone: 'timezone',
} as const
const POST_SUBMISSION_OPPORTUNITY_STATUSES = new Set([
  'SUBMITTED', 'WON', 'LOST', 'CANCELED', 'NOT_SUBMITTED', 'DROPPED', 'TERMINATED',
  'AWARDED', 'DISCUSSING',
])
const PERMISSIONS = [
  'admin:manageUsers',
  'opportunity:submitProposal',
  'opportunity:edit',
  'opportunity:assign',
  'opportunity:cancel',
  'opportunity:deleteApprove',
  'nonSubmission:review',
] as const

type WorkflowAction = 'submit' | 'transition' | 'edit' | 'delete' | 'return'

interface WorkflowRequest {
  action: WorkflowAction
  opportunityId?: string | undefined
  submissionId?: number | undefined
  expectedOpportunityStatus?: string | undefined
  expectedSubmissionStatus?: string | undefined
  status?: string | undefined
  comment?: string | null | undefined
  nonSubmissionReportId?: string | undefined
  nonSubmissionExempt?: boolean | undefined
  reviewNote?: string | undefined
  targetOpportunityStatus?: 'ACTIVE' | 'NEW_ASSIGNMENT' | undefined
  values: Record<string, unknown>
  opportunityValues: Record<string, unknown>
}

interface WorkflowResult {
  opportunity: QueryResultRow | null
  submission: QueryResultRow
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label, maxLength)
}

function parseSubmissionId(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ApiError(400, 'invalid_request', 'submissionId must be a positive integer.')
  }
  return Number(value)
}

function parseObject(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (value === undefined) return {}
  const result = asRecord(value, label)
  assertAllowedKeys(result, allowed, label)
  return result
}

function parseRequest(value: unknown): WorkflowRequest {
  const body = asRecord(value)
  assertAllowedKeys(body, [
    'action', 'opportunityId', 'submissionId', 'expectedOpportunityStatus',
    'expectedSubmissionStatus', 'status', 'comment', 'nonSubmissionReportId',
    'nonSubmissionExempt', 'reviewNote', 'targetOpportunityStatus', 'values', 'opportunityValues',
  ])
  const action = requiredString(body.action, 'action', 20) as WorkflowAction
  if (!['submit', 'transition', 'edit', 'delete', 'return'].includes(action)) {
    throw new ApiError(400, 'invalid_request', 'action must be submit, transition, edit, delete, or return.')
  }
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    throw new ApiError(400, 'invalid_request', 'comment must be a string or null.')
  }
  const values = parseObject(
    body.values,
    'values',
    action === 'submit'
      ? Object.keys(SUBMIT_VALUE_COLUMNS)
      : action === 'edit' ? Object.keys(TRACKER_EDIT_COLUMNS) : [],
  )
  const opportunityValues = parseObject(
    body.opportunityValues,
    'opportunityValues',
    Object.keys(OPPORTUNITY_EDIT_COLUMNS),
  )
  if (action !== 'edit' && Object.keys(opportunityValues).length > 0) {
    throw new ApiError(400, 'invalid_request', 'opportunityValues is only supported for edit.')
  }
  const opportunityId = optionalString(body.opportunityId, 'opportunityId', 200)
  const submissionId = parseSubmissionId(body.submissionId)
  if (action === 'submit' && (!opportunityId || submissionId !== undefined)) {
    throw new ApiError(400, 'invalid_request', 'submit requires opportunityId and does not accept submissionId.')
  }
  if (action !== 'submit' && opportunityId === undefined && submissionId === undefined) {
    throw new ApiError(400, 'invalid_request', `${action} requires opportunityId or submissionId.`)
  }
  if (opportunityId !== undefined && submissionId !== undefined) {
    throw new ApiError(400, 'invalid_request', 'Provide either opportunityId or submissionId, not both.')
  }
  if ((action === 'delete' || action === 'return') && submissionId === undefined) {
    throw new ApiError(400, 'invalid_request', `${action} requires submissionId.`)
  }
  let status: string | undefined
  if (action === 'transition') {
    status = requiredString(body.status, 'status', 40).toUpperCase()
    if (!TRACKER_STATUSES.has(status)) throw new ApiError(400, 'invalid_request', 'status is not supported.')
  } else if (body.status !== undefined) {
    throw new ApiError(400, 'invalid_request', 'status is only supported for transition.')
  }
  if (action !== 'transition' && body.comment !== undefined) {
    throw new ApiError(400, 'invalid_request', 'comment is only supported for transition; use values.comment for edit.')
  }
  const nonSubmissionReportId = optionalString(body.nonSubmissionReportId, 'nonSubmissionReportId', 200)
  if (action !== 'return' && action !== 'transition' && nonSubmissionReportId !== undefined) {
    throw new ApiError(400, 'invalid_request', 'nonSubmissionReportId is only supported for transition or return.')
  }
  if (action === 'transition' && nonSubmissionReportId !== undefined
    && status !== 'NOT_SUBMITTED' && status !== 'DROPPED') {
    throw new ApiError(400, 'invalid_request', 'A report review must transition to NOT_SUBMITTED or DROPPED.')
  }
  let nonSubmissionExempt: boolean | undefined
  if (body.nonSubmissionExempt !== undefined) {
    if (action !== 'return' || typeof body.nonSubmissionExempt !== 'boolean') {
      throw new ApiError(400, 'invalid_request', 'nonSubmissionExempt must be a boolean used only for return.')
    }
    nonSubmissionExempt = body.nonSubmissionExempt
  }
  const reviewNote = optionalString(body.reviewNote, 'reviewNote', 5000)
  if (action !== 'transition' && reviewNote !== undefined) {
    throw new ApiError(400, 'invalid_request', 'reviewNote is only supported for transition.')
  }
  if (reviewNote !== undefined && nonSubmissionReportId === undefined) {
    throw new ApiError(400, 'invalid_request', 'reviewNote requires nonSubmissionReportId.')
  }
  let targetOpportunityStatus: 'ACTIVE' | 'NEW_ASSIGNMENT' | undefined
  if (body.targetOpportunityStatus !== undefined) {
    const target = requiredString(body.targetOpportunityStatus, 'targetOpportunityStatus', 40)
    if (action !== 'return' || (target !== 'ACTIVE' && target !== 'NEW_ASSIGNMENT')) {
      throw new ApiError(400, 'invalid_request', 'targetOpportunityStatus must be ACTIVE or NEW_ASSIGNMENT for return.')
    }
    targetOpportunityStatus = target
  }
  if (action === 'return' && targetOpportunityStatus === undefined) {
    throw new ApiError(400, 'invalid_request', 'return requires targetOpportunityStatus.')
  }
  const expectedOpportunityStatus = optionalString(
    body.expectedOpportunityStatus,
    'expectedOpportunityStatus',
    40,
  )
  const expectedSubmissionStatus = optionalString(
    body.expectedSubmissionStatus,
    'expectedSubmissionStatus',
    40,
  )
  if ((action === 'submit' || action === 'return') && expectedOpportunityStatus === undefined) {
    throw new ApiError(400, 'invalid_request', `${action} requires expectedOpportunityStatus.`)
  }
  if ((action === 'edit' || action === 'delete' || action === 'return') && expectedSubmissionStatus === undefined) {
    throw new ApiError(400, 'invalid_request', `${action} requires expectedSubmissionStatus.`)
  }
  return {
    action,
    opportunityId,
    submissionId,
    expectedOpportunityStatus,
    expectedSubmissionStatus,
    status,
    comment: body.comment as string | null | undefined,
    nonSubmissionReportId,
    nonSubmissionExempt,
    reviewNote,
    targetOpportunityStatus,
    values,
    opportunityValues,
  }
}

async function effectivePermissions(client: Queryable): Promise<Set<string>> {
  const result = await client.query<{ permission: string; allowed: boolean }>(
    `select requested.permission,
            private.has_permission(requested.permission) as allowed
       from unnest($1::text[]) as requested(permission)`,
    [PERMISSIONS],
  )
  return new Set(result.rows.filter((row) => row.allowed).map((row) => row.permission))
}

function requirePermission(permissions: ReadonlySet<string>, permission: string): void {
  if (permissions.has('admin:manageUsers') || permissions.has(permission)) return
  throw new ApiError(403, 'forbidden', 'You do not have permission to perform this workflow action.')
}

function requireAnyPermission(permissions: ReadonlySet<string>, required: readonly string[]): void {
  if (permissions.has('admin:manageUsers') || required.some((permission) => permissions.has(permission))) return
  throw new ApiError(403, 'forbidden', 'You do not have permission to perform this workflow action.')
}

function stale(label: string): never {
  throw new ApiError(409, 'stale_workflow', `${label} changed since it was loaded. Refresh and try again.`)
}

function assertExpectedStatus(row: QueryResultRow, expected: string | undefined, label: string): void {
  if (expected !== undefined && row.status !== expected) stale(label)
}

async function lockOpportunity(client: Queryable, id: string): Promise<QueryResultRow> {
  const result = await client.query('select * from public.opportunities where id = $1 for update', [id])
  if (result.rows.length !== 1) throw new ApiError(404, 'not_found', 'Opportunity not found.')
  return result.rows[0]!
}

async function discoverSubmission(client: Queryable, id: number): Promise<QueryResultRow> {
  const result = await client.query(
    'select id, opportunity_id from public.bd_submissions where id = $1',
    [id],
  )
  if (result.rows.length !== 1) throw new ApiError(404, 'not_found', 'BD submission not found.')
  return result.rows[0]!
}

async function lockSubmissionById(client: Queryable, id: number): Promise<QueryResultRow> {
  const result = await client.query('select * from public.bd_submissions where id = $1 for update', [id])
  if (result.rows.length !== 1) throw new ApiError(404, 'not_found', 'BD submission not found.')
  return result.rows[0]!
}

async function linkedSubmission(
  client: Queryable,
  opportunity: QueryResultRow,
): Promise<QueryResultRow | null> {
  const linked = await client.query(
    'select * from public.bd_submissions where opportunity_id = $1 for update',
    [opportunity.id],
  )
  if (linked.rows.length > 1) {
    throw new ApiError(409, 'ambiguous_submission', 'More than one BD submission is linked to this opportunity.')
  }
  if (linked.rows.length === 1) return linked.rows[0]!

  const solicitationId = typeof opportunity.solicitation_id === 'string'
    ? opportunity.solicitation_id.trim()
    : ''
  if (!solicitationId) {
    throw new ApiError(409, 'unreconcilable_submission', 'The opportunity has no solicitation ID for tracker reconciliation.')
  }

  const legacy = await client.query(
    `select * from public.bd_submissions
      where opportunity_id is null
        and lower(btrim(solicitation_id)) = lower(btrim($1))
      for update`,
    [solicitationId],
  )
  if (legacy.rows.length > 1) {
    throw new ApiError(409, 'ambiguous_submission', 'Multiple legacy BD submissions match this opportunity.')
  }
  if (legacy.rows.length === 0) return null
  const opportunityMatches = await client.query<{ id: string }>(
    `select id::text as id
       from public.opportunities
      where lower(btrim(solicitation_id)) = lower(btrim($1))
      order by id`,
    [solicitationId],
  )
  if (opportunityMatches.rows.length !== 1
    || opportunityMatches.rows[0]!.id !== String(opportunity.id)) {
    throw new ApiError(
      409,
      'ambiguous_submission',
      'The legacy BD submission does not map to exactly one active opportunity.',
    )
  }
  const reconciled = await client.query(
    'update public.bd_submissions set opportunity_id = $1 where id = $2 and opportunity_id is null returning *',
    [opportunity.id, legacy.rows[0]!.id],
  )
  if (reconciled.rows.length !== 1) stale('BD submission')
  return reconciled.rows[0]!
}

function mapStatus(status: string): string {
  if (status === 'DISCUSSING') return 'DISCUSSION'
  if (status === 'AWARDED') return 'WON'
  return status
}

function generatedCancellationComment(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'canceled'
    || normalized === 'cancelled'
    || normalized === 'canceled from contract opportunities'
    || normalized === 'cancelled from contract opportunities'
}

function assignments(mapping: Readonly<Record<string, string>>, values: Record<string, unknown>, params: unknown[]): string[] {
  return Object.keys(values).sort().map((key) => {
    params.push(values[key])
    return `"${mapping[key]}" = $${params.length}`
  })
}

function canonicalNumeric(value: unknown): string | undefined {
  const source = typeof value === 'number'
    ? Number.isFinite(value) ? String(value) : undefined
    : typeof value === 'string' ? value.trim() : undefined
  if (!source) return undefined
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (!match) return undefined
  if (!match[2] && !match[3]) return undefined
  const exponent = match[4] === undefined ? 0 : Number(match[4])
  if (!Number.isSafeInteger(exponent)) return undefined
  let digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '')
  if (!digits) return '0'
  let scale = (match[3]?.length ?? 0) - exponent
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    scale -= 1
  }
  return `${match[1] === '-' ? '-' : ''}${digits}e${-scale}`
}

function numericValuesEqual(current: unknown, requested: unknown): boolean {
  if ((current === null || current === undefined) && (requested === null || requested === undefined)) {
    return true
  }
  const currentNumeric = canonicalNumeric(current)
  const requestedNumeric = canonicalNumeric(requested)
  return currentNumeric !== undefined && currentNumeric === requestedNumeric
}

function submittedFinancialsChanged(
  opportunity: QueryResultRow,
  values: Record<string, unknown>,
): boolean {
  return Object.entries(SUBMIT_FINANCIAL_COLUMNS).some(([key, column]) => (
    Object.prototype.hasOwnProperty.call(values, key)
      && !numericValuesEqual(opportunity[column], values[key])
  ))
}

function normalizedScheduleValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

function opportunityScheduleChanged(
  opportunity: QueryResultRow,
  values: Record<string, unknown>,
): boolean {
  return Object.entries(OPPORTUNITY_SCHEDULE_COLUMNS).some(([key, column]) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return false
    return normalizedScheduleValue(opportunity[column]) !== normalizedScheduleValue(values[key])
  })
}

async function trackerSnapshot(
  client: Queryable,
  opportunity: QueryResultRow,
  existing?: QueryResultRow | null,
): Promise<Record<string, unknown>> {
  let hierarchy: QueryResultRow | undefined
  if (typeof opportunity.assigned_to === 'string' && opportunity.assigned_to.trim()) {
    const result = await client.query(
      `select assigned.role as assigned_role, assigned.name as assigned_name,
              parent.role as parent_role, parent.name as parent_name,
              grandparent.role as grandparent_role, grandparent.name as grandparent_name
         from public.employees assigned
         left join public.employees parent on parent.id = assigned.manager_id
         left join public.employees grandparent on grandparent.id = parent.manager_id
        where assigned.id = $1
          and coalesce(assigned.team, 'BD') = 'BD'`,
      [opportunity.assigned_to],
    )
    hierarchy = result.rows.length === 1 ? result.rows[0] : undefined
  }
  const assignedRole = String(hierarchy?.assigned_role ?? '')
  const derivedManager = assignedRole === 'BD_MANAGER'
    ? hierarchy?.assigned_name
    : assignedRole === 'TEAM_LEAD' && hierarchy?.parent_role === 'BD_MANAGER'
      ? hierarchy.parent_name
      : assignedRole === 'ASSOCIATE' && hierarchy?.grandparent_role === 'BD_MANAGER'
        ? hierarchy.grandparent_name
        : undefined
  const derivedTeamLead = assignedRole === 'TEAM_LEAD'
    ? hierarchy?.assigned_name
    : assignedRole === 'ASSOCIATE' && hierarchy?.parent_role === 'TEAM_LEAD'
      ? hierarchy.parent_name
      : undefined
  const derivedAssociate = assignedRole === 'ASSOCIATE' ? hierarchy?.assigned_name : undefined
  const localTime = `${opportunity.local_time ?? ''}${opportunity.timezone ? ` ${opportunity.timezone}` : ''}`.trim()
  return {
    solicitation_id: opportunity.solicitation_id,
    set_aside: opportunity.set_aside,
    type: opportunity.type,
    solicitation: opportunity.solicitation,
    due_date: opportunity.due_date,
    local_time: localTime,
    location: opportunity.location,
    bdm: derivedManager || opportunity.bdm || existing?.bdm || '',
    bds: derivedTeamLead || opportunity.bds || existing?.bds || '',
    support_agent: derivedAssociate || opportunity.support_agent || existing?.support_agent || null,
    value: opportunity.contract_amount ?? opportunity.value ?? opportunity.base_amount ?? 0,
  }
}

async function insertSubmission(
  client: Queryable,
  opportunity: QueryResultRow,
  status: string,
  comment: string | null | undefined,
  now: Date,
): Promise<QueryResultRow> {
  const snapshot = await trackerSnapshot(client, opportunity)
  const columns = ['opportunity_id', 'submitted_on', ...Object.keys(snapshot), 'status', 'comment']
  const values = [
    opportunity.id,
    now.toISOString().slice(0, 10),
    ...Object.values(snapshot),
    status,
    comment ?? null,
  ]
  const placeholders = values.map((_value, index) => `$${index + 1}`)
  const result = await client.query(
    `insert into public.bd_submissions (${columns.map((column) => `"${column}"`).join(', ')})
     values (${placeholders.join(', ')}) returning *`,
    values,
  )
  if (result.rows.length !== 1) throw new ApiError(409, 'workflow_conflict', 'BD submission was not created.')
  return result.rows[0]!
}

async function updateSubmission(
  client: Queryable,
  id: unknown,
  patch: Record<string, unknown>,
): Promise<QueryResultRow> {
  const values: unknown[] = []
  const set = Object.keys(patch).sort().map((column) => {
    values.push(patch[column])
    return `"${column}" = $${values.length}`
  })
  values.push(id)
  const result = await client.query(
    `update public.bd_submissions set ${set.join(', ')} where id = $${values.length} returning *`,
    values,
  )
  if (result.rows.length !== 1) stale('BD submission')
  return result.rows[0]!
}

async function submit(
  client: Queryable,
  request: WorkflowRequest,
  permissions: ReadonlySet<string>,
  now: Date,
): Promise<WorkflowResult> {
  requirePermission(permissions, 'opportunity:submitProposal')
  const original = await lockOpportunity(client, request.opportunityId as string)
  assertExpectedStatus(original, request.expectedOpportunityStatus, 'Opportunity')
  const current = await linkedSubmission(client, original)
  if (current) {
    if (request.expectedSubmissionStatus === undefined) stale('BD submission')
    assertExpectedStatus(current, request.expectedSubmissionStatus, 'BD submission')
  }
  else if (request.expectedSubmissionStatus !== undefined) stale('BD submission')
  const wasPreviouslySubmitted = current !== null
    || original.submitted_at !== null && original.submitted_at !== undefined
    || POST_SUBMISSION_OPPORTUNITY_STATUSES.has(String(original.status ?? '').toUpperCase())
  if (wasPreviouslySubmitted && submittedFinancialsChanged(original, request.values)) {
    requirePermission(permissions, 'admin:manageUsers')
  }
  const oldStatuses = new Set([String(original.status ?? ''), String(current?.status ?? '')])
  if (oldStatuses.has('CANCELED')) requirePermission(permissions, 'opportunity:cancel')
  if (oldStatuses.has('NOT_SUBMITTED') || oldStatuses.has('DROPPED')) {
    requirePermission(permissions, 'nonSubmission:review')
  }
  const linkedReportId = typeof original.non_submission_report_id === 'string'
    && original.non_submission_report_id.trim()
    ? original.non_submission_report_id.trim()
    : undefined
  let reportToDelete: string | undefined
  if (linkedReportId) {
    const report = await client.query<{ id: string; status: string }>(
      `select id, status from public.non_submission_reports
        where id = $1 and opportunity_id = $2
        for update`,
      [linkedReportId, original.id],
    )
    if (report.rows.length > 1) {
      throw new ApiError(409, 'ambiguous_report', 'More than one non-submission report matched the opportunity.')
    }
    if (report.rows[0]?.status === 'PENDING') reportToDelete = report.rows[0].id
  }
  const params: unknown[] = []
  const set = assignments(SUBMIT_VALUE_COLUMNS, request.values, params)
  params.push('SUBMITTED', now.toISOString(), original.id)
  set.push(`status = $${params.length - 2}`, `submitted_at = $${params.length - 1}`)
  if (linkedReportId) set.push('non_submission_report_id = null')
  const updated = await client.query(
    `update public.opportunities set ${set.join(', ')} where id = $${params.length} returning *`,
    params,
  )
  if (updated.rows.length !== 1) stale('Opportunity')
  const opportunity = updated.rows[0]!
  const submission = current
    ? await updateSubmission(client, current.id, {
        ...await trackerSnapshot(client, opportunity, current),
        status: 'SUBMITTED',
        ...(oldStatuses.has('CANCELED') && generatedCancellationComment(current.comment)
          ? { comment: null }
          : {}),
      })
    : await insertSubmission(client, opportunity, 'SUBMITTED', undefined, now)
  if (reportToDelete) {
    const deletedReport = await client.query(
      'delete from public.non_submission_reports where id = $1 and opportunity_id = $2 returning id',
      [reportToDelete, original.id],
    )
    if (deletedReport.rows.length !== 1) stale('Non-submission report')
  }
  return { opportunity, submission }
}

async function locateForLinkedAction(
  client: Queryable,
  request: WorkflowRequest,
): Promise<{ opportunity: QueryResultRow | null; submission: QueryResultRow | null }> {
  if (request.opportunityId) {
    const opportunity = await lockOpportunity(client, request.opportunityId)
    return { opportunity, submission: await linkedSubmission(client, opportunity) }
  }
  const discovered = await discoverSubmission(client, request.submissionId as number)
  const opportunity = discovered.opportunity_id
    ? await lockOpportunity(client, String(discovered.opportunity_id))
    : null
  const submission = await lockSubmissionById(client, request.submissionId as number)
  if ((submission.opportunity_id ?? null) !== (discovered.opportunity_id ?? null)) stale('BD submission')
  return { opportunity, submission }
}

async function transition(
  client: Queryable,
  request: WorkflowRequest,
  permissions: ReadonlySet<string>,
  now: Date,
): Promise<WorkflowResult> {
  const located = await locateForLinkedAction(client, request)
  const current = located.submission
  if (!current && !located.opportunity) throw new ApiError(404, 'not_found', 'BD submission not found.')
  if (located.opportunity && request.expectedOpportunityStatus === undefined) {
    throw new ApiError(400, 'invalid_request', 'A linked transition requires expectedOpportunityStatus.')
  }
  assertExpectedStatus(located.opportunity ?? {}, request.expectedOpportunityStatus, 'Opportunity')
  if (current) {
    if (request.expectedSubmissionStatus === undefined) stale('BD submission')
    assertExpectedStatus(current, request.expectedSubmissionStatus, 'BD submission')
  }
  else if (request.expectedSubmissionStatus !== undefined) stale('BD submission')
  const status = request.status as string
  const previousStatuses = new Set([
    String(located.opportunity?.status ?? ''),
    String(current?.status ?? ''),
  ].filter(Boolean))
  if (status === 'CANCELED' || previousStatuses.has('CANCELED')) {
    requirePermission(permissions, 'opportunity:cancel')
  }
  const nonSubmissionStatuses = new Set(['NOT_SUBMITTED', 'DROPPED'])
  if (nonSubmissionStatuses.has(status)
    || [...previousStatuses].some((previousStatus) => nonSubmissionStatuses.has(previousStatus))) {
    requirePermission(permissions, 'nonSubmission:review')
  }
  if (status !== 'CANCELED' && !previousStatuses.has('CANCELED')
    && !nonSubmissionStatuses.has(status)
    && ![...previousStatuses].some((previousStatus) => nonSubmissionStatuses.has(previousStatus))) {
    requireAnyPermission(permissions, ['opportunity:submitProposal', 'opportunity:edit'])
  }
  let pendingReportToDelete: string | undefined
  if (request.nonSubmissionReportId) {
    if (!located.opportunity) {
      throw new ApiError(409, 'orphan_submission', 'The report is not linked to an opportunity.')
    }
    const report = await client.query(
      `select id from public.non_submission_reports
        where id = $1 and opportunity_id = $2
        for update`,
      [request.nonSubmissionReportId, located.opportunity.id],
    )
    if (report.rows.length !== 1) stale('Non-submission report')
  } else if (located.opportunity?.non_submission_report_id) {
    const report = await client.query<{ id: string; status: string }>(
      `select id, status from public.non_submission_reports
        where id = $1 and opportunity_id = $2
        for update`,
      [located.opportunity.non_submission_report_id, located.opportunity.id],
    )
    if (report.rows.length > 1) {
      throw new ApiError(409, 'ambiguous_report', 'More than one non-submission report matched the opportunity.')
    }
    if (report.rows[0]?.status === 'PENDING') pendingReportToDelete = report.rows[0].id
  }

  let opportunity = located.opportunity
  if (opportunity) {
    const values: unknown[] = [mapStatus(status), opportunity.id]
    const submittedAt = status === 'CANCELED'
      ? ''
      : ', submitted_at = coalesce(submitted_at, $3)'
    if (submittedAt) values.push(now.toISOString())
    const clearPendingReport = pendingReportToDelete
      ? ', non_submission_report_id = null'
      : ''
    const updated = await client.query(
      `update public.opportunities set status = $1${submittedAt}${clearPendingReport} where id = $2 returning *`,
      values,
    )
    if (updated.rows.length !== 1) stale('Opportunity')
    opportunity = updated.rows[0]!
  }

  let comment = request.comment !== undefined ? request.comment : current?.comment ?? null
  if (previousStatuses.has('CANCELED') && status !== 'CANCELED'
    && request.comment === undefined && generatedCancellationComment(comment)) {
    comment = null
  }
  const submission = current
    ? await updateSubmission(client, current.id, { status, comment })
    : await insertSubmission(client, opportunity as QueryResultRow, status, comment, now)
  if (pendingReportToDelete && opportunity) {
    const deletedReport = await client.query(
      'delete from public.non_submission_reports where id = $1 and opportunity_id = $2 returning id',
      [pendingReportToDelete, opportunity.id],
    )
    if (deletedReport.rows.length !== 1) stale('Non-submission report')
  }
  if (request.nonSubmissionReportId && opportunity) {
    const reviewed = await client.query(
      `update public.non_submission_reports
          set status = $1,
              reviewed_by = coalesce(
                (select username from public.users where auth_user_id = app_auth.request_account_id()),
                'System'
              ),
              reviewed_at = $2,
              review_note = $3
        where id = $4 and opportunity_id = $5
        returning id`,
      [
        status === 'NOT_SUBMITTED' ? 'APPROVED' : 'DECLINED',
        now.toISOString(),
        request.reviewNote ?? null,
        request.nonSubmissionReportId,
        opportunity.id,
      ],
    )
    if (reviewed.rows.length !== 1) stale('Non-submission report')
  }
  return { opportunity, submission }
}

async function edit(
  client: Queryable,
  request: WorkflowRequest,
  permissions: ReadonlySet<string>,
): Promise<WorkflowResult> {
  requirePermission(permissions, 'opportunity:edit')
  if ([...Object.keys(request.values)].some((key) => TRACKER_ASSIGNMENT_KEYS.has(key))
    || [...Object.keys(request.opportunityValues)].some((key) => ASSIGNMENT_KEYS.has(key))) {
    requirePermission(permissions, 'opportunity:assign')
  }
  if ([...Object.keys(request.values)].some((key) => TRACKER_FINANCIAL_KEYS.has(key))
    || [...Object.keys(request.opportunityValues)].some((key) => FINANCIAL_KEYS.has(key))) {
    requirePermission(permissions, 'admin:manageUsers')
  }
  const located = await locateForLinkedAction(client, request)
  if (!located.submission) throw new ApiError(404, 'not_found', 'BD submission not found.')
  if (located.opportunity && request.expectedOpportunityStatus === undefined) {
    throw new ApiError(400, 'invalid_request', 'Editing a linked tracker row requires expectedOpportunityStatus.')
  }
  assertExpectedStatus(located.opportunity ?? {}, request.expectedOpportunityStatus, 'Opportunity')
  assertExpectedStatus(located.submission, request.expectedSubmissionStatus, 'BD submission')
  if (!located.opportunity && Object.keys(request.opportunityValues).length > 0) {
    throw new ApiError(409, 'orphan_submission', 'This tracker row is not linked to an opportunity; only tracker fields can be repaired.')
  }

  let opportunity = located.opportunity
  if (opportunity && Object.keys(request.opportunityValues).length > 0) {
    const params: unknown[] = []
    const set = assignments(OPPORTUNITY_EDIT_COLUMNS, request.opportunityValues, params)
    if (opportunityScheduleChanged(opportunity, request.opportunityValues)) {
      set.push('notified_due_24h = false', 'notified_due_4h = false')
    }
    params.push(opportunity.id)
    const updated = await client.query(
      `update public.opportunities set ${set.join(', ')} where id = $${params.length} returning *`,
      params,
    )
    if (updated.rows.length !== 1) stale('Opportunity')
    opportunity = updated.rows[0]!
  }

  const trackerPatch = Object.fromEntries(
    Object.keys(request.values).map((key) => [TRACKER_EDIT_COLUMNS[key as keyof typeof TRACKER_EDIT_COLUMNS], request.values[key]]),
  )
  if (opportunity && Object.keys(request.opportunityValues).length > 0) {
    Object.assign(trackerPatch, await trackerSnapshot(client, opportunity, located.submission))
    // Explicit assignment repairs (including clearing an assignment) win over
    // the preservation fallback used by lifecycle-only transitions.
    for (const key of Object.keys(request.values)) {
      if (!TRACKER_ASSIGNMENT_KEYS.has(key)) continue
      trackerPatch[TRACKER_EDIT_COLUMNS[key as keyof typeof TRACKER_EDIT_COLUMNS]] = request.values[key]
    }
  }
  const submission = Object.keys(trackerPatch).length > 0
    ? await updateSubmission(client, located.submission.id, trackerPatch)
    : located.submission
  return { opportunity, submission }
}

async function deleteSubmission(client: Queryable, submission: QueryResultRow): Promise<QueryResultRow> {
  const result = await client.query(
    'delete from public.bd_submissions where id = $1 returning *',
    [submission.id],
  )
  if (result.rows.length !== 1) stale('BD submission')
  return result.rows[0]!
}

async function hardDelete(
  client: Queryable,
  request: WorkflowRequest,
  permissions: ReadonlySet<string>,
): Promise<WorkflowResult> {
  requirePermission(permissions, 'opportunity:deleteApprove')
  const located = await locateForLinkedAction(client, request)
  if (!located.submission) throw new ApiError(404, 'not_found', 'BD submission not found.')
  if (located.opportunity && request.expectedOpportunityStatus === undefined) {
    throw new ApiError(
      400,
      'invalid_request',
      'Deleting a linked tracker row requires expectedOpportunityStatus.',
    )
  }
  assertExpectedStatus(located.opportunity ?? {}, request.expectedOpportunityStatus, 'Opportunity')
  assertExpectedStatus(located.submission, request.expectedSubmissionStatus, 'BD submission')

  const submission = await deleteSubmission(client, located.submission)
  if (!located.opportunity) return { opportunity: null, submission }
  const deleted = await client.query(
    'delete from public.opportunities where id = $1 returning *',
    [located.opportunity.id],
  )
  if (deleted.rows.length !== 1) stale('Opportunity')
  return { opportunity: deleted.rows[0]!, submission }
}

async function returnToPipeline(
  client: Queryable,
  request: WorkflowRequest,
  permissions: ReadonlySet<string>,
): Promise<WorkflowResult> {
  requirePermission(permissions, 'opportunity:edit')
  const located = await locateForLinkedAction(client, request)
  if (!located.opportunity || !located.submission) {
    throw new ApiError(409, 'orphan_submission', 'The tracker row is not linked to an opportunity.')
  }
  assertExpectedStatus(located.opportunity, request.expectedOpportunityStatus, 'Opportunity')
  assertExpectedStatus(located.submission, request.expectedSubmissionStatus, 'BD submission')
  const previousStatuses = new Set([
    String(located.opportunity.status ?? ''),
    String(located.submission.status ?? ''),
  ].filter(Boolean))
  if (previousStatuses.has('CANCELED')) requirePermission(permissions, 'opportunity:cancel')
  const returningNonSubmission = previousStatuses.has('NOT_SUBMITTED') || previousStatuses.has('DROPPED')
  if (returningNonSubmission || request.nonSubmissionReportId !== undefined) {
    requirePermission(permissions, 'nonSubmission:review')
  }

  const opportunityReportId = typeof located.opportunity.non_submission_report_id === 'string'
    && located.opportunity.non_submission_report_id.trim()
    ? located.opportunity.non_submission_report_id.trim()
    : undefined
  if (request.nonSubmissionReportId && opportunityReportId
    && request.nonSubmissionReportId !== opportunityReportId) {
    stale('Non-submission report')
  }
  const nonSubmissionReportId = request.nonSubmissionReportId ?? opportunityReportId
  if (returningNonSubmission && !nonSubmissionReportId) {
    throw new ApiError(
      409,
      'unreconcilable_report',
      'The non-submission outcome is not linked to its report. Repair the link before returning it.',
    )
  }

  if (nonSubmissionReportId) {
    const report = await client.query(
      `select id from public.non_submission_reports
        where id = $1 and opportunity_id = $2
        for update`,
      [nonSubmissionReportId, located.opportunity.id],
    )
    if (report.rows.length !== 1) stale('Non-submission report')
  }

  const submission = await deleteSubmission(client, located.submission)
  const values: unknown[] = [request.targetOpportunityStatus]
  let exemptAssignment = ''
  if (request.nonSubmissionExempt !== undefined) {
    values.push(request.nonSubmissionExempt)
    exemptAssignment = `, non_submission_exempt = $${values.length}`
  }
  values.push(located.opportunity.id)
  const updated = await client.query(
    `update public.opportunities
        set status = $1, submitted_at = null, non_submission_report_id = null${exemptAssignment}
      where id = $${values.length}
      returning *`,
    values,
  )
  if (updated.rows.length !== 1) stale('Opportunity')

  if (nonSubmissionReportId) {
    const deletedReport = await client.query(
      'delete from public.non_submission_reports where id = $1 and opportunity_id = $2 returning id',
      [nonSubmissionReportId, located.opportunity.id],
    )
    if (deletedReport.rows.length !== 1) stale('Non-submission report')
  }
  return { opportunity: updated.rows[0]!, submission }
}

export async function executeOpportunityWorkflow(
  client: Queryable,
  body: unknown,
  now: Date,
): Promise<WorkflowResult> {
  const request = parseRequest(body)
  const permissions = await effectivePermissions(client)
  if (request.action === 'submit') return submit(client, request, permissions, now)
  if (request.action === 'transition') return transition(client, request, permissions, now)
  if (request.action === 'edit') return edit(client, request, permissions)
  if (request.action === 'delete') return hardDelete(client, request, permissions)
  return returnToPipeline(client, request, permissions)
}

function pgError(error: unknown): never {
  if (error instanceof ApiError) throw error
  const code = (error as { code?: unknown }).code
  if (code === '23505') throw new ApiError(409, 'workflow_conflict', 'A conflicting workflow record already exists.')
  if (code === '42501') throw new ApiError(403, 'forbidden', 'You do not have permission to perform this workflow action.')
  if (code === '23503') throw new ApiError(409, 'workflow_conflict', 'A related workflow record changed.')
  if (code === '22P02' || code === '23502' || code === '23514') {
    throw new ApiError(400, 'invalid_request', 'One or more workflow values are not valid.')
  }
  throw error
}

export function registerOpportunityWorkflowRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/opportunity-workflows',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      try {
        const result = await asAuthenticatedUser(
          dependencies.db,
          request.auth?.accountId as string,
          (client) => executeOpportunityWorkflow(client, request.body, dependencies.now()),
        )
        return { data: result, error: null }
      } catch (error) {
        pgError(error)
      }
    },
  )
}

export const __test = { parseRequest, generatedCancellationComment }
