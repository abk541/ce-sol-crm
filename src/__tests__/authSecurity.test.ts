import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  const clearApiChallenge = vi.fn()
  const clearApiSession = vi.fn()
  const storeApiChallenge = vi.fn()
  const storeApiSession = vi.fn()
  const getApiAccessToken = vi.fn(() => 'opaque-token')
  const getApiChallengeToken = vi.fn((): string | null => null)
  const getStoredApiChallenge = vi.fn(() => null)
  const getStoredApiSession = vi.fn(() => null)
  const unsubscribe = vi.fn()
  let authCallback: ((event: string, session: unknown) => void) | null = null
  const subscribeToApiAuthEvents = vi.fn((callback: (event: string, session: unknown) => void) => {
    authCallback = callback
    return unsubscribe
  })
  const emitAuth = (event: string, session: unknown) => authCallback?.(event, session)
  return {
    MockApiRequestError,
    apiRequest,
    clearApiChallenge,
    clearApiSession,
    storeApiChallenge,
    storeApiSession,
    getApiAccessToken,
    getApiChallengeToken,
    getStoredApiChallenge,
    getStoredApiSession,
    subscribeToApiAuthEvents,
    unsubscribe,
    emitAuth,
  }
})

vi.mock('../lib/api', () => ({
  ApiRequestError: mocks.MockApiRequestError,
  apiRequest: mocks.apiRequest,
  clearApiChallenge: mocks.clearApiChallenge,
  clearApiSession: mocks.clearApiSession,
  envelopeData: (payload: unknown) => (
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload
  ),
  getApiAccessToken: mocks.getApiAccessToken,
  getApiChallengeToken: mocks.getApiChallengeToken,
  getStoredApiChallenge: mocks.getStoredApiChallenge,
  getStoredApiSession: mocks.getStoredApiSession,
  isApiConnected: true,
  storeApiChallenge: mocks.storeApiChallenge,
  storeApiSession: mocks.storeApiSession,
  subscribeToApiAuthEvents: mocks.subscribeToApiAuthEvents,
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
    mocks.getApiChallengeToken.mockReturnValue(null)
  })

  it('authenticates through the private API and persists only its opaque session', async () => {
    mocks.apiRequest.mockResolvedValue({ data: { user: safeRow, session: apiSession } })

    const result = await authenticateWithPassword(' user@example.com ', 'not-logged')

    expect(result.ok).toBe(true)
    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'not-logged', mfaSupported: true }),
    }, { auth: false })
    expect(mocks.storeApiSession).toHaveBeenCalledWith(apiSession)
    expect(result.ok && result.profile).not.toHaveProperty('password')
    expect(result.ok && result.profile).not.toHaveProperty('mfaSecret')
  })

  it.each([
    [401, 'invalid_credentials', 'invalid_credentials', false, 'Invalid email or password.'],
    [0, 'network_error', 'auth_unreachable', true, 'could not be reached'],
    [404, 'not_found', 'outdated_client', true, 'outdated CRM version'],
    [429, 'rate_limited', 'login_rate_limited', true, 'Wait one minute'],
    [503, 'service_unavailable', 'auth_temporarily_unavailable', true, 'temporarily unavailable'],
  ])(
    'maps login failure status %i without destroying another tab session',
    async (status, apiCode, expectedCode, retryable, message) => {
      mocks.apiRequest.mockRejectedValue(
        new mocks.MockApiRequestError('Server detail', apiCode, status),
      )

      const result = await authenticateWithPassword('user@example.com', 'not-logged')

      expect(result).toMatchObject({
        ok: false,
        code: expectedCode,
        retryable,
      })
      expect(!result.ok && result.error).toContain(message)
      expect(mocks.clearApiSession).not.toHaveBeenCalled()
    },
  )

  it('restores an existing API session and safe profile', async () => {
    mocks.apiRequest.mockResolvedValue({ data: { user: safeRow, session: apiSession } })

    const result = await restoreAuthenticatedProfile()

    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/session', {}, {
      auth: 'session',
      authToken: 'opaque-token',
    })
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

  it('continues first-login through the provisional challenge without issuing a workspace session', async () => {
    mocks.getApiChallengeToken.mockReturnValue('challenge-token')
    mocks.apiRequest.mockResolvedValue({
      data: {
        user: { ...safeRow, first_login: false },
        stage: 'mfa_enroll',
        challenge: {
          access_token: 'rotated-challenge',
          user: { id: 'auth-1' },
        },
      },
    })
    const result = await completeFirstLoginPassword('NewPassword1!')

    expect(result).toMatchObject({ ok: true, stage: 'mfa_enroll' })
    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/first-login', {
      method: 'POST',
      body: JSON.stringify({ password: 'NewPassword1!' }),
    }, { auth: 'challenge', authToken: 'challenge-token' })
    expect(mocks.storeApiChallenge).toHaveBeenCalled()
  })

  it('preserves a retryable service failure during first-login continuation', async () => {
    mocks.getApiChallengeToken.mockReturnValue('challenge-token')
    mocks.apiRequest.mockRejectedValue(
      new mocks.MockApiRequestError('Unavailable', 'service_unavailable', 503),
    )

    await expect(completeFirstLoginPassword('NewPassword1!')).resolves.toMatchObject({
      ok: false,
      code: 'auth_temporarily_unavailable',
      retryable: true,
    })
  })
})
