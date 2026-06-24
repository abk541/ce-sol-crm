import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Employee } from '../types'

const syncState = vi.hoisted(() => ({
  existingEmployees: [] as Array<{ id: string; email: string }>,
  upsertResponses: [] as Array<{ error: unknown }>,
  upsertCalls: [] as unknown[],
  updateCalls: [] as Array<{ payload: unknown; column: string; value: unknown }>,
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: true,
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: syncState.existingEmployees, error: null })),
      upsert: vi.fn((payload: unknown) => {
        syncState.upsertCalls.push(payload)
        const response = syncState.upsertResponses.shift() ?? { error: null }
        return {
          select: vi.fn(() => Promise.resolve({ data: null, error: response.error })),
        }
      }),
      update: vi.fn((payload: unknown) => ({
        eq: vi.fn((column: string, value: unknown) => {
          syncState.updateCalls.push({ payload, column, value })
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    })),
  },
}))

import { seedEmployeesIfEmpty } from '../lib/db'

describe('employee database sync', () => {
  beforeEach(() => {
    syncState.existingEmployees = []
    syncState.upsertResponses = []
    syncState.upsertCalls = []
    syncState.updateCalls = []
  })

  it('repairs stale same-email employee rows so assigned opportunities can save', async () => {
    syncState.existingEmployees = [{ id: 'old-user-id', email: 'bd.manager@example.com' }]
    syncState.upsertResponses = [
      { error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"' } },
      { error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"' } },
      { error: null },
    ]

    const employees: Employee[] = [{
      id: 'new-user-id',
      name: 'BD Manager',
      email: 'bd.manager@example.com',
      role: 'BD_MANAGER',
      managerId: null,
      avatar: 'BM',
      team: 'BD',
    }]

    await expect(seedEmployeesIfEmpty(employees)).resolves.toBe(true)

    expect(syncState.updateCalls).toEqual([{
      payload: { email: 'bd.manager+legacy-old-user-id@example.com' },
      column: 'id',
      value: 'old-user-id',
    }])
    expect(syncState.upsertCalls).toHaveLength(3)
    expect(syncState.upsertCalls[2]).toMatchObject({
      id: 'new-user-id',
      email: 'bd.manager@example.com',
      role: 'BD_MANAGER',
      team: 'BD',
    })
  })
})
