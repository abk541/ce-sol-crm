import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearApiChallenge,
  clearApiSession,
  getApiAccessToken,
  getApiChallengeToken,
  storeApiSession,
} from '../lib/api'
import {
  authenticateWithPassword,
  confirmMfaEnrollment,
  restoreAuthenticatedProfile,
  restoreMfaRecoveryCodes,
  signOutCurrentSession,
} from '../lib/auth'

const safeUser = {
  id: 'profile-1',
  auth_user_id: 'auth-1',
  name: 'MFA User',
  email: 'mfa@example.test',
  username: 'mfa-user',
  role: 'ASSOCIATE',
  avatar: 'MU',
  status: 'active',
  first_login: false,
  mfa_enabled: true,
  team: 'BD',
  manager_id: null,
  created_at: '2026-07-29T00:00:00Z',
}

const validRecoveryCodes = [...'23456789AB'].map(
  character => `ABCD-EFGH-JKLM-${character.repeat(4)}`,
)

function storeChallenge(token = 'challenge-token', lastSignInAt?: string) {
  window.sessionStorage.setItem('ces-crm-api-mfa-challenge', JSON.stringify({
    token,
    challenge: {
      user: {
        id: 'auth-1',
        ...(lastSignInAt ? { last_sign_in_at: lastSignInAt } : {}),
      },
    },
  }))
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data } : { error: data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('MFA browser authentication boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearApiSession({ broadcast: false, notify: false })
    clearApiChallenge()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('retries a completed session after an unremovable stale challenge is rejected', async () => {
    storeApiSession({ access_token: 'session-token', user: { id: 'auth-1' } })
    storeChallenge('stale-challenge')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(
        { code: 'challenge_invalid', message: 'Expired challenge' },
        401,
      ))
      .mockResolvedValueOnce(jsonResponse({
        stage: 'authenticated',
        user: safeUser,
        session: {
          user: { id: 'auth-1' },
          assurance_level: 'mfa',
        },
      }))

    const restored = await restoreAuthenticatedProfile()

    expect(restored.stage).toBe('authenticated')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer stale-challenge',
    )
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer session-token',
    )
    expect(getApiChallengeToken()).toBeNull()
    expect(getApiAccessToken()).toBe('session-token')
  })

  it('prefers a newer persisted completed session over an older tab-local challenge', async () => {
    storeApiSession({
      access_token: 'newer-session',
      user: {
        id: 'auth-1',
        last_sign_in_at: '2026-07-29T12:00:00.000Z',
      },
    })
    storeChallenge('older-challenge', '2026-07-29T11:00:00.000Z')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      stage: 'authenticated',
      user: safeUser,
      session: {
        user: {
          id: 'auth-1',
          last_sign_in_at: '2026-07-29T12:00:00.000Z',
        },
        assurance_level: 'mfa',
      },
    }))

    await expect(restoreAuthenticatedProfile()).resolves.toMatchObject({
      profile: expect.objectContaining({ authUserId: 'auth-1' }),
      stage: 'authenticated',
    })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer newer-session',
    )
    expect(getApiChallengeToken()).toBeNull()
    expect(getApiAccessToken()).toBe('newer-session')
  })

  it('best-effort revokes both distinct credentials before clearing local auth', async () => {
    storeApiSession({ access_token: 'session-token', user: { id: 'auth-1' } })
    storeChallenge('challenge-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }))

    await signOutCurrentSession()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(call =>
      new Headers(call[1]?.headers).get('Authorization'),
    )).toEqual(['Bearer challenge-token', 'Bearer session-token'])
    expect(getApiChallengeToken()).toBeNull()
    expect(getApiAccessToken()).toBeNull()
  })

  it('rejects partial, malformed, or duplicate recovery-code bundles', async () => {
    storeChallenge()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const recoveryCodes of [
      validRecoveryCodes.slice(0, 9),
      [...validRecoveryCodes.slice(0, 9), 'INVALID-CODE'],
      [...validRecoveryCodes.slice(0, 9), validRecoveryCodes[0]],
    ]) {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        stage: 'mfa_recovery',
        user: safeUser,
        challenge: { user: { id: 'auth-1' } },
        recoveryCodes,
      }))
      await expect(confirmMfaEnrollment('123456')).resolves.toMatchObject({
        ok: true,
        recoveryCodes: [],
        recoveryCodesNeedRestore: true,
      })
      expect(getApiChallengeToken()).toBe('challenge-token')
    }

    fetchMock.mockResolvedValueOnce(jsonResponse({ recoveryCodes: validRecoveryCodes }))
    await expect(restoreMfaRecoveryCodes()).resolves.toEqual({
      ok: true,
      recoveryCodes: validRecoveryCodes,
    })
  })

  it('rejects a late tokenless success without overwriting a newer account session', async () => {
    storeApiSession({ access_token: 'session-a', user: { id: 'auth-1' } })
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => (
      new Promise<Response>(resolve => { resolveResponse = resolve })
    ))

    const pending = restoreAuthenticatedProfile()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    storeApiSession({ access_token: 'session-b', user: { id: 'auth-2' } })
    resolveResponse(jsonResponse({
      stage: 'authenticated',
      user: safeUser,
      session: { user: { id: 'auth-1' }, assurance_level: 'mfa' },
    }))

    await expect(pending).resolves.toMatchObject({
      profile: null,
      code: 'auth_state_changed',
      retryable: true,
    })
    expect(getApiAccessToken()).toBe('session-b')
  })

  it('does not let a stale 401 clear or revoke a newer account session', async () => {
    storeApiSession({ access_token: 'session-a', user: { id: 'auth-1' } })
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => (
      new Promise<Response>(resolve => { resolveResponse = resolve })
    ))

    const pending = restoreAuthenticatedProfile()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    storeApiSession({ access_token: 'session-b', user: { id: 'auth-2' } })
    resolveResponse(jsonResponse(
      { code: 'session_invalid', message: 'Old session expired' },
      401,
    ))

    await expect(pending).resolves.toMatchObject({
      profile: null,
      code: 'auth_state_changed',
      retryable: true,
    })
    expect(getApiAccessToken()).toBe('session-b')
  })

  it('does not let a late password response replace a newer completed session', async () => {
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => (
      new Promise<Response>(resolve => { resolveResponse = resolve })
    ))

    const pending = authenticateWithPassword('a@example.test', 'ValidPassword1!')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    storeApiSession({ access_token: 'session-b', user: { id: 'auth-2' } })
    resolveResponse(jsonResponse({
      stage: 'mfa_verify',
      user: safeUser,
      challenge: {
        access_token: 'challenge-a',
        user: { id: 'auth-1' },
      },
    }))

    await expect(pending).resolves.toMatchObject({
      ok: false,
      code: 'auth_state_changed',
      retryable: true,
    })
    expect(getApiAccessToken()).toBe('session-b')
    expect(getApiChallengeToken()).toBeNull()
  })

  it('rejects a late challenge response when a cross-tab session changed beside it', async () => {
    storeApiSession({ access_token: 'old-session', user: { id: 'auth-1' } })
    storeChallenge('challenge-a')
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => (
      new Promise<Response>(resolve => { resolveResponse = resolve })
    ))

    const pending = restoreAuthenticatedProfile()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    window.localStorage.setItem('ces-crm-api-token', 'new-session')
    window.localStorage.setItem('ces-crm-api-session', JSON.stringify({
      user: { id: 'auth-2' },
    }))
    resolveResponse(jsonResponse({
      stage: 'mfa_verify',
      user: safeUser,
      challenge: { user: { id: 'auth-1' } },
    }))

    await expect(pending).resolves.toMatchObject({
      profile: null,
      code: 'auth_state_changed',
      retryable: true,
    })
    expect(getApiAccessToken()).toBe('new-session')
    expect(getApiChallengeToken()).toBe('challenge-a')
  })

  it('does not commit a wrong-stage enrollment response', async () => {
    storeChallenge('challenge-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      stage: 'mfa_enroll',
      user: safeUser,
      challenge: {
        access_token: 'unexpected-replacement',
        user: { id: 'auth-1' },
      },
    }))

    await expect(confirmMfaEnrollment('123456')).resolves.toMatchObject({
      ok: false,
      code: 'enrollment_incomplete',
    })
    expect(getApiChallengeToken()).toBe('challenge-token')
  })
})
