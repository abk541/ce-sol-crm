import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract, SubkDatabaseEntry } from '../types'

const dbState = vi.hoisted(() => ({
  selectRows: {} as Record<string, unknown[]>,
  selectErrors: {} as Record<string, unknown>,
  upsertCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  upsertResponses: {} as Record<string, Array<{ error: unknown }>>,
  deleteCalls: [] as Array<{ table: string; column: string; value: unknown }>,
}))

vi.mock('../lib/api', () => ({
  isApiConnected: true,
  api: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockResolvedValue({
        data: dbState.selectRows[table] ?? [],
        error: dbState.selectErrors[table] ?? null,
      }),
      upsert: vi.fn((payload: Record<string, unknown>) => {
        dbState.upsertCalls.push({ table, payload })
        return Promise.resolve(
          dbState.upsertResponses[table]?.shift() ?? { data: null, error: null },
        )
      }),
      delete: vi.fn(() => ({
        eq: vi.fn((column: string, value: unknown) => {
          dbState.deleteCalls.push({ table, column, value })
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    })),
  },
  subscribeToApiEvents: vi.fn(() => () => undefined),
}))

import {
  deleteSubkDatabaseEntryRecord,
  fetchAppSettings,
  loadAllData,
  upsertContract,
  upsertSubkDatabaseEntry,
} from '../lib/db'

describe('native database compatibility', () => {
  beforeEach(() => {
    dbState.selectRows = {}
    dbState.selectErrors = {}
    dbState.upsertCalls = []
    dbState.upsertResponses = {}
    dbState.deleteCalls = []
    vi.restoreAllMocks()
  })

  it('persists and loads every subcontractor-database field through the restored schema', async () => {
    const entry: SubkDatabaseEntry = {
      id: 'subk-db-1',
      companyName: 'Example Subcontractor',
      contactName: 'Alex Example',
      email: 'alex@example.com',
      phone: '+1 555 0100',
      naicsCodes: ['541512', '541519'],
      setAside: 'SB',
      location: 'Virginia',
      pastProjects: [{ title: 'Support', client: 'Agency', year: '2025', value: 10_000 }],
      quoteFile: 'quote.pdf',
      notes: 'Preferred partner',
      totalContractsWorked: 3,
      createdAt: '2026-07-20T12:00:00.000Z',
      createdBy: 'Capture Manager',
    }

    await expect(upsertSubkDatabaseEntry(entry)).resolves.toBe(true)
    const payload = dbState.upsertCalls[0].payload
    expect(Object.keys(payload).sort()).toEqual([
      'company_name',
      'contact_name',
      'created_at',
      'created_by',
      'email',
      'id',
      'naics_codes',
      'notes',
      'phone',
      'set_aside',
      'total_contracts_worked',
    ])

    dbState.selectRows.subk_database = [payload]
    const loaded = await loadAllData()
    expect(loaded?.subkDatabase).toEqual([entry])
  })

  it('deletes a subcontractor-database row by id', async () => {
    await expect(deleteSubkDatabaseEntryRecord('subk-db-1')).resolves.toBe(true)
    expect(dbState.deleteCalls).toEqual([
      { table: 'subk_database', column: 'id', value: 'subk-db-1' },
    ])
  })

  it('strips a column rejected by the native API and retries the contract write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    dbState.upsertResponses.contracts = [
      {
        error: {
          code: 'column_not_allowed',
          message: 'Column "gov_billing_status" is not available on this table.',
        },
      },
      { error: null },
    ]

    await expect(upsertContract({ id: 'contract-1' } as Contract)).resolves.toBe(true)
    const contractWrites = dbState.upsertCalls.filter(call => call.table === 'contracts')
    expect(contractWrites).toHaveLength(2)
    expect(contractWrites[0].payload).toHaveProperty('gov_billing_status')
    expect(contractWrites[1].payload).not.toHaveProperty('gov_billing_status')
  })

  it('treats a native table_not_allowed response as an optional missing table', async () => {
    dbState.selectErrors.app_settings = {
      code: 'table_not_allowed',
      message: 'This table is not available through the application API.',
    }

    await expect(fetchAppSettings()).resolves.toEqual({ ok: false, missingTable: true })
  })
})
