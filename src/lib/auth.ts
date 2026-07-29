import type { User } from '../types'
import {
  ApiRequestError,
  apiRequest,
  clearApiChallenge,
  clearApiSession,
  envelopeData,
  getApiAccessToken,
  getApiChallengeToken,
  getStoredApiChallenge,
  getStoredApiSession,
  isApiConnected,
  storeApiChallenge,
  storeApiSession,
  subscribeToApiAuthEvents,
  type ApiAuthEvent,
  type ApiAuthStage,
  type ApiChallenge,
  type ApiSession,
} from './api'
import type { ServiceFailure } from './userManagement'
import { mapSafeUserRow } from './userProfile'

export interface AuthSuccess {
  ok: true
  profile: User
  stage: ApiAuthStage
  session?: ApiSession
  challenge?: ApiChallenge
}

export type ProfileResult =
  | { ok: true; profile: User }
  | ServiceFailure

export type LoginResult = AuthSuccess | ServiceFailure
export type ResilientAuthEvent = ApiAuthEvent

interface AuthPayload {
  user?: Record<string, unknown>
  profile?: Record<string, unknown>
  stage?: ApiAuthStage
  session?: ApiSession
  challenge?: ApiChallenge
  recoveryCodes?: string[]
}

type AuthCredentialKind = 'session' | 'challenge'

interface AuthCredentialSnapshot {
  kind: AuthCredentialKind
  token: string
  sessionToken: string | null
  challengeToken: string | null
}

interface AuthTokenGeneration {
  sessionToken: string | null
  challengeToken: string | null
}

export interface MfaEnrollmentResult {
  manualKey: string
  otpauthUrl: string
}

const PENDING_STAGES = new Set<ApiAuthStage>([
  'first_login',
  'mfa_enroll',
  'mfa_verify',
  'mfa_recovery',
])
const GENERIC_LOGIN_ERROR = 'Invalid email or password.'
const LOGIN_CONNECTION_ERROR = 'The sign-in service could not be reached. Check your connection and try again.'
const LOGIN_SERVICE_ERROR = 'The sign-in service is temporarily unavailable. Try again shortly.'
const OUTDATED_CLIENT_ERROR = 'This browser loaded an outdated CRM version. Close all CRM tabs, reopen the site, and try again.'
const LOGIN_RATE_LIMIT_ERROR = 'Too many sign-in attempts. Wait one minute and try again.'
const MFA_EXPIRED_ERROR = 'This sign-in attempt expired. Sign in again to continue.'
const RECOVERY_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/
const RECOVERY_CODE_COUNT = 10

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

function safeLoginFailure(error: unknown): ServiceFailure {
  if (!(error instanceof ApiRequestError)) {
    return authFailure('login_failed', LOGIN_SERVICE_ERROR, true)
  }
  if (error.status === 401 || error.code === 'invalid_credentials') {
    return authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
  }
  if (error.status === 429) {
    return authFailure('login_rate_limited', LOGIN_RATE_LIMIT_ERROR, true)
  }
  if (error.status === 404) {
    return authFailure('outdated_client', OUTDATED_CLIENT_ERROR, true)
  }
  if (error.status === 0 || error.code === 'network_error') {
    return authFailure('auth_unreachable', LOGIN_CONNECTION_ERROR, true)
  }
  if (error.status >= 500 || isRetryableAuthError(error)) {
    return authFailure('auth_temporarily_unavailable', LOGIN_SERVICE_ERROR, true)
  }
  return authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
}

