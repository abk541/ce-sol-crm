import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { asAuthenticatedUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import { requireCompleted } from './auth.js'
import type { Dependencies } from './types.js'

export const ALLOWED_TABLES = new Set([
  'activity_logs',
  'app_settings',
  'bd_submissions',
  'comments',
  'contract_invoices',
  'contract_line_items',
  'contract_pocs',
  'contract_vehicle_orders',
  'contracts',
  'deletion_requests',
  'employee_requests',
  'employees',
  'fresh_awards',
  'government_warnings',
  'locked_subcontractors',
  'non_submission_reports',
  'notifications',
  'opportunities',
  'past_performances',
  'role_permission_overrides',
  'subcontractors',
  'subk_database',
  'user_permission_overrides',
  'users',
])

const SAFE_USER_COLUMNS = [
  'id', 'auth_user_id', 'name', 'email', 'username', 'role', 'avatar',
  'status', 'first_login', 'mfa_enabled', 'created_at', 'team', 'manager_id',
] as const

const ALLOWED_APP_SETTING_KEYS = [
  'non_sub_grace_hours',
  'non_sub_grace_minutes',
  'require_associate_for_active_pipeline',
] as const

const OPPORTUNITY_PERMISSION_FIELDS = {
  'opportunity:editSchedule': new Set([
    'due_date',
    'local_time',
    'timezone',
    'morocco_time',
    'morocco_date',
    'mandatory_events_list',
    // Deadline flags are schedule bookkeeping written by the app shell.
    'notified_due_24h',
    'notified_due_4h',
  ]),
  'sourcing:write': new Set(['quoted']),
  'opportunity:submitProposal': new Set([
    'status',
    'submitted_at',
    'contract_amount',
    'base_amount',
    'monthly_payment',
    'proposals',
    'assigned_opportunities',
    'proposal_attachments',
  ]),
  'opportunity:assign': new Set(['assigned_to', 'bdm', 'bds', 'support_agent']),
  'opportunity:deleteRequest': new Set(['deletion_requested']),
  'opportunity:deleteApprove': new Set(['is_deleted', 'deletion_requested']),
  'nonSubmission:submit': new Set(['non_submission_report_id']),
  'nonSubmission:review': new Set([
    'status',
    'non_submission_report_id',
    'non_submission_exempt',
  ]),
} as const

const OPPORTUNITY_FULL_WRITE_PERMISSIONS = new Set([
  'admin:manageUsers',
  'opportunity:edit',
])

const OPPORTUNITY_CREATE_PERMISSIONS = new Set([
  'admin:manageUsers',
  'opportunity:create',
])

const DESTRUCTIVE_DELETE_PERMISSIONS = new Set([
  'admin:manageUsers',
  'opportunity:deleteApprove',
])

const OPPORTUNITY_NUMERIC_COLUMNS = new Set([
  'contract_amount',
  'base_amount',
  'monthly_payment',
  'value',
])

const OPPORTUNITY_FINANCIAL_COLUMNS = new Set([
  'contract_amount',
  'base_amount',
  'monthly_payment',
  'value',
])

const OPPORTUNITY_TIMESTAMP_COLUMNS = new Set([
  'submitted_at',
  'created_at',
])

const OPPORTUNITY_EMPTY_ARRAY_COLUMNS = new Set([
  'proposals',
  'assigned_opportunities',
  'proposal_attachments',
  'sam_gov_contacts',
])

// Generic CRUD is still used for ordinary opportunity edits and assignment
// normalization. Every status that also creates, changes, or removes a BD
// Tracker row must go through /opportunity-workflows so both records commit in
// one transaction. ACTIVE <-> NEW_ASSIGNMENT is the sole generic exception.
const GENERIC_OPPORTUNITY_STATUSES = new Set(['ACTIVE', 'NEW_ASSIGNMENT'])

const GENERIC_NON_SUBMISSION_EDIT_COLUMNS = new Set([
  'reason',
  'comments',
  'last_reminder_at',
  'reason_edited_at',
])

const NON_SUBMISSION_REVIEW_COLUMNS = new Set([
  'status',
  'reviewed_by',
  'reviewed_at',
  'review_note',
])

const NON_SUBMISSION_WRITE_PERMISSIONS = new Set([
  'admin:manageUsers',
  'nonSubmission:submit',
  'nonSubmission:review',
])

const SOURCING_WRITE_PERMISSIONS = new Set([
  'admin:manageUsers',
  'sourcing:write',
])

const OPPORTUNITY_NOOP_WRITE_PERMISSIONS = new Set([
  ...OPPORTUNITY_FULL_WRITE_PERMISSIONS,
  ...Object.keys(OPPORTUNITY_PERMISSION_FIELDS),
  'opportunity:cancel',
  'opportunity:comment',
])

const OPPORTUNITY_PERMISSION_NAMES = [
  ...new Set([
    ...OPPORTUNITY_CREATE_PERMISSIONS,
    ...OPPORTUNITY_NOOP_WRITE_PERMISSIONS,
  ]),
]

type FilterOperator = 'eq' | 'neq' | 'ilike' | 'is' | 'not.is' | 'in'

interface Filter {
  column: string
  operator: FilterOperator
  value: unknown
}

interface Order {
  column: string
  ascending: boolean
}

interface CommonRequest {
  table: string
  columns: string[] | '*'
  filters: Filter[]
  orGroups: Filter[][]
  order: Order[]
  limit?: number
  single: boolean
  maybeSingle: boolean
  count: boolean
  head: boolean
}

const COMMON_KEYS = [
  'table',
  'columns',
  'filters',
  'orGroups',
  'order',
  'limit',
  'single',
  'maybeSingle',
  'count',
  'head',
] as const

// node-postgres treats JavaScript arrays as PostgreSQL arrays. JSON/JSONB
// columns must instead receive serialized JSON, otherwise attachment arrays
// fail at runtime with 22P02 (invalid input syntax for type json).
const JSON_COLUMNS = new Map<string, ReadonlySet<string>>([
  ['contract_invoices', new Set(['line_item_ids'])],
  ['contract_vehicle_orders', new Set(['document'])],
  ['contracts', new Set(['proposal_attachments', 'comms_log'])],
  ['employee_requests', new Set(['attachments'])],
  ['fresh_awards', new Set(['proposal_attachments'])],
  ['non_submission_reports', new Set(['comments'])],
  ['opportunities', new Set(['proposal_attachments', 'mandatory_events_list', 'sam_gov_contacts'])],
  ['role_permission_overrides', new Set(['permissions'])],
  ['subcontractors', new Set(['quote_files', 'contacts'])],
  ['user_permission_overrides', new Set(['grants', 'revokes'])],
])

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function pushColumnParameter(
  values: unknown[],
  table: string,
  column: string,
  value: unknown,
): string {
  const jsonValue = JSON_COLUMNS.get(table)?.has(column) === true
  values.push(jsonValue && value !== null ? JSON.stringify(value) : value)
  return `$${values.length}${jsonValue ? '::jsonb' : ''}`
}

function bool(value: unknown, label: string): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new ApiError(400, 'invalid_request', `${label} must be boolean.`)
  return value
}

