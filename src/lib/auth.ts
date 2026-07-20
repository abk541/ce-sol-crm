import type { User } from '../types'
import {
  ApiRequestError,
  apiRequest,
  clearApiSession,
  envelopeData,
  getApiAccessToken,
  getStoredApiSession,
  isApiConnected,
  storeApiSession,
  subscribeToApiAuthEvents,
  type ApiAuthEvent,
  type ApiSession,
} from './api'
import { invokeFirstLoginCompletion, type ServiceFailure } from './userManagement'
import { mapSafeUserRow } from './userProfile'

export type ProfileResult =
  | { ok: true; profile: User }
  | ServiceFailure

export type LoginResult = ProfileResult & {
  session?: ApiSession
}

export type ResilientAuthEvent = ApiAuthEvent

interface AuthPayload {
  user?: Record<string, unknown>
  profile?: Record<string, unknown>
  session?: ApiSession
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.'

function authFailure(
  code: string,
  error: string,
  retryable = false,
): ServiceFailure {
  return { ok: false, code, error, retryable }
}

function isRetryableAuthError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 0
      || error.status === 408
      || error.status === 429
      || error.status >= 500
      || ['network_error', 'request_timeout', 'service_unavailable', 'unexpected_failure'].includes(error.code)
  }
  const message = error instanceof Error ? error.message : ''
  return /network|fetch|timeout|temporar|connection/i.test(message)
}

function safeProfile(payload: AuthPayload): User | null {
  const row = payload.user ?? payload.profile
  if (!row) return null
  const profile = mapSafeUserRow(row)
  return profile.id ? profile : null
}

function validateActiveProfile(profile: User | null): ProfileResult {
  if (!profile) {
    return authFailure('profile_missing', 'Your account does not have an application profile.')
  }
  if (profile.status !== 'active') {
    return authFailure('account_inactive', 'This account is inactive. Contact an administrator.')
  }
  return { ok: true, profile }
}

/** Resolve the absolute sign-in time without resetting it on session refresh. */
export function sessionStartedAt(session: ApiSession, fallback = Date.now()): number {
  const parsed = Date.parse(session.user.last_sign_in_at ?? '')
  const now = Date.now()
  return Number.isFinite(parsed) && parsed > 0 && parsed <= now + 5 * 60_000
    ? parsed
    : fallback
}

async function fetchCurrentSession(): Promise<
  | { ok: true; profile: User; session: ApiSession }
  | ServiceFailure
> {
  if (!isApiConnected || !getApiAccessToken()) {
    return authFailure('session_invalid', 'The authenticated session is no longer valid.')
  }

  try {
    const response = await apiRequest<unknown>('/auth/session')
    const payload = envelopeData<AuthPayload>(response)
    const profileResult = validateActiveProfile(safeProfile(payload))
    if (!profileResult.ok) return profileResult

    const stored = getStoredApiSession()
    const session = payload.session ?? stored
    if (!session?.user?.id) {
      return authFailure('session_invalid', 'The authenticated session is no longer valid.')
    }
    const mergedSession: ApiSession = {
      ...stored,
      ...session,
      user: { ...stored?.user, ...session.user },
    }
    storeApiSession(mergedSession)
    return { ok: true, profile: profileResult.profile, session: mergedSession }
  } catch (error) {
    const retryable = isRetryableAuthError(error)
    const code = error instanceof ApiRequestError ? error.code : ''
    return authFailure(
      retryable ? 'auth_temporarily_unavailable' : code || 'session_invalid',
      retryable
        ? 'The authenticated session could not be revalidated right now.'
        : 'The authenticated session is no longer valid.',
      retryable,
    )
  }
}

/** Verify the current API session remotely and reload its safe profile. */
export async function revalidateAuthenticatedProfile(
  expectedAuthUserId?: string,
): Promise<ProfileResult> {
  const result = await fetchCurrentSession()
  if (!result.ok) return result
  const actualId = result.profile.authUserId ?? result.session.user.id
  if (expectedAuthUserId && actualId !== expectedAuthUserId) {
    return authFailure('session_user_changed', 'The authenticated account changed unexpectedly.')
  }
  return { ok: true, profile: result.profile }
}

export async function authenticateWithPassword(email: string, password: string): Promise<LoginResult> {
  if (!isApiConnected) {
    return authFailure('auth_not_configured', 'Authentication is not configured.')
  }

  try {
    const response = await apiRequest<unknown>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    }, { auth: false })
    const payload = envelopeData<AuthPayload>(response)
    const profileResult = validateActiveProfile(safeProfile(payload))
    if (!profileResult.ok || !payload.session?.access_token || !payload.session.user?.id) {
      clearApiSession()
      return profileResult.ok
        ? authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
        : profileResult
    }

    storeApiSession(payload.session)
    return { ...profileResult, session: payload.session }
  } catch {
    clearApiSession()
    // Login failures remain deliberately generic so account existence and
    // infrastructure details are not disclosed.
    return authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
  }
}

export async function restoreAuthenticatedProfile(): Promise<{
  initialized: true
  profile: User | null
  session?: ApiSession
  code?: string
  error?: string
  retryable?: boolean
}> {
  if (!getApiAccessToken()) return { initialized: true, profile: null }

  const result = await fetchCurrentSession()
  if (!result.ok) {
    if (!result.retryable) clearApiSession()
    return {
      initialized: true,
      profile: null,
      code: result.code,
      error: result.error,
      retryable: result.retryable,
    }
  }

  return { initialized: true, profile: result.profile, session: result.session }
}

export async function completeFirstLoginPassword(password: string): Promise<ProfileResult> {
  if (!isApiConnected || !getApiAccessToken()) {
    return authFailure('auth_not_configured', 'Your authenticated profile is unavailable.')
  }
  return invokeFirstLoginCompletion(password)
}

export async function signOutCurrentSession(): Promise<void> {
  if (!getApiAccessToken()) {
    clearApiSession()
    return
  }
  try {
    await apiRequest('/auth/logout', { method: 'POST' })
  } finally {
    clearApiSession()
  }
}

/**
 * Listen for session invalidation and rotation in this tab and other tabs.
 * Work is deferred so callers can safely perform their own session request.
 */
export function subscribeToAuthSessionChanges(
  handler: (event: ResilientAuthEvent, session: ApiSession | null) => void | Promise<void>,
): () => void {
  let active = true
  const pending = new Set<ReturnType<typeof setTimeout>>()
  const unsubscribe = subscribeToApiAuthEvents((event, session) => {
    const timer = setTimeout(() => {
      pending.delete(timer)
      if (!active) return
      void handler(event, session)
    }, 0)
    pending.add(timer)
  })

  return () => {
    active = false
    pending.forEach(clearTimeout)
    pending.clear()
    unsubscribe()
  }
}