function safeMfaFailure(error: unknown): ServiceFailure {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) {
      return authFailure('mfa_rate_limited', 'Too many attempts. Sign in again and retry.', false)
    }
    if (['challenge_invalid', 'mfa_required', 'unauthorized'].includes(error.code)) {
      return authFailure('challenge_invalid', MFA_EXPIRED_ERROR, false)
    }
    if (error.code === 'invalid_mfa_code') {
      return authFailure(error.code, 'That code is invalid, expired, or already used.', false)
    }
    if (error.status >= 500 || isRetryableAuthError(error)) {
      return authFailure(
        'auth_temporarily_unavailable',
        'Two-factor authentication is temporarily unavailable. Try again shortly.',
        true,
      )
    }
    return authFailure(error.code || 'mfa_failed', error.message || 'Two-factor authentication failed.')
  }
  return authFailure(
    'mfa_failed',
    'Two-factor authentication is temporarily unavailable. Try again shortly.',
    true,
  )
}

function safeRecoveryCodes(value: unknown): string[] | null {
  if (
    !Array.isArray(value)
    || value.length !== RECOVERY_CODE_COUNT
    || !value.every(code => typeof code === 'string' && RECOVERY_CODE_PATTERN.test(code))
  ) {
    return null
  }
  const codes = [...value] as string[]
  return new Set(codes).size === RECOVERY_CODE_COUNT ? codes : null
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

function captureAuthCredential(
  kind: AuthCredentialKind | 'any',
): AuthCredentialSnapshot | null {
  const { challengeToken, sessionToken } = captureAuthTokenGeneration()
  if (kind === 'challenge' || kind === 'any') {
    if (challengeToken) {
      return {
        kind: 'challenge',
        token: challengeToken,
        sessionToken,
        challengeToken,
      }
    }
  }
  if (kind === 'session' || kind === 'any') {
    if (sessionToken) {
      return {
        kind: 'session',
        token: sessionToken,
        sessionToken,
        challengeToken,
      }
    }
  }
  return null
}

function captureAuthTokenGeneration(): AuthTokenGeneration {
  return {
    sessionToken: getApiAccessToken(),
    challengeToken: getApiChallengeToken(),
  }
}

function authTokenGenerationIsCurrent(generation: AuthTokenGeneration): boolean {
  return (
    getApiAccessToken() === generation.sessionToken
    && getApiChallengeToken() === generation.challengeToken
  )
}

function authCredentialIsCurrent(credential: AuthCredentialSnapshot): boolean {
  return (
    getApiChallengeToken() === credential.challengeToken
    && getApiAccessToken() === credential.sessionToken
    && (
      credential.kind === 'challenge'
        ? credential.challengeToken === credential.token
        : credential.sessionToken === credential.token
    )
  )
}

function authCredentialWasReplaced(credential: AuthCredentialSnapshot): boolean {
  const currentChallenge = getApiChallengeToken()
  const currentSession = getApiAccessToken()
  if (credential.kind === 'challenge') {
    return (
      (!!currentChallenge && currentChallenge !== credential.token)
      || currentSession !== credential.sessionToken
    )
  }
  return (
    (!!currentSession && currentSession !== credential.token)
    || currentChallenge !== credential.challengeToken
  )
}

function authStateChangedFailure(): ServiceFailure {
  return authFailure(
    'auth_state_changed',
    'A newer sign-in replaced this request. Continue with the current account.',
    true,
  )
}

function acceptAuthPayload(
  payload: AuthPayload,
  credential?: AuthCredentialSnapshot,
): LoginResult {
  // A response is valid only for the exact credential that initiated it. This
  // prevents a late response from one tab/account pairing its profile with a
  // newer token installed while the request was in flight.
  if (credential && !authCredentialIsCurrent(credential)) {
    return authStateChangedFailure()
  }
  const profileResult = validateActiveProfile(safeProfile(payload))
  if (!profileResult.ok) return profileResult
  const stage = payload.stage
    ?? (payload.session ? 'authenticated' : undefined)
  if (!stage) return authFailure('invalid_auth_response', 'The sign-in response was incomplete.')

  if (stage === 'authenticated') {
    const stored = credential?.kind === 'session'
      ? getStoredApiSession()
      : null
    const token = payload.session?.access_token
      ?? (credential?.kind === 'session' ? credential.token : null)
    const session = payload.session
      ? {
          ...stored,
          ...payload.session,
          access_token: token ?? undefined,
          user: { ...stored?.user, ...payload.session.user },
        }
      : stored && token
        ? { ...stored, access_token: token }
        : null
    if (!session?.user?.id || !session.access_token) {
      return authFailure('session_invalid', 'The authenticated session is no longer valid.')
    }
    if (session.user.id !== profileResult.profile.authUserId) {
      return authFailure('session_user_changed', 'The authenticated account changed unexpectedly.')
    }
    storeApiSession(session)
    return { ok: true, profile: profileResult.profile, stage, session }
  }

  if (!PENDING_STAGES.has(stage)) {
    return authFailure('invalid_auth_response', 'The sign-in response contained an unknown stage.')
  }
  const stored = credential?.kind === 'challenge'
    ? getStoredApiChallenge()
    : null
  const token = payload.challenge?.access_token
    ?? (credential?.kind === 'challenge' ? credential.token : null)
  const challenge = payload.challenge
    ? {
        ...stored,
        ...payload.challenge,
        access_token: token ?? undefined,
        user: { ...stored?.user, ...payload.challenge.user },
      }
    : stored && token
      ? { ...stored, access_token: token }
      : null
  if (!challenge?.user?.id || !challenge.access_token) {
    return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  }
  if (challenge.user.id !== profileResult.profile.authUserId) {
    return authFailure('session_user_changed', 'The authenticated account changed unexpectedly.')
  }
  storeApiChallenge(challenge)
  return { ok: true, profile: profileResult.profile, stage, challenge }
}

/** Resolve the absolute sign-in time without resetting it on session refresh. */
export function sessionStartedAt(session: ApiSession | ApiChallenge, fallback = Date.now()): number {
  const parsed = Date.parse(session.user.last_sign_in_at ?? '')
  const now = Date.now()
  return Number.isFinite(parsed) && parsed > 0 && parsed <= now + 5 * 60_000
    ? parsed
    : fallback
}

function storedAuthCredentialTimestamp(kind: AuthCredentialKind): number | null {
  const stored = kind === 'challenge'
    ? getStoredApiChallenge()
    : getStoredApiSession()
  const parsed = Date.parse(stored?.user.last_sign_in_at ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function fetchCurrentAuthState(): Promise<LoginResult> {
  const challengeCredential = captureAuthCredential('challenge')
  const sessionCredential = captureAuthCredential('session')
  if (!isApiConnected || (!challengeCredential && !sessionCredential)) {
    return authFailure('session_invalid', 'The authenticated session is no longer valid.')
  }

  const challengeTimestamp = challengeCredential
    ? storedAuthCredentialTimestamp('challenge')
    : null
  const sessionTimestamp = sessionCredential
    ? storedAuthCredentialTimestamp('session')
    : null
  const sessionIsNewer = (
    !!challengeCredential
    && !!sessionCredential
    && challengeTimestamp !== null
    && sessionTimestamp !== null
    && sessionTimestamp > challengeTimestamp
  )
  const candidates = sessionIsNewer
    ? [sessionCredential, challengeCredential]
    : [challengeCredential, sessionCredential]
  const ordered = candidates.filter(
    (candidate): candidate is AuthCredentialSnapshot => candidate !== null,
  )

  let error: unknown = null
  for (let index = 0; index < ordered.length; index += 1) {
    const original = ordered[index]!
    const credential = captureAuthCredential(original.kind)
    if (!credential || credential.token !== original.token) {
      return authStateChangedFailure()
    }
    try {
      const response = await apiRequest<unknown>('/auth/session', {}, {
        auth: credential.kind,
        authToken: credential.token,
      })
      return acceptAuthPayload(envelopeData<AuthPayload>(response), credential)
    } catch (requestError) {
      if (authCredentialWasReplaced(credential)) {
        return authStateChangedFailure()
      }
      error = requestError
      const canTryOtherCredential = (
        requestError instanceof ApiRequestError
        && requestError.status === 401
        && index + 1 < ordered.length
      )
      if (!canTryOtherCredential) break
    }
  }

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

/** Verify a completed API session remotely and reload its safe profile. */
export async function revalidateAuthenticatedProfile(
  expectedAuthUserId?: string,
): Promise<ProfileResult> {
  const result = await fetchCurrentAuthState()
  if (!result.ok) return result
  if (result.stage !== 'authenticated' || !result.session) {
    return authFailure('mfa_required', 'Complete two-factor authentication before using the workspace.')
  }
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
  const generation = captureAuthTokenGeneration()
  try {
    const response = await apiRequest<unknown>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password, mfaSupported: true }),
    }, { auth: false })
    if (!authTokenGenerationIsCurrent(generation)) return authStateChangedFailure()
    const result = acceptAuthPayload(envelopeData<AuthPayload>(response))
    return result.ok ? result : authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
  } catch (error) {
    // A failed unauthenticated attempt must not erase a valid session created
    // concurrently in another browser tab.
    if (!authTokenGenerationIsCurrent(generation)) return authStateChangedFailure()
    return safeLoginFailure(error)
  }
}

