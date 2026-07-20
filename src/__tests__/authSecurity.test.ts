import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapSafeUserRow, SAFE_USER_COLUMNS } from '../lib/userProfile'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const profileEq = vi.fn(() => ({ maybeSingle }))
  const profileSelect = vi.fn(() => ({ eq: profileEq }))
  const from = vi.fn(() => ({ select: profileSelect }))
  const signInWithPassword = vi.fn()
  const getSession = vi.fn()
  const getUser = vi.fn()
  const signOut = vi.fn()
  const unsubscribe = vi.fn()
  let authCallback: ((event: string, session: unknown) => void) | null = null
  const onAuthStateChange = vi.fn((callback: (event: string, session: unknown) => void) => {
    authCallback = callback
    return { data: { subscription: { unsubscribe } } }
  })
  const emitAuth = (event: string, session: unknown) => authCallback?.(event, session)
  const invokeFirstLoginCompletion = vi.fn()

  return {
    maybeSingle,
    profileEq,
    profileSelect,
    from,
    signInWithPassword,
    getSession,
    getUser,
    signOut,
    unsubscribe,
    onAuthStateChange,
    emitAuth,
    invokeFirstLoginCompletion,
  }
})

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: true,
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: mocks.from,
  },
}))

vi.mock('../lib/userManagement', () => ({
  invokeFirstLoginCompletion: mocks.invokeFirstLoginCompletion,
}))

import {
  authenticateWithPassword,
  completeSupabaseFirstLogin,
  revalidateAuthenticatedProfile,
  restoreAuthenticatedProfile,
  sessionStartedAt,
  subscribeToAuthSessionChanges,
} from '../lib/auth'

const safeRow = {
  id: 'profile-1',
  auth_user_id: 'auth-1',
  name: 'Example User',
  email: 'user@example.com',
  username: 'user',
  role: 'ASSOCIATE',
  avatar: 'EU',
  status: 'active',
  first_login: false,
  team: 'BD',
  manager_id: null,
  created_at: '2026-07-20T00:00:00Z',
}

describe('Supabase Auth boundary', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.maybeSingle.mockResolvedValue({ data: safeRow, error: null })
    mocks.invokeFirstLoginCompletion.mockResolvedValue({
      ok: true,
      profile: mapSafeUserRow({ ...safeRow, first_login: false }),
      alreadyComplete: false,
    })
  })

  it('authenticates with Supabase and loads only the linked safe profile', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-1' }, session: { user: { id: 'auth-1' } } },
      error: null,
    })

    const result = await authenticateWithPassword('user@example.com', 'not-logged')

    expect(result.ok).toBe(true)
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'not-logged',
    })
    expect(mocks.from).toHaveBeenCalledWith('users')
    expect(mocks.profileSelect).toHaveBeenCalledWith(SAFE_USER_COLUMNS)
    expect(mocks.profileEq).toHaveBeenCalledWith('auth_user_id', 'auth-1')
    expect(result.ok && result.profile).not.toHaveProperty('password')
    expect(result.ok && result.profile).not.toHaveProperty('mfaSecret')
  })

  it('restores an existing Auth session before loading the profile', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-1' } } },
      error: null,
    })

    const result = await restoreAuthenticatedProfile()

    expect(result.profile?.authUserId).toBe('auth-1')
    expect(mocks.profileEq).toHaveBeenCalledWith('auth_user_id', 'auth-1')
  })

  it('derives the absolute session start from last_sign_in_at', () => {
    const lastSignIn = '2026-07-19T10:15:30.000Z'
    expect(sessionStartedAt({
      user: { last_sign_in_at: lastSignIn },
    } as never, 123)).toBe(Date.parse(lastSignIn))
    expect(sessionStartedAt({ user: {} } as never, 123)).toBe(123)
  })

  it('revalidates the Auth user remotely before loading its profile', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })

    const result = await revalidateAuthenticatedProfile('auth-1')

    expect(result.ok).toBe(true)
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.profileEq).toHaveBeenCalledWith('auth_user_id', 'auth-1')
  })

  it('marks only explicit transient profile failures as retryable', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST000', message: 'Database connection unavailable' },
    })

    await expect(revalidateAuthenticatedProfile('auth-1')).resolves.toMatchObject({
      ok: false,
      code: 'profile_temporarily_unavailable',
      retryable: true,
    })
  })

  it('defers auth event work and unsubscribes without leaving queued handlers', async () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    const unsubscribe = subscribeToAuthSessionChanges(handler)
    const session = { user: { id: 'auth-1' } }

    mocks.emitAuth('TOKEN_REFRESHED', session)
    expect(handler).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(handler).toHaveBeenCalledWith('TOKEN_REFRESHED', session)

    mocks.emitAuth('USER_UPDATED', session)
    unsubscribe()
    await vi.runAllTimersAsync()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('delegates first-login completion to the protected server action', async () => {
    const result = await completeSupabaseFirstLogin('NewPassword1!')

    expect(result.ok).toBe(true)
    expect(mocks.invokeFirstLoginCompletion).toHaveBeenCalledWith('NewPassword1!')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('preserves an explicit retryable partial-completion contract', async () => {
    mocks.invokeFirstLoginCompletion.mockResolvedValue({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })

    await expect(completeSupabaseFirstLogin('NewPassword1!')).resolves.toEqual({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })
  })

  it('maps camelCase Edge Function profiles without accepting sensitive fields', () => {
    const profile = mapSafeUserRow({
      id: 'profile-2',
      authUserId: 'auth-2',
      name: 'Managed User',
      email: 'managed@example.com',
      username: 'managed',
      role: 'TEAM_LEAD',
      avatar: 'MU',
      status: 'active',
      firstLogin: true,
      team: 'OPS',
      managerId: 'profile-1',
      createdAt: '2026-07-20',
      password: 'ignored',
      mfaSecret: 'ignored',
    })

    expect(profile).toMatchObject({
      authUserId: 'auth-2',
      firstLogin: true,
      managerId: 'profile-1',
      createdAt: '2026-07-20',
    })
    expect(profile).not.toHaveProperty('password')
    expect(profile).not.toHaveProperty('mfaSecret')
  })
})
