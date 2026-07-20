import type { User } from '../types'
import {
  ApiRequestError,
  apiRequest,
  envelopeData,
  isApiConnected,
  storeApiSession,
  type ApiSession,
} from './api'
import { mapSafeUserRow } from './userProfile'

export type ManagedUserCreate = Omit<User, 'id' | 'createdAt' | 'authUserId' | 'mfaEnabled' | 'mfaSecret' | 'mfaRecoveryCodes' | 'firstLogin'> & {
  password: string
  firstLogin: true
}

export type ManagedUserUpdate = Pick<User,
  'name' | 'email' | 'username' | 'role' | 'avatar' | 'status' | 'team' | 'managerId'
>

type ManageUsersRequest =
  | { action: 'complete-first-login'; password: string }
  | { action: 'create'; user: ManagedUserCreate }
  | { action: 'update'; userId: string; updates: Partial<ManagedUserUpdate> }
  | { action: 'delete'; userId: string }
  | { action: 'reset-password'; userId: string; password: string }

type ServiceError = {
  code?: string
  message?: string
}

type ManageUsersResponse = {
  user?: Record<string, unknown>
  users?: Record<string, unknown>[]
  alreadyComplete?: boolean
  session?: ApiSession
  error?: ServiceError | string
}

export type ServiceFailure = {
  ok: false
  code: string
  error: string
  retryable: boolean
}

export type ManageUserResult =
  | { ok: true; user?: User; users?: User[] }
  | ServiceFailure

export type FirstLoginCompletionResult =
  | { ok: true; profile: User; alreadyComplete: boolean }
  | ServiceFailure

const NON_RETRYABLE_CODES = new Set([
  'account_inactive',
  'forbidden',
  'invalid_json',
  'invalid_manager',
  'invalid_request',
  'last_admin',
  'method_not_allowed',
  'origin_denied',
  'self_delete',
  'self_lockout',
  'setup_required',
  'unauthorized',
  'unsupported_action',
  'user_not_found',
  'weak_password',
])

function serviceFailure(
  code: string,
  message: string,
  retryable = !NON_RETRYABLE_CODES.has(code),
): ServiceFailure {
  return { ok: false, code, error: message, retryable }
}

function serviceErrorFromPayload(value: unknown): ServiceError | null {
  if (typeof value === 'string' && value.trim()) return { message: value.trim() }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.error !== undefined && record.error !== value) return serviceErrorFromPayload(record.error)
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  }
}

async function invokeUserService(request: ManageUsersRequest): Promise<
  | { ok: true; response: ManageUsersResponse }
  | ServiceFailure
> {
  if (!isApiConnected) {
    return serviceFailure('service_not_configured', 'User management is not configured.', false)
  }

  const firstLogin = request.action === 'complete-first-login'
  const path = firstLogin ? '/auth/first-login' : '/admin/users/actions'
  const body = firstLogin ? { password: request.password } : request

  try {
    const raw = await apiRequest<unknown>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const response = envelopeData<ManageUsersResponse>(raw) ?? {}
    const payloadError = serviceErrorFromPayload(response.error)
    if (payloadError) {
      const code = payloadError.code || 'request_failed'
      return serviceFailure(code, payloadError.message || 'The user-management request failed.')
    }
    if (firstLogin && response.session) storeApiSession(response.session, 'USER_UPDATED')
    return { ok: true, response }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return serviceFailure(error.code, error.message)
    }
    return serviceFailure(
      'service_unavailable',
      'The user-management service could not be reached. Please retry.',
    )
  }
}

export async function invokeManageUsers(
  request: Exclude<ManageUsersRequest, { action: 'complete-first-login' }>,
): Promise<ManageUserResult> {
  const result = await invokeUserService(request)
  if (!result.ok) return result

  return {
    ok: true,
    user: result.response.user ? mapSafeUserRow(result.response.user) : undefined,
    users: result.response.users?.map(mapSafeUserRow),
  }
}

export async function invokeFirstLoginCompletion(
  password: string,
): Promise<FirstLoginCompletionResult> {
  const result = await invokeUserService({ action: 'complete-first-login', password })
  if (!result.ok) return result

  if (!result.response.user) {
    return serviceFailure(
      'setup_incomplete',
      'Account setup did not return a completed profile. Please retry.',
    )
  }

  const profile = mapSafeUserRow(result.response.user)
  if (!profile.id || profile.firstLogin) {
    return serviceFailure(
      'setup_incomplete',
      'Account setup is not complete yet. Please retry.',
    )
  }

  return {
    ok: true,
    profile,
    alreadyComplete: result.response.alreadyComplete === true,
  }
}
