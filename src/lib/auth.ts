import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { User } from '../types'
import { isSupabaseConnected, supabase } from './supabase'
import { invokeFirstLoginCompletion, type ServiceFailure } from './userManagement'
import { mapSafeUserRow, SAFE_USER_COLUMNS } from './userProfile'

export type ProfileResult =
  | { ok: true; profile: User }
  | ServiceFailure

export type LoginResult = ProfileResult & {
  session?: Session
}

export type ResilientAuthEvent = Extract<
  AuthChangeEvent,
  'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'
>

const GENERIC_LOGIN_ERROR = 'Invalid email or password.'

function authFailure(
  code: string,
  error: string,
  retryable = false,
): ServiceFailure {
  return { ok: false, code, error, retryable }
}

function isRetryableAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown }
  const status = typeof candidate.status === 'number' ? candidate.status : 0
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  const name = typeof candidate.name === 'string' ? candidate.name : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  return name === 'AuthRetryableFetchError'
    || status === 0
    || status === 408
    || status === 429
    || status >= 500
    || ['request_timeout', 'over_request_rate_limit', 'unexpected_failure'].includes(code)
    || /network|fetch|timeout|temporar/i.test(message)
}

function isRetryableProfileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  return /^(PGRST00[0-3]|08|53|57P0[123]|58)/.test(code)
    || /network|fetch|timeout|temporar|connection/i.test(message)
}

/** Resolve the absolute Auth sign-in time without resetting it on token refresh. */
export function sessionStartedAt(session: Session, fallback = Date.now()): number {
  const parsed = Date.parse(session.user.last_sign_in_at ?? '')
  const now = Date.now()
  // Reject corrupt/future values while allowing a few minutes of clock skew.
  return Number.isFinite(parsed) && parsed > 0 && parsed <= now + 5 * 60_000
    ? parsed
    : fallback
}

async function loadProfile(authUserId: string): Promise<ProfileResult> {
  if (!supabase) {
    return authFailure('auth_not_configured', 'Authentication is not configured.')
  }

  const { data, error } = await supabase
    .from('users')
    .select(SAFE_USER_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    const retryable = isRetryableProfileError(error)
    return authFailure(
      retryable ? 'profile_temporarily_unavailable' : 'profile_lookup_failed',
      retryable
        ? 'Your profile could not be refreshed right now.'
        : 'Your application profile could not be verified.',
      retryable,
    )
  }
  if (!data) {
    return authFailure('profile_missing', 'Your account does not have an application profile.')
  }

  const profile = mapSafeUserRow(data as unknown as Record<string, unknown>)
  if (!profile.id || profile.status !== 'active') {
    return authFailure('account_inactive', 'This account is inactive. Contact an administrator.')
  }
  return { ok: true, profile }
}

/** Verify the current Auth user remotely, then reload its safe RLS profile. */
export async function revalidateAuthenticatedProfile(
  expectedAuthUserId?: string,
): Promise<ProfileResult> {
  if (!isSupabaseConnected || !supabase) {
    return authFailure('auth_not_configured', 'Authentication is not configured.')
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) {
    const retryable = isRetryableAuthError(error)
    return authFailure(
      retryable ? 'auth_temporarily_unavailable' : 'session_invalid',
      retryable
        ? 'The authenticated session could not be revalidated right now.'
        : 'The authenticated session is no longer valid.',
      retryable,
    )
  }
  if (!data.user) {
    return authFailure('session_invalid', 'The authenticated session is no longer valid.')
  }
  if (expectedAuthUserId && data.user.id !== expectedAuthUserId) {
    return authFailure('session_user_changed', 'The authenticated account changed unexpectedly.')
  }

  return loadProfile(data.user.id)
}

export async function authenticateWithPassword(email: string, password: string): Promise<LoginResult> {
  if (!isSupabaseConnected || !supabase) {
    return authFailure('auth_not_configured', 'Authentication is not configured.')
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.user || !data.session) {
    return authFailure('invalid_credentials', GENERIC_LOGIN_ERROR)
  }

  const profileResult = await loadProfile(data.user.id)
  if (!profileResult.ok) {
    await supabase.auth.signOut({ scope: 'local' })
    return profileResult
  }

  return { ...profileResult, session: data.session }
}

export async function restoreAuthenticatedProfile(): Promise<{
  initialized: true
  profile: User | null
  session?: Session
  code?: string
  error?: string
  retryable?: boolean
}> {
  if (!isSupabaseConnected || !supabase) {
    return { initialized: true, profile: null, error: 'Authentication is not configured.' }
  }

  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.user) return { initialized: true, profile: null }

  const profileResult = await loadProfile(data.session.user.id)
  if (!profileResult.ok) {
    if (!profileResult.retryable) await supabase.auth.signOut({ scope: 'local' })
    return {
      initialized: true,
      profile: null,
      session: data.session,
      code: profileResult.code,
      error: profileResult.error,
      retryable: profileResult.retryable,
    }
  }

  return { initialized: true, profile: profileResult.profile, session: data.session }
}

export async function completeSupabaseFirstLogin(password: string): Promise<ProfileResult> {
  if (!isSupabaseConnected || !supabase) {
    return authFailure(
      'auth_not_configured',
      'Your authenticated profile is unavailable.',
    )
  }

  // The protected function coordinates the Auth password update with the
  // authorization-bearing first_login flag. The browser has no direct UPDATE
  // privilege on that flag, so a client-side partial success cannot unlock the
  // workspace.
  return invokeFirstLoginCompletion(password)
}

export async function signOutCurrentSession(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut({ scope: 'local' })
}

/**
 * Subscribe only to events that can invalidate or mutate an existing session.
 * Supabase invokes auth callbacks while it owns an internal auth lock, so the
 * user handler is deferred to a later macrotask before it may call Auth again.
 */
export function subscribeToAuthSessionChanges(
  handler: (event: ResilientAuthEvent, session: Session | null) => void | Promise<void>,
): () => void {
  if (!supabase) return () => undefined

  let active = true
  const pending = new Set<ReturnType<typeof setTimeout>>()
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_OUT' && event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') return
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
    data.subscription.unsubscribe()
  }
}