function parseFilters(value: unknown, label = 'filters'): Filter[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 50) {
    throw new ApiError(400, 'invalid_request', `${label} must be an array of at most 50 filters.`)
  }
  return value.map((entry, index) => {
    const filter = asRecord(entry, `${label}[${index}]`)
    assertAllowedKeys(filter, ['column', 'operator', 'value'], `${label}[${index}]`)
    const column = requiredString(filter.column, `${label}[${index}].column`, 63)
    const operator = requiredString(filter.operator, `${label}[${index}].operator`, 16) as FilterOperator
    if (!['eq', 'neq', 'ilike', 'is', 'not.is', 'in'].includes(operator)) {
      throw new ApiError(400, 'invalid_request', `${label}[${index}].operator is not supported.`)
    }
    return { column, operator, value: filter.value }
  })
}

function parseCommon(value: unknown, additionalKeys: readonly string[] = []): CommonRequest & Record<string, unknown> {
  const body = asRecord(value)
  assertAllowedKeys(body, [...COMMON_KEYS, ...additionalKeys])
  const table = requiredString(body.table, 'table', 63)
  if (!ALLOWED_TABLES.has(table)) {
    throw new ApiError(400, 'table_not_allowed', 'This table is not available through the application API.')
  }

  let columns: string[] | '*' = '*'
  if (body.columns !== undefined && body.columns !== '*') {
    const rawColumns = typeof body.columns === 'string'
      ? body.columns.split(',').map((column) => column.trim()).filter(Boolean)
      : body.columns
    if (!Array.isArray(rawColumns) || rawColumns.length === 0 || rawColumns.length > 200) {
      throw new ApiError(400, 'invalid_request', 'columns must be "*", a comma list, or a string array.')
    }
    columns = rawColumns.map((column, index) => requiredString(column, `columns[${index}]`, 63))
  }

  const filters = parseFilters(body.filters)
  let orGroups: Filter[][] = []
  if (body.orGroups !== undefined) {
    if (!Array.isArray(body.orGroups) || body.orGroups.length > 10) {
      throw new ApiError(400, 'invalid_request', 'orGroups must be an array of at most 10 groups.')
    }
    orGroups = body.orGroups.map((group, index) => parseFilters(group, `orGroups[${index}]`))
    if (orGroups.some((group) => group.length === 0)) {
      throw new ApiError(400, 'invalid_request', 'orGroups cannot contain an empty group.')
    }
  }

  let order: Order[] = []
  if (body.order !== undefined) {
    if (!Array.isArray(body.order) || body.order.length > 10) {
      throw new ApiError(400, 'invalid_request', 'order must be an array of at most 10 entries.')
    }
    order = body.order.map((entry, index) => {
      const parsed = asRecord(entry, `order[${index}]`)
      assertAllowedKeys(parsed, ['column', 'ascending'], `order[${index}]`)
      if (parsed.ascending !== undefined && typeof parsed.ascending !== 'boolean') {
        throw new ApiError(400, 'invalid_request', `order[${index}].ascending must be boolean.`)
      }
      return {
        column: requiredString(parsed.column, `order[${index}].column`, 63),
        ascending: parsed.ascending !== false,
      }
    })
  }

  let limit: number | undefined
  if (body.limit !== undefined) {
    if (!Number.isSafeInteger(body.limit) || Number(body.limit) < 0 || Number(body.limit) > 10_000) {
      throw new ApiError(400, 'invalid_request', 'limit must be an integer from 0 to 10000.')
    }
    limit = Number(body.limit)
  }

  const single = bool(body.single, 'single')
  const maybeSingle = bool(body.maybeSingle, 'maybeSingle')
  if (single && maybeSingle) throw new ApiError(400, 'invalid_request', 'single and maybeSingle are mutually exclusive.')

  return {
    ...body,
    table,
    columns,
    filters,
    orGroups,
    order,
    ...(limit === undefined ? {} : { limit }),
    single,
    maybeSingle,
    count: body.count === 'exact' || body.count === true,
    head: bool(body.head, 'head'),
  }
}