export async function restoreAuthenticatedProfile(): Promise<{
  initialized: true
  profile: User | null
  stage?: ApiAuthStage
  session?: ApiSession
  challenge?: ApiChallenge
  code?: string
  error?: string
  retryable?: boolean
}> {
  if (!getApiAccessToken() && !getApiChallengeToken()) {
    return { initialized: true, profile: null }
  }
  const result = await fetchCurrentAuthState()
  if (!result.ok) {
    if (!result.retryable) {
      clearApiSession()
      clearApiChallenge()
    }
    return {
      initialized: true,
      profile: null,
      code: result.code,
      error: result.error,
      retryable: result.retryable,
    }
  }
  return {
    initialized: true,
    profile: result.profile,
    stage: result.stage,
    session: result.session,
    challenge: result.challenge,
  }
}

export async function completeFirstLoginPassword(password: string): Promise<LoginResult> {
  const credential = captureAuthCredential('any')
  if (!isApiConnected || !credential) {
    return authFailure('auth_not_configured', 'Your authenticated profile is unavailable.')
  }
  try {
    const response = await apiRequest<unknown>('/auth/first-login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, { auth: credential.kind, authToken: credential.token })
    return acceptAuthPayload(envelopeData<AuthPayload>(response), credential)
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function startMfaEnrollment(): Promise<
  | { ok: true; enrollment: MfaEnrollmentResult }
  | ServiceFailure
> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  try {
    const response = await apiRequest<unknown>('/auth/mfa/enroll/start', {
      method: 'POST',
    }, { auth: 'challenge', authToken: credential.token })
    if (!authCredentialIsCurrent(credential)) return authStateChangedFailure()
    const enrollment = envelopeData<MfaEnrollmentResult>(response)
    if (!enrollment?.manualKey || !enrollment.otpauthUrl) {
      return authFailure('enrollment_incomplete', 'Authenticator enrollment could not be started.')
    }
    return { ok: true, enrollment }
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function confirmMfaEnrollment(code: string): Promise<
  | {
      ok: true
      profile: User
      recoveryCodes: string[]
      recoveryCodesNeedRestore?: boolean
    }
  | ServiceFailure
> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  try {
    const response = await apiRequest<unknown>('/auth/mfa/enroll/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }, { auth: 'challenge', authToken: credential.token })
    const payload = envelopeData<AuthPayload>(response)
    if (payload.stage !== 'mfa_recovery') {
      return authFailure(
        'enrollment_incomplete',
        'Authenticator enrollment did not reach recovery setup.',
      )
    }
    const accepted = acceptAuthPayload(payload, credential)
    if (!accepted.ok) return accepted
    const recoveryCodes = safeRecoveryCodes(payload.recoveryCodes)
    // The server has already advanced the challenge to its recovery stage. If
    // the one-time response body is incomplete, preserve that valid stage and
    // let the dedicated recovery endpoint reload the encrypted bundle.
    if (!recoveryCodes) {
      return {
        ok: true,
        profile: accepted.profile,
        recoveryCodes: [],
        recoveryCodesNeedRestore: true,
      }
    }
    return {
      ok: true,
      profile: accepted.profile,
      recoveryCodes,
    }
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function restoreMfaRecoveryCodes(): Promise<
  | { ok: true; recoveryCodes: string[] }
  | ServiceFailure
> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  try {
    const response = await apiRequest<unknown>('/auth/mfa/recovery', {
      method: 'POST',
    }, { auth: 'challenge', authToken: credential.token })
    if (!authCredentialIsCurrent(credential)) return authStateChangedFailure()
    const payload = envelopeData<{ recoveryCodes?: unknown }>(response)
    const recoveryCodes = safeRecoveryCodes(payload.recoveryCodes)
    if (!recoveryCodes) {
      return authFailure('enrollment_incomplete', 'Recovery codes could not be restored.')
    }
    return { ok: true, recoveryCodes }
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function acknowledgeMfaRecoveryCodes(): Promise<LoginResult> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  try {
    const response = await apiRequest<unknown>('/auth/mfa/enroll/complete', {
      method: 'POST',
    }, { auth: 'challenge', authToken: credential.token })
    return acceptAuthPayload(envelopeData<AuthPayload>(response), credential)
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function verifyMfaChallenge(input: {
  code?: string
  recoveryCode?: string
}): Promise<LoginResult> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return authFailure('challenge_invalid', MFA_EXPIRED_ERROR)
  try {
    const response = await apiRequest<unknown>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    }, { auth: 'challenge', authToken: credential.token })
    return acceptAuthPayload(envelopeData<AuthPayload>(response), credential)
  } catch (error) {
    if (authCredentialWasReplaced(credential)) return authStateChangedFailure()
    return safeMfaFailure(error)
  }
}

export async function cancelMfaChallenge(): Promise<void> {
  const credential = captureAuthCredential('challenge')
  if (!credential) return
  const request = apiRequest('/auth/mfa/cancel', { method: 'POST' }, {
    auth: 'challenge',
    authToken: credential.token,
  })
  // The request already captured its Authorization header. Remove the
  // provisional credential immediately so a completed cross-tab session can
  // be adopted while the best-effort server cancellation is still in flight.
  if (authCredentialIsCurrent(credential)) clearApiChallenge()
  try {
    await request
  } finally {
    if (authCredentialIsCurrent(credential)) clearApiChallenge()
  }
}

export async function signOutCurrentSession(): Promise<void> {
  const credentials = [
    { token: getApiChallengeToken(), auth: 'challenge' as const },
    { token: getApiAccessToken(), auth: 'session' as const },
  ]
  const attemptedTokens = new Set<string>()
  try {
    for (const credential of credentials) {
      if (!credential.token || attemptedTokens.has(credential.token)) continue
      attemptedTokens.add(credential.token)
      try {
        await apiRequest('/auth/logout', { method: 'POST' }, {
          auth: credential.auth,
          authToken: credential.token,
        })
      } catch {
        // Logout is best-effort because local credentials must still be
        // discarded if the server is temporarily unreachable. When both a
        // challenge and a completed session exist, each is attempted even if
        // revoking the other fails.
      }
    }
  } finally {
    const challenge = credentials[0].token
    const session = credentials[1].token
    if (challenge && getApiChallengeToken() === challenge) clearApiChallenge()
    if (session && getApiAccessToken() === session) clearApiSession()
  }
}

/**
 * Listen for completed-session invalidation and rotation in this tab and
 * other tabs. Provisional MFA challenges deliberately never broadcast.
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
