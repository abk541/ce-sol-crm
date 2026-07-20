import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: true,
  supabase: {
    functions: { invoke: mocks.invoke },
  },
}))

import { invokeFirstLoginCompletion } from '../lib/userManagement'

const completedProfile = {
  id: 'profile-1',
  authUserId: 'auth-1',
  name: 'Example User',
  email: 'user@example.com',
  username: 'user',
  role: 'ASSOCIATE',
  avatar: 'EU',
  status: 'active',
  firstLogin: false,
  team: 'BD',
  managerId: null,
  createdAt: '2026-07-20',
}

describe('first-login Edge action client contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes only the protected completion action and accepts an idempotent retry', async () => {
    mocks.invoke.mockResolvedValue({
      data: { user: completedProfile, alreadyComplete: true },
      error: null,
    })

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toEqual({
      ok: true,
      profile: completedProfile,
      alreadyComplete: true,
    })
    expect(mocks.invoke).toHaveBeenCalledWith('manage-users', {
      body: { action: 'complete-first-login', password: 'NewPassword1!' },
    })
  })

  it('preserves the server error code and retryability contract', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        error: {
          code: 'setup_incomplete',
          message: 'Retry with the same new password.',
        },
      },
      error: null,
    })

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toEqual({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })
  })

  it('fails closed when the service returns a still-pending profile', async () => {
    mocks.invoke.mockResolvedValue({
      data: { user: { ...completedProfile, firstLogin: true } },
      error: null,
    })

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toMatchObject({
      ok: false,
      code: 'setup_incomplete',
      retryable: true,
    })
  })
})

describe('first-login database and function gate', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260720190000_enforce_first_login_gate.sql'),
    'utf8',
  )
  const edgeFunction = readFileSync(
    join(process.cwd(), 'supabase/functions/manage-users/index.ts'),
    'utf8',
  )

  it('requires completed setup in shared business/admin predicates', () => {
    expect(migration).toMatch(/profile\.first_login is false/g)
    expect(migration).toContain('users_select_own_pending_first_login')
    expect(migration).toContain('drop policy if exists users_update_own_first_login')
    expect(migration).toContain('revoke update (first_login) on public.users from anon, authenticated')
  })

  it('rejects pending callers from admin actions and coordinates completion server-side', () => {
    expect(edgeFunction).toContain('callerProfile.first_login !== false')
    expect(edgeFunction).toContain('admin.auth.admin.updateUserById')
    expect(edgeFunction).toContain('.update({ first_login: false })')
    expect(edgeFunction).toContain('"setup_incomplete"')
  })
})