async function tableColumns(client: Queryable, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  )
  if (result.rows.length === 0) {
    // Keep the compatibility code consumed by the SPA's optional-table path,
    // without allowing a caller to probe outside the fixed table allowlist.
    throw new ApiError(400, '42P01', `relation "public.${table}" does not exist`)
  }
  return new Set(result.rows.map((row) => row.column_name))
}

function assertColumnsExist(columns: Iterable<string>, allowed: ReadonlySet<string>, table: string): void {
  for (const column of columns) {
    if (!allowed.has(column)) {
      // The frontend deliberately understands PostgREST's schema-cache error
      // so it can strip optional columns while databases are upgraded.
      throw new ApiError(
        400,
        'PGRST204',
        `Could not find the '${column}' column of '${table}' in the schema cache.`,
      )
    }
  }
}

function filterSql(filter: Filter, values: unknown[]): string {
  const column = quoted(filter.column)
  switch (filter.operator) {
    case 'eq':
      if (filter.value === null) return `${column} is null`
      values.push(filter.value)
      return `${column} = $${values.length}`
    case 'neq':
      if (filter.value === null) return `${column} is not null`
      values.push(filter.value)
      return `${column} <> $${values.length}`
    case 'ilike':
      if (typeof filter.value !== 'string') throw new ApiError(400, 'invalid_request', 'ilike requires a string.')
      values.push(filter.value)
      return `${column} ilike $${values.length}`
    case 'is':
    case 'not.is': {
      const isNot = filter.operator === 'not.is' ? ' not' : ''
      if (filter.value === null) return `${column} is${isNot} null`
      if (filter.value === true) return `${column} is${isNot} true`
      if (filter.value === false) return `${column} is${isNot} false`
      throw new ApiError(400, 'invalid_request', `${filter.operator} accepts only null or boolean.`)
    }
    case 'in': {
      if (!Array.isArray(filter.value) || filter.value.length === 0 || filter.value.length > 1000) {
        throw new ApiError(400, 'invalid_request', 'in requires a non-empty array of at most 1000 values.')
      }
      const placeholders = filter.value.map((value) => {
        values.push(value)
        return `$${values.length}`
      })
      return `${column} in (${placeholders.join(', ')})`
    }
  }
}

function whereSql(common: CommonRequest, values: unknown[]): string {
  const clauses = common.filters.map((filter) => filterSql(filter, values))
  for (const group of common.orGroups) {
    clauses.push(`(${group.map((filter) => filterSql(filter, values)).join(' or ')})`)
  }
  return clauses.length > 0 ? ` where ${clauses.join(' and ')}` : ''
}

function validateCommonColumns(common: CommonRequest, available: Set<string>): void {
  if (common.columns !== '*') assertColumnsExist(common.columns, available, common.table)
  assertColumnsExist(common.filters.map((filter) => filter.column), available, common.table)
  assertColumnsExist(common.orGroups.flat().map((filter) => filter.column), available, common.table)
  assertColumnsExist(common.order.map((entry) => entry.column), available, common.table)
}

function shapeRows(rows: QueryResultRow[], common: CommonRequest): unknown {
  if (common.single) {
    if (rows.length !== 1) {
      throw new ApiError(406, 'PGRST116', 'JSON object requested, but the result contains a different number of rows.')
    }
    return rows[0]
  }
  if (common.maybeSingle) {
    if (rows.length > 1) {
      throw new ApiError(406, 'PGRST116', 'JSON object requested, but the result contains more than one row.')
    }
    return rows[0] ?? null
  }
  return rows
}

function pgError(error: unknown): never {
  const candidate = error as { code?: unknown; detail?: unknown; constraint?: unknown }
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  if (code === '23505') {
    throw new ApiError(409, code, 'A record with the same unique value already exists.', candidate.detail ?? null)
  }
  if (code === '23503') {
    throw new ApiError(409, code, 'This change conflicts with a related record.', candidate.detail ?? null)
  }
  if (code === '42501') throw new ApiError(403, code, 'You do not have permission to perform this operation.')
  if (code === '23514' || code === '23502' || code === '22P02') {
    throw new ApiError(400, code, 'The supplied data is not valid for this table.', candidate.detail ?? null)
  }
  throw error
}

function withAppSettingsScope<T extends CommonRequest>(common: T): T {
  if (common.table !== 'app_settings') return common
  return {
    ...common,
    filters: [
      ...common.filters,
      { column: 'key', operator: 'in', value: [...ALLOWED_APP_SETTING_KEYS] },
    ],
  }
}

function assertAllowedAppSettingKey(value: unknown): void {
  if (typeof value !== 'string' || !(ALLOWED_APP_SETTING_KEYS as readonly string[]).includes(value)) {
    throw new ApiError(403, 'setting_not_allowed', 'This application setting is not available through the browser API.')
  }
}

function assertAppSettingsRows(table: string, rows: readonly Record<string, unknown>[]): void {
  if (table !== 'app_settings') return
  for (const row of rows) assertAllowedAppSettingKey(row.key)
}

function stableComparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableComparable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableComparable(entry)]),
    )
  }
  return value
}

