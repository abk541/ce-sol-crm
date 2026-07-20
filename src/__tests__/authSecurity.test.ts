import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapSafeUserRow } from '../lib/userProfile'

const mocks = vi.hoisted(() => {
  class MockApiRequestError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) {
      super(message)
      this.code = code
      this.status = status
    }
  }
  const apiRequest = vi.fn()
  const clearApiSession = vi.fn()
  const storeApiSession = vi.fn()
  const getApiAccessToken = vi.fn(() => 'opaque-token')
  const getStoredApiSession = vi.fn(() => null)
  const unsubscribe = vi.fn()
  let authCallback: ((event: string, session: unknown) => void) | null = null
  const subscribeToApiAuthEvents = vi.fn((callback: (event: string, session: unknown) => void) => {
    authCallback = callback
    return unsubscribe
  })
  const emitAuth = (event: string, session: unknown) => authCallback?.(event, session)
  const invokeFirstLoginCompletion = vi.fn()
  return {
    MockApiRequestError,
    apiRequest,
    clearApiSession,
    storeApiSession,
    getApiAccessToken,
    getStoredApiSession,
    subscribeToApiAuthEvents,
    unsubscribe,
    emitAuth,
    invokeFirstLoginCompletion,
  }
})

vi.mock('../lib/api', () => ({
  ApiRequestError: mocks.MockApiRequestError,
  apiRequest: mocks.apiRequest,
  clearApiSession: mocks.clearApiSession,
  envelopeData: (payload: unknown) => (
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload
  ),
  getApiAccessToken: mocks.getApiAccessToken,
  getStoredApiSession: mocks.getStoredApiSession,
  isApiConnected: true,
  storeApiSession: mocks.storeApiSession,
  subscribeToApiAuthEvents: mocks.subscribeToApiAuthEvents,
}))

vi.mock('../lib/userManagement', () => ({
  invokeFirstLoginCompletion: mocks.invokeFirstLoginCompletion,
}))

import {
  authenticateWithPassword,
  completeFirstLoginPassword,
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

const apiSession = {
  access_token: 'new-opaque-token',
  expires_at: '2026-07-21T00:00:00Z',
  user: { id: 'auth-1', last_sign_in_at: '2026-07-20T00:00:00Z' },
}

describe('private API authentication boundary', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mocks.getApiAccessToken.mockReturnValue('opaque-token')
    mocks.invokeFirstLoginCompletion.mockResolvedValue({
      ok: true,
      profile: mapSafeUserRow({ ...safeRow, first_login: false }),
      alreadyComplete: false,
    })
  })

  it('authenticates through the private API and persists only its opaque session', async () => {
    mocks.apiRequest.mockResolvedValue({ data: { user: safeRow, session: apiSession } })

    const result = await authenticateWithPassword(' user@example.com ', 'not-logged')

    expect(result.ok).toBe(true)
    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'not-logged' }),
    }, { auth: false })
    expect(mocks.storeApiSession).toHaveBeenCalledWith(apiSession)
    expect(result.ok && result.profile).not.toHaveProperty('password')
    expect(result.ok && result.profile).not.toHaveProperty('mfaSecret')
  })

  it('restores an existing API session and safe profile', async () => {
    mocks.apiRequest.mockResolvedValue({ data: { user: safeRow, session: apiSession } })

    const result = await restoreAuthenticatedProfile()

    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/session')
    expect(result.profile?.authUserId).toBe('auth-1')
  })

  it('derives the absolute session start from last_sign_in_at', () => {
    const lastSignIn = '2026-07-19T10:15:30.000Z'
    expect(sessionStartedAt({
      user: { id: 'auth-1', last_sign_in_at: lastSignIn },
    }, 123)).toBe(Date.parse(lastSignIn))
    expect(sessionStartedAt({ user: { id: 'auth-1' } }, 123)).toBe(123)
  })

  it('revalidates remotely and rejects an unexpected account switch', async () => {
    mocks.apiRequest.mockResolvedValue({ data: { user: safeRow, session: apiSession } })

    await expect(revalidateAuthenticatedProfile('auth-1')).resolves.toMatchObject({ ok: true })
    await expect(revalidateAuthenticatedProfile('another-auth-user')).resolves.toMatchObject({
      ok: false,
      code: 'session_user_changed',
    })
  })

  it('marks transient API failures as retryable', async () => {
    mocks.apiRequest.mockRejectedValue(
      new mocks.MockApiRequestError('Database temporarily unavailable', 'service_unavailable', 503),
    )

    await expect(revalidateAuthenticatedProfile('auth-1')).resolves.toMatchObject({
      ok: false,
      code: 'auth_temporarily_unavailable',
      retryable: true,
    })
  })

  it('defers cross-tab auth work and unsubscribes without queued handlers', async () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    const unsubscribe = subscribeToAuthSessionChanges(handler)

    mocks.emitAuth('TOKEN_REFRESHED', apiSession)
    expect(handler).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(handler).toHaveBeenCalledWith('TOKEN_REFRESHED', apiSession)

    mocks.emitAuth('USER_UPDATED', apiSession)
    unsubscribe()
    await vi.runAllTimersAsync()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('delegates first-login completion to the protected API action', async () => {
    const result = await completeFirstLoginPassword('NewPassword1!')

    expect(result.ok).toBe(true)
    expect(mocks.invokeFirstLoginCompletion).toHaveBeenCalledWith('NewPassword1!')
  })

  it('preserves an explicit retryable partial-completion contract', async () => {
    mocks.invokeFirstLoginCompletion.mockResolvedValue({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })

    await expect(completeFirstLoginPassword('NewPassword1!')).resolves.toEqual({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })
  })
})
