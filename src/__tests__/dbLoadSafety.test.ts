import { afterEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn((table: string) => ({
    select: vi.fn().mockResolvedValue(
      table === 'contracts'
        ? { data: null, error: { message: 'Project temporarily restricted' } }
        : { data: [], error: null },
    ),
  })),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: true,
  supabase: { from: fromMock },
}))

import { loadAllData } from '../lib/db'
import { SAFE_USER_COLUMNS } from '../lib/userProfile'

describe('database snapshot safety', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not convert a failed table read into an empty application snapshot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(loadAllData()).resolves.toBeNull()
    expect(fromMock).toHaveBeenCalledWith('contracts')
    const usersCall = fromMock.mock.calls.findIndex(([table]) => table === 'users')
    const usersClient = fromMock.mock.results[usersCall].value as { select: ReturnType<typeof vi.fn> }
    expect(usersClient.select).toHaveBeenCalledWith(SAFE_USER_COLUMNS)
    expect(SAFE_USER_COLUMNS).not.toContain('password')
    expect(SAFE_USER_COLUMNS).not.toContain('mfa_')
  })
})