function valuesMatch(column: string, left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (OPPORTUNITY_EMPTY_ARRAY_COLUMNS.has(column)) {
    const leftEmpty = left == null || (Array.isArray(left) && left.length === 0)
    const rightEmpty = right == null || (Array.isArray(right) && right.length === 0)
    if (leftEmpty && rightEmpty) return true
  }
  if (OPPORTUNITY_NUMERIC_COLUMNS.has(column) && (
    (typeof left === 'number' && typeof right === 'string')
    || (typeof left === 'string' && typeof right === 'number')
  )) {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber) return true
  }
  if (OPPORTUNITY_TIMESTAMP_COLUMNS.has(column)) {
    const leftTimestamp = left instanceof Date ? left.getTime() : typeof left === 'string' ? Date.parse(left) : Number.NaN
    const rightTimestamp = right instanceof Date ? right.getTime() : typeof right === 'string' ? Date.parse(right) : Number.NaN
    if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp === rightTimestamp) return true
  }
  return JSON.stringify(stableComparable(left)) === JSON.stringify(stableComparable(right))
}

function changedColumns(
  existing: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): Set<string> {
  return new Set(
    Object.keys(incoming).filter((column) => column !== 'id' && !valuesMatch(column, existing[column], incoming[column])),
  )
}

function hasAnyPermission(permissions: ReadonlySet<string>, required: ReadonlySet<string>): boolean {
  for (const permission of required) {
    if (permissions.has(permission)) return true
  }
  return false
}

function assertOpportunityFieldAuthorization(
  changed: ReadonlySet<string>,
  permissions: ReadonlySet<string>,
  incoming?: Readonly<Record<string, unknown>>,
  existing?: Readonly<Record<string, unknown>>,
): void {
  if (changed.has('status')) {
    const previousStatus = existing?.status
    const nextStatus = incoming?.status
    const assignmentNormalization = typeof previousStatus === 'string'
      && typeof nextStatus === 'string'
      && GENERIC_OPPORTUNITY_STATUSES.has(previousStatus)
      && GENERIC_OPPORTUNITY_STATUSES.has(nextStatus)
    if (!assignmentNormalization) {
      throw new ApiError(
        403,
        'workflow_required',
        'Opportunity lifecycle changes must use the atomic opportunity workflow API.',
      )
    }
  }
  if ([...changed].some((column) => OPPORTUNITY_FINANCIAL_COLUMNS.has(column))
    && !permissions.has('admin:manageUsers')) {
    throw new ApiError(
      403,
      'forbidden_opportunity_financial_fields',
      'Only an Admin can change contract dollar amounts.',
    )
  }
  if (hasAnyPermission(permissions, OPPORTUNITY_FULL_WRITE_PERMISSIONS)) return
  if (changed.size === 0 && hasAnyPermission(permissions, OPPORTUNITY_NOOP_WRITE_PERMISSIONS)) return

  const allowed = new Set<string>()
  for (const [permission, fields] of Object.entries(OPPORTUNITY_PERMISSION_FIELDS)) {
    if (!permissions.has(permission)) continue
    for (const field of fields) allowed.add(field)
  }
  const denied = [...changed].filter((column) => !allowed.has(column))
  if (denied.length > 0 || changed.size === 0) {
    throw new ApiError(
      403,
      'forbidden_opportunity_fields',
      'You do not have permission to change one or more opportunity fields.',
    )
  }
}

function assertGenericOpportunityCreateStatus(row: Readonly<Record<string, unknown>>): void {
  if (row.status === undefined || GENERIC_OPPORTUNITY_STATUSES.has(String(row.status))) return
  throw new ApiError(
    403,
    'workflow_required',
    'New opportunities created through the generic data API must start in the active pipeline.',
  )
}

async function effectiveOpportunityPermissions(client: Queryable): Promise<Set<string>> {
  const result = await client.query<{ permission: string; allowed: boolean }>(
    `select requested.permission,
            private.has_permission(requested.permission) as allowed
       from unnest($1::text[]) as requested(permission)`,
    [OPPORTUNITY_PERMISSION_NAMES],
  )
  return new Set(result.rows.filter((row) => row.allowed).map((row) => row.permission))
}

async function requireAnyDataPermission(
  client: Queryable,
  required: ReadonlySet<string>,
  message: string,
): Promise<void> {
  const permissions = await effectiveOpportunityPermissions(client)
  if (!hasAnyPermission(permissions, required)) {
    throw new ApiError(403, 'forbidden', message)
  }
}

function quoteBackedOpportunityIds(rows: readonly Record<string, unknown>[]): string[] {
  const ids = rows.flatMap((row, index) => {
    const legacyQuote = typeof row.quote_file === 'string' && row.quote_file.trim() !== ''
    const quoteFiles = Array.isArray(row.quote_files) && row.quote_files.length > 0
    if (!legacyQuote && !quoteFiles) return []
    return [requiredString(row.opportunity_id, `rows[${index}].opportunity_id`, 128)]
  })
  return [...new Set(ids)]
}

async function markQuotedOpportunities(
  client: Queryable,
  opportunityIds: readonly string[],
): Promise<void> {
  if (opportunityIds.length === 0) return
  const result = await client.query<{ id: string }>(
    `update public.opportunities
        set quoted = true
      where id::text = any($1::text[])
      returning id::text as id`,
    [opportunityIds],
  )
  const updated = new Set(result.rows.map((row) => row.id))
  if (opportunityIds.some((id) => !updated.has(id))) {
    throw new ApiError(
      409,
      'stale_opportunity',
      'A sourcing quote could not be linked to its opportunity. Reload and try again.',
    )
  }
}

