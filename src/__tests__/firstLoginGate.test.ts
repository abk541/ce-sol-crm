import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockApiRequestError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status = 400) {
      super(message)
      this.code = code
      this.status = status
    }
  }
  return {
    MockApiRequestError,
    apiRequest: vi.fn(),
    storeApiSession: vi.fn(),
  }
})

vi.mock('../lib/api', () => ({
  ApiRequestError: mocks.MockApiRequestError,
  apiRequest: mocks.apiRequest,
  envelopeData: (payload: unknown) => (
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload
  ),
  isApiConnected: true,
  storeApiSession: mocks.storeApiSession,
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

const rotatedSession = {
  access_token: 'rotated-opaque-token',
  expires_at: '2026-07-21T00:00:00Z',
  user: { id: 'auth-1', last_sign_in_at: '2026-07-20T00:00:00Z' },
}

describe('first-login API action client contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invokes only the protected completion action and persists its rotated session', async () => {
    mocks.apiRequest.mockResolvedValue({
      data: { user: completedProfile, alreadyComplete: true, session: rotatedSession },
    })

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toEqual({
      ok: true,
      profile: completedProfile,
      alreadyComplete: true,
    })
    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/first-login', {
      method: 'POST',
      body: JSON.stringify({ password: 'NewPassword1!' }),
    })
    expect(mocks.storeApiSession).toHaveBeenCalledWith(rotatedSession, 'USER_UPDATED')
  })

  it('preserves the server error code and retryability contract', async () => {
    mocks.apiRequest.mockRejectedValue(
      new mocks.MockApiRequestError('Retry with the same new password.', 'setup_incomplete', 409),
    )

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toEqual({
      ok: false,
      code: 'setup_incomplete',
      error: 'Retry with the same new password.',
      retryable: true,
    })
  })

  it('fails closed when the service returns a still-pending profile', async () => {
    mocks.apiRequest.mockResolvedValue({
      data: { user: { ...completedProfile, firstLogin: true }, session: rotatedSession },
    })

    await expect(invokeFirstLoginCompletion('NewPassword1!')).resolves.toMatchObject({
      ok: false,
      code: 'setup_incomplete',
      retryable: true,
    })
  })
})
