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

  it('scopes every app-settings read to the two non-secret keys', () => {
    const request = __test.withAppSettingsScope(__test.parseCommon({ table: 'app_settings' }))
    const values: unknown[] = []
    expect(__test.whereSql(request, values)).toBe(' where "key" in ($1, $2)')
    expect(values).toEqual(['non_sub_grace_hours', 'non_sub_grace_minutes'])
  })

  it('rejects writes to app-settings keys outside the server allowlist', () => {
    expect(() => __test.assertAppSettingsRows('app_settings', [
      { key: 'non_sub_grace_hours', value: '12' },
    ])).not.toThrow()
    expect(() => __test.assertAppSettingsRows('app_settings', [
      { key: 'sam_gov_api_key', value: 'must-not-reach-the-browser' },
    ])).toThrowError(/not available through the browser API/)
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
    )).toThrowError(/do not have permission/)
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

  it('authorizes sourcing-only changes but denies unrelated financial fields', () => {
    const sourcing = new Set(['sourcing:write'])
    expect(() => __test.assertOpportunityFieldAuthorization(new Set(['quoted']), sourcing)).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['quoted', 'contract_amount']),
      sourcing,
    )).toThrowError(/do not have permission/)
  })

  it('preserves submission and full-editor opportunity behavior', () => {
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status', 'submitted_at', 'proposal_attachments', 'contract_amount']),
      new Set(['opportunity:submitProposal']),
    )).not.toThrow()
    expect(() => __test.assertOpportunityFieldAuthorization(
      new Set(['status', 'client', 'assigned_to']),
      new Set(['opportunity:edit']),
    )).not.toThrow()
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
    }], true, ['id'])).rejects.toMatchObject({ code: 'forbidden_opportunity_fields' })
  })
})