async function authorizeOpportunityRows(
  client: Queryable,
  rows: readonly Record<string, unknown>[],
  upsert: boolean,
  conflictColumns: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (!rows.length) return new Map()
  const permissions = await effectiveOpportunityPermissions(client)
  if (!upsert) {
    if (!hasAnyPermission(permissions, OPPORTUNITY_CREATE_PERMISSIONS)) {
      throw new ApiError(403, 'forbidden', 'You do not have permission to create opportunities.')
    }
    rows.forEach(assertGenericOpportunityCreateStatus)
    return new Map()
  }
  if (conflictColumns.length !== 1 || conflictColumns[0] !== 'id') {
    throw new ApiError(400, 'invalid_request', 'Opportunity upserts must use id as the conflict column.')
  }

  const ids = rows.map((row, index) => requiredString(row.id, `rows[${index}].id`, 128))
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, 'invalid_request', 'An opportunity batch cannot contain duplicate ids.')
  }
  const existingResult = await client.query<{ id: string; snapshot: Record<string, unknown> }>(
    `select opportunity.id::text as id, to_jsonb(opportunity) as snapshot
       from public.opportunities opportunity
      where opportunity.id::text = any($1::text[])
      for update`,
    [ids],
  )
  const existingById = new Map(existingResult.rows.map((row) => [row.id, row.snapshot]))
  for (const [index, row] of rows.entries()) {
    const id = ids[index] as string
    const existing = existingById.get(id)
    if (!existing) {
      if (!hasAnyPermission(permissions, OPPORTUNITY_CREATE_PERMISSIONS)) {
        throw new ApiError(403, 'forbidden', 'You do not have permission to create opportunities.')
      }
      assertGenericOpportunityCreateStatus(row)
      continue
    }
    assertOpportunityFieldAuthorization(changedColumns(existing, row), permissions, row, existing)
  }
  return existingById
}

function assertNewNonSubmissionReport(row: Readonly<Record<string, unknown>>): void {
  const reviewedValuePresent = [...NON_SUBMISSION_REVIEW_COLUMNS].some((column) => {
    const value = row[column]
    if (column === 'status') return value !== undefined && value !== 'PENDING'
    return value !== undefined && value !== null && value !== ''
  })
  if (reviewedValuePresent) {
    throw new ApiError(
      403,
      'workflow_required',
      'Non-submission review lifecycle changes must use the atomic opportunity workflow API.',
    )
  }
}

async function authorizeNonSubmissionRows(
  client: Queryable,
  rows: readonly Record<string, unknown>[],
  upsert: boolean,
  conflictColumns: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  const permissions = await effectiveOpportunityPermissions(client)
  if (!hasAnyPermission(permissions, NON_SUBMISSION_WRITE_PERMISSIONS)) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to create or edit non-submission reports.')
  }
  if (!upsert) {
    rows.forEach(assertNewNonSubmissionReport)
    return new Map()
  }
  if (conflictColumns.length !== 1 || conflictColumns[0] !== 'id') {
    throw new ApiError(400, 'invalid_request', 'Non-submission report upserts must use id as the conflict column.')
  }
  const ids = rows.map((row, index) => requiredString(row.id, `rows[${index}].id`, 200))
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, 'invalid_request', 'A non-submission report batch cannot contain duplicate ids.')
  }
  const existing = await client.query<{ id: string; snapshot: Record<string, unknown> }>(
    `select report.id::text as id, to_jsonb(report) as snapshot
       from public.non_submission_reports report
      where report.id::text = any($1::text[])
      for update`,
    [ids],
  )
  const existingById = new Map(existing.rows.map((row) => [row.id, row.snapshot]))
  rows.forEach((row, index) => {
    const snapshot = existingById.get(ids[index] as string)
    if (!snapshot) {
      assertNewNonSubmissionReport(row)
      return
    }
    const denied = [...changedColumns(snapshot, row)]
      .filter((column) => !GENERIC_NON_SUBMISSION_EDIT_COLUMNS.has(column))
    if (denied.length > 0) {
      throw new ApiError(
        403,
        'workflow_required',
        'Non-submission review lifecycle changes must use the atomic opportunity workflow API.',
      )
    }
  })
  return existingById
}

