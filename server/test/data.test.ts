import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/errors.js'
import { __test } from '../src/data.js'
import type { Queryable } from '../src/db.js'

function queryable(
  handler: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[],
): Queryable {
  return {
    async query(text, values) {
      const rows = handler(text, values)
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
      }
    },
  } as Queryable
}

describe('generic data request compiler', () => {
  it('rejects arbitrary table identifiers', () => {
    expect(() => __test.parseCommon({ table: 'users; drop table users' })).toThrowError(ApiError)
  })

  it('parameterizes values and represents OR groups structurally', () => {
    const request = __test.parseCommon({
      table: 'opportunities',
      filters: [{ column: 'solicitation_id', operator: 'ilike', value: 'ABC%' }],
      orGroups: [[
        { column: 'is_deleted', operator: 'is', value: null },
        { column: 'is_deleted', operator: 'eq', value: false },
      ]],
    })
    const values: unknown[] = []
    expect(__test.whereSql(request, values)).toBe(
      ' where "solicitation_id" ilike $1 and ("is_deleted" is null or "is_deleted" = $2)',
    )
    expect(values).toEqual(['ABC%', false])
  })

  it('rejects raw filter operators and unbounded limits', () => {
    expect(() => __test.parseCommon({
      table: 'opportunities',
      filters: [{ column: 'id', operator: 'sql', value: 'anything' }],
    })).toThrowError(/not supported/)
    expect(() => __test.parseCommon({ table: 'opportunities', limit: 10001 })).toThrowError(/limit/)
  })

  it('uses compatibility errors for a missing table or optional column', async () => {
    const missingTable = queryable(() => [])
    await expect(__test.tableColumns(missingTable, 'app_settings')).rejects.toMatchObject({
      code: '42P01',
    })

    try {
      __test.assertColumnsExist(['future_column'], new Set(['id']), 'contracts')
      throw new Error('Expected the column check to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        code: 'PGRST204',
        message: "Could not find the 'future_column' column of 'contracts' in the schema cache.",
      })
    }
  })

  it('scopes every app-settings read to the three non-secret keys', () => {
    const request = __test.withAppSettingsScope(__test.parseCommon({ table: 'app_settings' }))
    const values: unknown[] = []
    expect(__test.whereSql(request, values)).toBe(' where "key" in ($1, $2, $3)')
    expect(values).toEqual([
      'non_sub_grace_hours',
      'non_sub_grace_minutes',
      'require_associate_for_active_pipeline',
    ])
  })

  it('rejects writes to app-settings keys outside the server allowlist', () => {
    expect(() => __test.assertAppSettingsRows('app_settings', [
      { key: 'non_sub_grace_hours', value: '12' },
      { key: 'require_associate_for_active_pipeline', value: 'false' },
    ])).not.toThrow()
    expect(() => __test.assertAppSettingsRows('app_settings', [
      { key: 'sam_gov_api_key', value: 'must-not-reach-the-browser' },
    ])).toThrowError(/not available through the browser API/)
  })

  it('routes individual BD Tracker and opportunity lifecycle writes through the atomic workflow', () => {
    const individual = __test.parseCommon({
      table: 'bd_submissions',
      filters: [{ column: 'id', operator: 'eq', value: 41 }],
    })
    const bulk = __test.parseCommon({
      table: 'bd_submissions',
      filters: [{ column: 'id', operator: 'not.is', value: null }],
    })
    expect(() => __test.assertMutationRoute('/api/v1/data/upsert', 'bd_submissions'))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/update', 'bd_submissions'))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/upsert', 'bd_submissions', bulk))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/update', 'bd_submissions', bulk))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/delete', 'bd_submissions', individual))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/delete', 'non_submission_reports', individual))
      .toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/delete', 'opportunities', {
      ...individual, table: 'opportunities',
    })).toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertMutationRoute('/api/v1/data/delete', 'bd_submissions', bulk)).not.toThrow()
    expect(() => __test.assertMutationRoute('/api/v1/data/delete', 'non_submission_reports', bulk)).not.toThrow()
    expect(() => __test.assertMutationRoute('/api/v1/data/query', 'bd_submissions'))
      .not.toThrow()
  })

  it.each(['bd_submissions', 'non_submission_reports'] as const)(
    'reserves %s bulk clears for administrators', async (table) => {
    const request = __test.parseCommon({
      table,
      filters: [{ column: 'id', operator: 'not.is', value: null }],
    })
    const denied = queryable((text) => {
      if (text.includes('information_schema.columns')) return [{ column_name: 'id' }]
      if (text.includes('private.has_permission')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(__test.updateOrDeleteData(denied, request, 'delete'))
      .rejects.toMatchObject({ statusCode: 403 })

    const allowed = queryable((text) => {
      if (text.includes('information_schema.columns')) return [{ column_name: 'id' }]
      if (text.includes('private.has_permission')) {
        return [{ permission: 'admin:manageUsers', allowed: true }]
      }
      if (text.startsWith(`delete from public."${table}"`)) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(__test.updateOrDeleteData(allowed, request, 'delete'))
      .resolves.toMatchObject({ error: null })
  })

  it('authorizes only schedule fields for a schedule-limited opportunity writer', () => {
    const schedule = new Set(['opportunity:editSchedule'])
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['due_date', 'local_time', 'mandatory_events_list']),
      schedule,
    )).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['due_date', 'status']),
      schedule,
    )).toThrowError(/atomic opportunity workflow/)
  })

  it('ignores unchanged full-row values after PostgreSQL date/numeric serialization', () => {
    const changed = __test.changedColumns({
      id: 'o1',
      status: 'ACTIVE',
      contract_amount: 100,
      submitted_at: '2026-07-20T20:00:00+00:00',
      mandatory_events_list: [{ title: 'Site visit', required: true }],
    }, {
      id: 'o1',
      status: 'ACTIVE',
      contract_amount: '100.00',
      submitted_at: '2026-07-20T20:00:00.000Z',
      mandatory_events_list: [{ required: true, title: 'Site visit' }],
      due_date: '2026-07-21',
    })
    expect([...changed]).toEqual(['due_date'])
    expect(() => __test.assertOpportunityFieldAuthorization(
      changed,
      new Set(['opportunity:editSchedule']),
    )).not.toThrow()
  })

  it('treats migrated NULL collections as the empty arrays emitted by the real mapper', () => {
    const existing = {
      id: 'o1',
      status: 'ACTIVE',
      due_date: '2026-07-20',
      proposals: null,
      assigned_opportunities: null,
      proposal_attachments: null,
      sam_gov_contacts: null,
    }
    const incoming = {
      ...existing,
      due_date: '2026-07-21',
      proposals: [],
      assigned_opportunities: [],
      proposal_attachments: [],
      sam_gov_contacts: [],
    }

    const changed = __test.changedColumns(existing, incoming)
    expect([...changed]).toEqual(['due_date'])
    expect(() => __test.assertOpportunityFieldAuthorization(
      changed,
      new Set(['opportunity:editSchedule']),
      incoming,
      existing,
    )).not.toThrow()
  })

  it('never coerces text identifiers while comparing serialized numeric fields', () => {
    const changed = __test.changedColumns({
      id: 'o1',
      solicitation_id: '00123',
      naics_code: '001234',
      contract_amount: 100,
      submitted_at: '2026-07-20T20:00:00+00:00',
    }, {
      id: 'o1',
      solicitation_id: 123,
      naics_code: 1234,
      contract_amount: '100.00',
      submitted_at: '2026-07-20T20:00:00.000Z',
    })

    expect([...changed]).toEqual(['solicitation_id', 'naics_code'])
    expect(() => __test.assertOpportunityFieldAuthorization(
      changed,
      new Set(['opportunity:editSchedule']),
    )).toThrowError(/do not have permission/)
  })

  it('authorizes sourcing-only changes but denies unrelated financial fields', () => {
    const sourcing = new Set(['sourcing:write'])
    expect(() => __test.assertOpportunityFieldAuthorization(new Set(['quoted']), sourcing)).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['quoted', 'contract_amount']),
      sourcing,
    )).toThrowError(/Only an Admin/)
  })

  it('reserves contract dollar edits for Admin and routes lifecycle status through the workflow', () => {
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['submitted_at', 'proposal_attachments']),
      new Set(['opportunity:submitProposal']),
    )).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['contract_amount', 'base_amount', 'monthly_payment', 'value']),
      new Set(['opportunity:submitProposal', 'opportunity:edit']),
    )).toThrowError(/Only an Admin/)
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['client']),
      new Set(['opportunity:edit']),
    )).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['contract_amount', 'base_amount', 'monthly_payment', 'value']),
      new Set(['admin:manageUsers']),
    )).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status', 'submitted_at', 'proposal_attachments']),
      new Set(['opportunity:submitProposal']),
      { status: 'SUBMITTED' },
      { status: 'ACTIVE' },
    )).toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status', 'client']),
      new Set(['opportunity:edit']),
      { status: 'WON' },
      { status: 'SUBMITTED' },
    )).toThrowError(/atomic opportunity workflow/)
  })

  it('does not let cancellation-only permission bypass the atomic workflow', () => {
    const cancelOnly = new Set(['opportunity:cancel'])
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status']),
      cancelOnly,
      { status: 'CANCELED' },
      { status: 'ACTIVE' },
    )).toThrowError(/atomic opportunity workflow/)
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status']),
      cancelOnly,
      { status: 'WON' },
      { status: 'SUBMITTED' },
    )).toThrowError(/atomic opportunity workflow/)
  })

  it('allows only ACTIVE to NEW_ASSIGNMENT assignment normalization through generic upserts', () => {
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status', 'assigned_to']),
      new Set(['opportunity:edit']),
      { status: 'NEW_ASSIGNMENT', assigned_to: null },
      { status: 'ACTIVE', assigned_to: 'associate-1' },
    )).not.toThrow()
  })

  it('prevents generic creates from seeding a tracker lifecycle status without a tracker row', async () => {
    const creator = queryable((text) => {
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:create', allowed: true }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.authorizeOpportunityRows(
      creator,
      [{ id: 'new-1', status: 'WON' }],
      false,
      [],
    )).rejects.toMatchObject({ code: 'workflow_required' })
    await expect(__test.authorizeOpportunityRows(
      creator,
      [{ id: 'new-2', status: 'ACTIVE' }],
      false,
      [],
    )).resolves.toEqual(new Map())
  })

  it('blocks stale-client non-submission review writes but permits ordinary report edits', async () => {
    const existing = {
      id: 'report-1',
      opportunity_id: 'o1',
      status: 'PENDING',
      reason: 'Original reason',
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      comments: [],
    }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) {
        return [{ permission: 'nonSubmission:submit', allowed: true }]
      }
      if (text.includes('from public.non_submission_reports report')) {
        return [{ id: 'report-1', snapshot: existing }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.authorizeNonSubmissionRows(client, [{
      ...existing,
      reason: 'Clarified reason',
    }], true, ['id'])).resolves.toBeInstanceOf(Map)
    await expect(__test.authorizeNonSubmissionRows(client, [{
      ...existing,
      status: 'APPROVED',
      reviewed_by: 'manager',
    }], true, ['id'])).rejects.toMatchObject({ code: 'workflow_required' })
  })

  it('allows only pending reports to be created through generic CRUD', async () => {
    const client = queryable((text) => text.includes('private.has_permission')
      ? [{ permission: 'nonSubmission:review', allowed: true }]
      : [])
    await expect(__test.authorizeNonSubmissionRows(client, [{
      id: 'report-1', status: 'PENDING', reason: 'Late proposal',
    }], false, [])).resolves.toEqual(new Map())
    await expect(__test.authorizeNonSubmissionRows(client, [{
      id: 'report-2', status: 'DECLINED', reviewed_by: 'manager',
    }], false, [])).rejects.toMatchObject({ code: 'workflow_required' })
  })

  it('fails a concurrent non-submission insert instead of overwriting it through ON CONFLICT', async () => {
    const row = { id: 'report-new', status: 'PENDING', reason: 'Late proposal' }
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'nonSubmission:submit', allowed: true }]
      }
      if (text.includes('from public.non_submission_reports report')) return []
      if (text.startsWith('insert into public.non_submission_reports')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'non_submission_reports',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).rejects.toMatchObject({ code: '23505' })
    const insert = statements.find((text) => text.startsWith('insert into public.non_submission_reports'))
    expect(insert).toContain('do nothing')
    expect(insert).not.toContain('do update')
  })

  it('marks a quote-backed opportunity in the same sourcing upsert transaction', async () => {
    const row = {
      id: 'sub-1',
      opportunity_id: 'opp-1',
      company_name: 'Reliable Subcontractor',
      quote_file: null,
      quote_files: [{ id: 'quote-1', name: 'quote.pdf' }],
    }
    const statements: string[] = []
    const client = queryable((text, values) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'sourcing:write', allowed: true }]
      }
      if (text.startsWith('insert into public."subcontractors"')) {
        expect(text).toMatch(/\$\d+::jsonb/)
        expect(values).toContain(JSON.stringify(row.quote_files))
        expect(values).not.toContain(row.quote_files)
        return [row]
      }
      if (text.startsWith('update public.opportunities')) {
        expect(values).toEqual([['opp-1']])
        return [{ id: 'opp-1' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'subcontractors',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).resolves.toMatchObject({ data: [row] })
    expect(statements.findIndex((text) => text.startsWith('update public.opportunities')))
      .toBeGreaterThan(statements.findIndex((text) => text.startsWith('insert into public."subcontractors"')))
  })

  it('fails the sourcing request if its atomic quoted-flag update cannot find the opportunity', async () => {
    const row = {
      id: 'sub-1',
      opportunity_id: 'missing-opportunity',
      quote_file: 'quote.pdf',
    }
    const client = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'sourcing:write', allowed: true }]
      }
      if (text.startsWith('insert into public."subcontractors"')) return [row]
      if (text.startsWith('update public.opportunities')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'subcontractors',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true))
      .rejects.toMatchObject({ statusCode: 409, code: 'stale_opportunity' })
  })

  it('rejects sourcing upserts without sourcing permission before writing', async () => {
    const row = {
      id: 'sub-1',
      opportunity_id: 'opp-1',
      quote_file: 'quote.pdf',
    }
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'subcontractors',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    expect(statements.some((text) => text.startsWith('insert into public."subcontractors"'))).toBe(false)
  })

  it('rejects an unauthorized non-submission report insert', async () => {
    const row = { id: 'report-new', status: 'PENDING', reason: 'Late proposal' }
    const client = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'non_submission_reports',
      rows: [row],
    }, ['rows'])

    await expect(__test.insertData(client, request, false))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
  })

  it('rejects an unauthorized non-submission report upsert before locking or writing rows', async () => {
    const row = { id: 'report-existing', status: 'PENDING', reason: 'Changed reason' }
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'non_submission_reports',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    expect(statements.some((text) => text.includes('for update'))).toBe(false)
    expect(statements.some((text) => /^(insert|update) /i.test(text))).toBe(false)
  })

  it('rejects an unauthorized ordinary non-submission report update', async () => {
    const client = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return [{ column_name: 'id' }, { column_name: 'reason' }]
      }
      if (text.includes('private.has_permission')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'non_submission_reports',
      values: { reason: 'Changed reason' },
      filters: [{ column: 'id', operator: 'eq', value: 'report-existing' }],
    }, ['values'])

    await expect(__test.updateOrDeleteData(client, request, 'update'))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
  })

  it('diffs full-row upserts under a row lock before applying field authorization', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:editSchedule', allowed: true }]
      }
      if (text.includes('for update')) {
        return [{
          id: 'o1',
          snapshot: {
            id: 'o1',
            status: 'ACTIVE',
            due_date: '2026-07-20',
            contract_amount: 100,
          },
        }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.authorizeOpportunityRows(client, [{
      id: 'o1',
      status: 'WON',
      due_date: '2026-07-21',
      contract_amount: 100,
    }], true, ['id'])).rejects.toMatchObject({ code: 'workflow_required' })
  })

  it('prevents the generic opportunity update route from bypassing Admin-only dollar fields', async () => {
    const request = __test.parseCommon({
      table: 'opportunities',
      values: { contract_amount: 900, base_amount: 120, monthly_payment: 10 },
      filters: [{ column: 'id', operator: 'eq', value: 'o1' }],
    }, ['values'])
    const denied = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return [
          { column_name: 'id' },
          { column_name: 'contract_amount' },
          { column_name: 'base_amount' },
          { column_name: 'monthly_payment' },
        ]
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:edit', allowed: true }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.updateOrDeleteData(denied, request, 'update'))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden_opportunity_financial_fields' })

    const admin = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return [
          { column_name: 'id' },
          { column_name: 'contract_amount' },
          { column_name: 'base_amount' },
          { column_name: 'monthly_payment' },
        ]
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'admin:manageUsers', allowed: true }]
      }
      if (text.startsWith('update public.') && text.includes('opportunities')) {
        return [{ id: 'o1', contract_amount: 900, base_amount: 120, monthly_payment: 10 }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.updateOrDeleteData(admin, request, 'update')).resolves.toMatchObject({
      data: [{ id: 'o1', contract_amount: 900, base_amount: 120, monthly_payment: 10 }],
    })
  })

  it.each([
    ['schedule', 'opportunity:editSchedule', { due_date: '2026-07-21' }],
    ['quote', 'sourcing:write', { quoted: true }],
  ])('uses UPDATE for an associate %s upsert of an existing opportunity', async (_label, permission, patch) => {
    const statements: string[] = []
    const row = { id: 'o1', ...patch }
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission, allowed: true }]
      }
      if (text.includes('for update')) {
        return [{ id: 'o1', snapshot: { id: 'o1' } }]
      }
      if (text.startsWith('update public.opportunities')) return [row]
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).resolves.toMatchObject({ data: [row] })
    expect(statements.some((text) => text.startsWith('update public.opportunities'))).toBe(true)
    expect(statements.some((text) => text.startsWith('insert into public.opportunities'))).toBe(false)
  })

  it('rejects a stale-client submit before it can update only the opportunity row', async () => {
    const row = { id: 'o1', status: 'SUBMITTED', submitted_at: '2026-07-21T12:00:00.000Z' }
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:submitProposal', allowed: true }]
      }
      if (text.includes('for update')) {
        return [{ id: 'o1', snapshot: { id: 'o1', status: 'ACTIVE', submitted_at: null } }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true))
      .rejects.toMatchObject({ code: 'workflow_required' })
    expect(statements.some((text) => text.startsWith('update public.opportunities'))).toBe(false)
    expect(statements.some((text) => text.startsWith('insert into public.opportunities'))).toBe(false)
  })

  it('fails closed when an authorized opportunity UPDATE affects no row', async () => {
    const row = { id: 'o1', due_date: '2026-07-21' }
    const client = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:editSchedule', allowed: true }]
      }
      if (text.includes('for update')) {
        return [{ id: 'o1', snapshot: { id: 'o1', due_date: '2026-07-20' } }]
      }
      if (text.startsWith('update public.opportunities')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).rejects.toMatchObject({ code: 'stale_opportunity' })
  })

  it('does not let edit-only permission create a missing opportunity', async () => {
    const row = { id: 'new-opportunity', status: 'ACTIVE' }
    const client = queryable((text) => {
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:edit', allowed: true }]
      }
      if (text.includes('for update')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('keeps INSERT authorization for a genuinely new opportunity', async () => {
    const statements: string[] = []
    const row = { id: 'new-opportunity', status: 'ACTIVE' }
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:editSchedule', allowed: true }]
      }
      if (text.includes('for update')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).rejects.toMatchObject({ code: 'forbidden' })
    expect(statements.some((text) => text.startsWith('insert into public.opportunities'))).toBe(false)
  })

  it('inserts a genuinely new opportunity for a creator', async () => {
    const statements: string[] = []
    const row = { id: 'new-opportunity', status: 'ACTIVE' }
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:create', allowed: true }]
      }
      if (text.includes('for update')) return []
      if (text.startsWith('insert into public.opportunities')) return [row]
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).resolves.toMatchObject({ data: [row] })
    expect(statements.some((text) => text.startsWith('insert into public.opportunities'))).toBe(true)
  })

  it('never turns a concurrent new-opportunity conflict into an unauthorized update', async () => {
    const statements: string[] = []
    const row = { id: 'racing-opportunity', status: 'ACTIVE' }
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) {
        return Object.keys(row).map((column_name) => ({ column_name }))
      }
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:create', allowed: true }]
      }
      if (text.includes('for update')) return []
      if (text.startsWith('insert into public.opportunities')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      rows: [row],
      onConflict: 'id',
    }, ['rows', 'onConflict', 'ignoreDuplicates'])

    await expect(__test.insertData(client, request, true)).rejects.toMatchObject({ code: '23505' })
    const insert = statements.find((text) => text.startsWith('insert into public.opportunities')) ?? ''
    expect(insert).toContain('do nothing')
    expect(insert).not.toContain('do update')
  })

  it('does not treat cancellation permission as hard-delete permission', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('information_schema.columns')) return [{ column_name: 'id' }]
      if (text.includes('private.has_permission')) {
        return [{ permission: 'opportunity:cancel', allowed: true }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    const request = __test.parseCommon({
      table: 'opportunities',
      filters: [{ column: 'id', operator: 'eq', value: 'o1' }],
    })

    await expect(__test.updateOrDeleteData(client, request, 'delete')).rejects.toMatchObject({ code: 'forbidden' })
    expect(statements.some((text) => text.startsWith('delete from public.opportunities'))).toBe(false)
  })
})