async function upsertNonSubmissionData(
  client: Queryable,
  common: CommonRequest & Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
  existingById: ReadonlyMap<string, Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const returning = common.head
    ? ''
    : ` returning ${common.columns === '*' ? '*' : common.columns.map(quoted).join(', ')}`
  const returnedRows: QueryResultRow[] = []
  const newRows: Record<string, unknown>[] = []
  const ignoreDuplicates = common.ignoreDuplicates === true
  let affected = 0

  for (const row of rows) {
    const existing = existingById.get(String(row.id))
    if (!existing) {
      newRows.push(row)
      continue
    }
    if (ignoreDuplicates) continue
    const changed = changedColumns(existing, row)
    const updateColumns = keys.filter((key) => key !== 'id' && changed.has(key))
    if (updateColumns.length === 0) {
      if (!common.head) {
        returnedRows.push(common.columns === '*'
          ? { ...existing }
          : Object.fromEntries(common.columns.map((column) => [column, existing[column]])))
      }
      affected += 1
      continue
    }
    const values: unknown[] = []
    const assignments = updateColumns.map((column) => (
      `${quoted(column)} = ${pushColumnParameter(values, common.table, column, row[column])}`
    ))
    values.push(row.id)
    const result = await client.query<QueryResultRow>(
      `update public.non_submission_reports set ${assignments.join(', ')} where id = $${values.length}${returning}`,
      values,
    )
    if ((result.rowCount ?? 0) !== 1) {
      throw new ApiError(409, 'stale_report', 'The non-submission report changed. Reload it and try again.')
    }
    returnedRows.push(...result.rows)
    affected += result.rowCount ?? 0
  }

  if (newRows.length > 0) {
    const values: unknown[] = []
    const tuples = newRows.map((row) => `(${keys.map((key) => {
      return pushColumnParameter(values, common.table, key, row[key])
    }).join(', ')})`)
    const result = await client.query<QueryResultRow>(
      `insert into public.non_submission_reports (${keys.map(quoted).join(', ')}) values ${tuples.join(', ')} on conflict ("id") do nothing${returning}`,
      values,
    )
    if (!ignoreDuplicates && (result.rowCount ?? 0) !== newRows.length) {
      throw new ApiError(409, '23505', 'A non-submission report changed while it was being saved. Reload and try again.')
    }
    returnedRows.push(...result.rows)
    affected += result.rowCount ?? 0
  }

  return {
    data: common.head ? null : shapeRows(returnedRows, common),
    ...(common.count ? { count: affected } : {}),
    error: null,
  }
}

async function upsertOpportunityData(
  client: Queryable,
  common: CommonRequest & Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
  conflictColumns: readonly string[],
  existingById: ReadonlyMap<string, Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const returning = common.head
    ? ''
    : ` returning ${common.columns === '*' ? '*' : common.columns.map(quoted).join(', ')}`
  const returnedRows: QueryResultRow[] = []
  let affected = 0
  const ignoreDuplicates = common.ignoreDuplicates === true
  const updateColumns = keys.filter((key) => !conflictColumns.includes(key))
  const newRows: Record<string, unknown>[] = []

  for (const row of rows) {
    const id = String(row.id)
    const existing = existingById.get(id)
    if (!existing) {
      newRows.push(row)
      continue
    }
    if (ignoreDuplicates || updateColumns.length === 0) continue

    const changed = changedColumns(existing, row)
    const rowUpdateColumns = keys.filter((key) => changed.has(key))
    if (rowUpdateColumns.length === 0) {
      if (!common.head) {
        returnedRows.push(common.columns === '*'
          ? { ...existing }
          : Object.fromEntries(common.columns.map((column) => [column, existing[column]])))
      }
      affected += 1
      continue
    }

    const values: unknown[] = []
    const assignments = rowUpdateColumns.map((key) => (
      `${quoted(key)} = ${pushColumnParameter(values, common.table, key, row[key])}`
    ))
    values.push(row.id)
    const result = await client.query<QueryResultRow>(
      `update public.opportunities set ${assignments.join(', ')} where "id" = $${values.length}${returning}`,
      values,
    )
    if ((result.rowCount ?? 0) !== 1) {
      throw new ApiError(
        409,
        'stale_opportunity',
        'The opportunity changed or is no longer writable. Reload it and try again.',
      )
    }
    returnedRows.push(...result.rows)
    affected += result.rowCount ?? 0
  }

  if (newRows.length > 0) {
    const values: unknown[] = []
    const tuples = newRows.map((row) => `(${keys.map((key) => {
      return pushColumnParameter(values, common.table, key, row[key])
    }).join(', ')})`)
    const conflict = ` on conflict (${conflictColumns.map(quoted).join(', ')}) do nothing`
    const result = await client.query<QueryResultRow>(
      `insert into public.opportunities (${keys.map(quoted).join(', ')}) values ${tuples.join(', ')}${conflict}${returning}`,
      values,
    )
    if (!ignoreDuplicates && (result.rowCount ?? 0) !== newRows.length) {
      throw new ApiError(
        409,
        '23505',
        'An opportunity changed while it was being saved. Reload it and try again.',
      )
    }
    returnedRows.push(...result.rows)
    affected += result.rowCount ?? 0
  }

  return {
    data: common.head ? null : shapeRows(returnedRows, common),
    ...(common.count ? { count: affected } : {}),
    error: null,
  }
}

async function queryData(client: Queryable, common: CommonRequest): Promise<Record<string, unknown>> {
  common = withAppSettingsScope(common)
  const available = await tableColumns(client, common.table)
  validateCommonColumns(common, available)
  const values: unknown[] = []
  const where = whereSql(common, values)
  let count: number | undefined
  if (common.count) {
    const countResult = await client.query<{ count: string }>(
      `select count(*)::text as count from public.${quoted(common.table)}${where}`,
      values,
    )
    count = Number(countResult.rows[0]?.count ?? 0)
  }
  if (common.head) return { data: null, count, error: null }

  // public.users retains null legacy credential columns only for historical
  // schema compatibility. Never let a wildcard project those columns even if
  // a future grant is accidentally broadened.
  const select = common.columns === '*'
    ? common.table === 'users' ? SAFE_USER_COLUMNS.map(quoted).join(', ') : '*'
    : common.columns.map(quoted).join(', ')
  const order = common.order.length > 0
    ? ` order by ${common.order.map((entry) => `${quoted(entry.column)} ${entry.ascending ? 'asc' : 'desc'}`).join(', ')}`
    : ''
  const limit = common.limit === undefined ? '' : ` limit ${common.limit}`
  const result = await client.query(`select ${select} from public.${quoted(common.table)}${where}${order}${limit}`, values)
  return { data: shapeRows(result.rows, common), ...(count === undefined ? {} : { count }), error: null }
}

function parseRows(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : [value]
  if (list.length === 0 || list.length > 1000) {
    throw new ApiError(400, 'invalid_request', 'rows must contain between 1 and 1000 objects.')
  }
  const rows = list.map((row, index) => asRecord(row, `rows[${index}]`))
  const keys = Object.keys(rows[0] as Record<string, unknown>).sort()
  if (keys.length === 0) throw new ApiError(400, 'invalid_request', 'rows cannot contain empty objects.')
  if (rows.some((row) => Object.keys(row).sort().join('\0') !== keys.join('\0'))) {
    throw new ApiError(400, 'invalid_request', 'Every row in a batch must contain the same fields.')
  }
  return rows
}

async function insertData(
  client: Queryable,
  common: CommonRequest & Record<string, unknown>,
  upsert: boolean,
): Promise<Record<string, unknown>> {
  const rows = parseRows(common.rows)
  const available = await tableColumns(client, common.table)
  validateCommonColumns(common, available)
  const keys = Object.keys(rows[0] as Record<string, unknown>).sort()
  assertColumnsExist(keys, available, common.table)
  assertAppSettingsRows(common.table, rows)

  let quotedOpportunityIds: string[] = []
  if (common.table === 'subcontractors') {
    await requireAnyDataPermission(
      client,
      SOURCING_WRITE_PERMISSIONS,
      'You do not have permission to update sourcing.',
    )
    quotedOpportunityIds = quoteBackedOpportunityIds(rows)
  }

  let conflictColumns: string[] = []
  if (upsert) {
    const raw = common.onConflict
    conflictColumns = typeof raw === 'string'
      ? raw.split(',').map((column) => column.trim()).filter(Boolean)
      : Array.isArray(raw) ? raw.map((column) => requiredString(column, 'onConflict', 63)) : []
    if (conflictColumns.length === 0 && available.has('id')) conflictColumns = ['id']
    if (conflictColumns.length === 0) {
      throw new ApiError(400, 'invalid_request', 'onConflict is required when a table has no id column.')
    }
    assertColumnsExist(conflictColumns, available, common.table)
  }

  let existingOpportunities = new Map<string, Record<string, unknown>>()
  if (common.table === 'non_submission_reports') {
    const existingReports = await authorizeNonSubmissionRows(client, rows, upsert, conflictColumns)
    if (upsert) {
      return upsertNonSubmissionData(client, common, rows, keys, existingReports)
    }
  }
  if (common.table === 'opportunities') {
    existingOpportunities = await authorizeOpportunityRows(client, rows, upsert, conflictColumns)
    if (upsert) {
      return upsertOpportunityData(client, common, rows, keys, conflictColumns, existingOpportunities)
    }
  }

  const values: unknown[] = []
  const tuples = rows.map((row) => `(${keys.map((key) => {
    return pushColumnParameter(values, common.table, key, row[key])
  }).join(', ')})`)
  let conflict = ''
  if (upsert) {
    const ignoreDuplicates = common.ignoreDuplicates === true
    const updateColumns = keys.filter((key) => !conflictColumns.includes(key))
    conflict = ` on conflict (${conflictColumns.map(quoted).join(', ')}) `
    if (ignoreDuplicates || updateColumns.length === 0) conflict += 'do nothing'
    else conflict += `do update set ${updateColumns.map((key) => `${quoted(key)} = excluded.${quoted(key)}`).join(', ')}`
  }
  const returning = common.head
    ? ''
    : ` returning ${common.columns === '*' ? '*' : common.columns.map(quoted).join(', ')}`

  const result = await client.query(
    `insert into public.${quoted(common.table)} (${keys.map(quoted).join(', ')}) values ${tuples.join(', ')}${conflict}${returning}`,
    values,
  )
  // The generic route itself is wrapped in one database transaction. Marking
  // the opportunity here means a quote row and its quoted flag either both
  // commit or both roll back; the browser never has to coordinate two writes.
  await markQuotedOpportunities(client, quotedOpportunityIds)
  return {
    data: common.head ? null : shapeRows(result.rows, common),
    ...(common.count ? { count: result.rowCount ?? 0 } : {}),
    error: null,
  }
}

async function updateOrDeleteData(
  client: Queryable,
  common: CommonRequest & Record<string, unknown>,
  operation: 'update' | 'delete',
): Promise<Record<string, unknown>> {
  if (common.filters.length === 0 && common.orGroups.length === 0) {
    throw new ApiError(
      400,
      'filter_required',
      `${operation} requires at least one structured filter.`,
    )
  }
  const available = await tableColumns(client, common.table)
  validateCommonColumns(common, available)
  const values: unknown[] = []
  let prefix: string
  if (operation === 'update') {
    const patch = asRecord(common.values, 'values')
    const keys = Object.keys(patch).sort()
    if (keys.length === 0) throw new ApiError(400, 'invalid_request', 'values cannot be empty.')
    assertColumnsExist(keys, available, common.table)
    if (common.table === 'app_settings' && Object.hasOwn(patch, 'key')) {
      assertAllowedAppSettingKey(patch.key)
    }
    if (common.table === 'opportunities') {
      const permissions = await effectiveOpportunityPermissions(client)
      assertOpportunityFieldAuthorization(new Set(keys), permissions, patch)
    }
    if (common.table === 'non_submission_reports') {
      const permissions = await effectiveOpportunityPermissions(client)
      if (!hasAnyPermission(permissions, NON_SUBMISSION_WRITE_PERMISSIONS)) {
        throw new ApiError(403, 'forbidden', 'You do not have permission to edit non-submission reports.')
      }
      const denied = keys.filter((key) => !GENERIC_NON_SUBMISSION_EDIT_COLUMNS.has(key))
      if (denied.length > 0) {
        throw new ApiError(
          403,
          'workflow_required',
          'Non-submission review lifecycle changes must use the atomic opportunity workflow API.',
        )
      }
    }
    if (common.table === 'subcontractors') {
      await requireAnyDataPermission(
        client,
        SOURCING_WRITE_PERMISSIONS,
        'You do not have permission to update sourcing.',
      )
    }
    const assignments = keys.map((key) => {
      return `${quoted(key)} = ${pushColumnParameter(values, common.table, key, patch[key])}`
    })
    prefix = `update public.${quoted(common.table)} set ${assignments.join(', ')}`
  } else {
    if (common.table === 'subcontractors') {
      await requireAnyDataPermission(
        client,
        SOURCING_WRITE_PERMISSIONS,
        'You do not have permission to update sourcing.',
      )
    }
    if (common.table === 'opportunities'
      || common.table === 'bd_submissions'
      || common.table === 'non_submission_reports') {
      const permissions = await effectiveOpportunityPermissions(client)
      const required = isWorkflowBulkClear(common)
        ? new Set(['admin:manageUsers'])
        : DESTRUCTIVE_DELETE_PERMISSIONS
      if (!hasAnyPermission(permissions, required)) {
        throw new ApiError(403, 'forbidden', 'You do not have permission to permanently delete this workflow record.')
      }
    }
    prefix = `delete from public.${quoted(common.table)}`
  }
  common = withAppSettingsScope(common)
  const where = whereSql(common, values)
  const returning = common.head
    ? ''
    : ` returning ${common.columns === '*' ? '*' : common.columns.map(quoted).join(', ')}`
  const result = await client.query(`${prefix}${where}${returning}`, values)
  return {
    data: common.head ? null : shapeRows(result.rows, common),
    ...(common.count ? { count: result.rowCount ?? 0 } : {}),
    error: null,
  }
}

function isWorkflowBulkClear(common: Pick<CommonRequest, 'filters' | 'orGroups'>): boolean {
  return common.orGroups.length === 0
    && common.filters.length === 1
    && common.filters[0]?.column === 'id'
    && common.filters[0]?.operator === 'not.is'
    && common.filters[0]?.value === null
}

function assertMutationRoute(
  path: string,
  table: string,
  common: Pick<CommonRequest, 'filters' | 'orGroups'> = { filters: [], orGroups: [] },
): void {
  if (path === '/api/v1/data/query') return
  if (table === 'users') {
    throw new ApiError(403, 'forbidden', 'User accounts can only be changed through the admin API.')
  }
  const approvedBulkDelete = path === '/api/v1/data/delete' && isWorkflowBulkClear(common)
  const workflowMutation = table === 'bd_submissions'
    ? !approvedBulkDelete
    : table === 'non_submission_reports' && path === '/api/v1/data/delete'
      ? !approvedBulkDelete
    : table === 'opportunities' && path === '/api/v1/data/delete' && !approvedBulkDelete
  if (workflowMutation) {
    throw new ApiError(
      403,
      'workflow_required',
      'Opportunity and BD Tracker lifecycle changes must use the atomic opportunity workflow API.',
    )
  }
}

export function registerDataRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  const route = (
    path: string,
    additionalKeys: readonly string[],
    handler: (client: Queryable, request: CommonRequest & Record<string, unknown>) => Promise<Record<string, unknown>>,
  ) => {
    app.post(
      path,
      { preHandler: (request) => requireCompleted(request, dependencies) },
      async (request) => {
        const common = parseCommon(request.body, additionalKeys)
        assertMutationRoute(path, common.table, common)
        try {
          return await asAuthenticatedUser(
            dependencies.db,
            request.auth?.accountId as string,
            (client) => handler(client, common),
          )
        } catch (error) {
          pgError(error)
        }
      },
    )
  }

  route('/api/v1/data/query', [], queryData)
  route('/api/v1/data/insert', ['rows'], (client, common) => insertData(client, common, false))
  route(
    '/api/v1/data/upsert',
    ['rows', 'onConflict', 'ignoreDuplicates'],
    (client, common) => insertData(client, common, true),
  )
  route('/api/v1/data/update', ['values'], (client, common) => updateOrDeleteData(client, common, 'update'))
  route('/api/v1/data/delete', [], (client, common) => updateOrDeleteData(client, common, 'delete'))
}

export const __test = {
  parseCommon,
  whereSql,
  quoted,
  tableColumns,
  assertColumnsExist,
  withAppSettingsScope,
  assertAppSettingsRows,
  changedColumns,
  assertOpportunityFieldAuthorization,
  authorizeOpportunityRows,
  authorizeNonSubmissionRows,
  quoteBackedOpportunityIds,
  markQuotedOpportunities,
  insertData,
  updateOrDeleteData,
  assertMutationRoute,
  isWorkflowBulkClear,
}
