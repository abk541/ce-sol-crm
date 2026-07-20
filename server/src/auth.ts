import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import { asServiceUser, transaction, type Queryable } from './db.js'
import type { AuthenticatedSession, Dependencies, SafeProfileRow } from './types.js'

const SAFE_PROFILE_COLUMNS = [
  'id',
  'auth_user_id',
  'name',
  'email',
  'username',
  'role',
  'avatar',
  'status',
  'first_login',
  'mfa_enabled',
  'created_at',
  'team',
  'manager_id',
] as const

const SAFE_PROFILE_SQL = SAFE_PROFILE_COLUMNS.map((column) => `p.${column}`).join(', ')
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include one uppercase letter, one number, and one special character.'

interface SessionLookupRow extends SafeProfileRow {
  session_id: string
  account_id: string
  session_created_at: Date
  expires_at: Date
  password_version: number
  current_password_version: number
}

interface LoginLookupRow extends SafeProfileRow {
  account_id: string
  encrypted_password: string
  password_version: number
}

export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
    && Buffer.byteLength(password, 'utf8') <= 72
}

function safeProfile(row: SafeProfileRow): SafeProfileRow {
  return Object.fromEntries(
    SAFE_PROFILE_COLUMNS.map((column) => [column, row[column]]),
  ) as unknown as SafeProfileRow
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function bearerToken(request: FastifyRequest): string | null {
  const match = request.headers.authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{40,128})$/i)
  return match?.[1] ?? null
}

function sessionUser(session: AuthenticatedSession): Record<string, unknown> {
  return {
    id: session.accountId,
    last_sign_in_at: session.createdAt.toISOString(),
  }
}

export function sessionEnvelope(session: AuthenticatedSession, includeToken = false): Record<string, unknown> {
  return {
    user: session.profile,
    session: {
      ...(includeToken && session.rawToken ? { access_token: session.rawToken } : {}),
      expires_at: session.expiresAt.toISOString(),
      user: sessionUser(session),
    },
  }
}

async function createSession(
  client: Queryable,
  accountId: string,
  passwordVersion: number,
  now: Date,
  ttlSeconds: number,
  request: FastifyRequest,
): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  const id = randomUUID()
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const userAgent = request.headers['user-agent']?.slice(0, 512) ?? null
  const remoteAddress = request.ip || null
  await client.query(
    `insert into app_auth.sessions
      (id, account_id, token_hash, password_version, created_at, expires_at, user_agent, remote_address)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, accountId, hashToken(rawToken), passwordVersion, now, expiresAt, userAgent, remoteAddress],
  )
  return { id, rawToken, expiresAt }
}

export async function authenticateRequest(
  request: FastifyRequest,
  dependencies: Dependencies,
): Promise<AuthenticatedSession> {
  const token = bearerToken(request)
  if (!token) throw new ApiError(401, 'unauthorized', 'A valid access token is required.')

  const result = await dependencies.db.query<SessionLookupRow>(
    `select s.id as session_id,
            s.account_id,
            s.created_at as session_created_at,
            s.expires_at,
            s.password_version,
            a.password_version as current_password_version,
            ${SAFE_PROFILE_SQL}
       from app_auth.sessions s
       join app_auth.accounts a on a.id = s.account_id
       join public.users p on p.auth_user_id = a.id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > $2
      limit 1`,
    [hashToken(token), dependencies.now()],
  )
  const row = result.rows[0]
  if (!row || row.password_version !== row.current_password_version) {
    throw new ApiError(401, 'session_invalid', 'The authenticated session is no longer valid.')
  }
  if (row.status !== 'active') {
    throw new ApiError(403, 'account_inactive', 'This account is inactive. Contact an administrator.')
  }

  return {
    sessionId: row.session_id,
    accountId: row.account_id,
    profile: safeProfile(row),
    createdAt: new Date(row.session_created_at),
    expiresAt: new Date(row.expires_at),
  }
}

export async function requireAuthenticated(
  request: FastifyRequest,
  dependencies: Dependencies,
): Promise<void> {
  request.auth = await authenticateRequest(request, dependencies)
}

export async function requireCompleted(
  request: FastifyRequest,
  dependencies: Dependencies,
): Promise<void> {
  await requireAuthenticated(request, dependencies)
  if (request.auth?.profile.first_login !== false) {
    throw new ApiError(
      403,
      'setup_required',
      'Complete first-login password setup before using the workspace.',
    )
  }
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new ApiError(400, 'invalid_request', 'password is required.')
  }
  if (!passwordMeetsPolicy(value)) {
    throw new ApiError(400, 'weak_password', PASSWORD_POLICY_MESSAGE)
  }
  return value
}

export function registerAuthRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: dependencies.env.loginRateLimitMax,
          timeWindow: dependencies.env.loginRateLimitWindow,
          keyGenerator: (request: FastifyRequest) => {
            const body = request.body && typeof request.body === 'object'
              ? request.body as Record<string, unknown>
              : {}
            const identifier = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
            return `${request.ip}:${identifier}`
          },
        },
      },
    },
    async (request) => {
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['email', 'password'])
      const email = requiredString(body.email, 'email', 254).toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      if (!password || password.length > 1024) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
      }

      const accountResult = await dependencies.db.query<LoginLookupRow>(
        `select a.id as account_id, a.encrypted_password, a.password_version, ${SAFE_PROFILE_SQL}
           from app_auth.accounts a
           join public.users p on p.auth_user_id = a.id
          where lower(a.email) = $1
          limit 1`,
        [email],
      )
      const account = accountResult.rows[0]
      const valid = account?.encrypted_password
        ? await bcrypt.compare(password, account.encrypted_password).catch(() => false)
        : false
      if (!account || !valid || account.status !== 'active') {
        throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
      }

      const now = dependencies.now()
      const created = await transaction(dependencies.db, async (client) => {
        await client.query('update app_auth.accounts set last_sign_in_at = $2, updated_at = $2 where id = $1', [
          account.account_id,
          now,
        ])
        return createSession(
          client,
          account.account_id,
          account.password_version,
          now,
          dependencies.env.sessionTtlSeconds,
          request,
        )
      })

      const session: AuthenticatedSession = {
        sessionId: created.id,
        accountId: account.account_id,
        profile: safeProfile(account),
        createdAt: now,
        expiresAt: created.expiresAt,
        rawToken: created.rawToken,
      }
      return { data: sessionEnvelope(session, true), error: null }
    },
  )

  app.get(
    '/api/v1/auth/session',
    { preHandler: (request) => requireAuthenticated(request, dependencies) },
    async (request) => ({ data: sessionEnvelope(request.auth as AuthenticatedSession), error: null }),
  )

  app.post(
    '/api/v1/auth/logout',
    { preHandler: (request) => requireAuthenticated(request, dependencies) },
    async (request) => {
      await dependencies.db.query(
        'update app_auth.sessions set revoked_at = coalesce(revoked_at, $2) where id = $1',
        [request.auth?.sessionId, dependencies.now()],
      )
      return { data: null, error: null }
    },
  )

  app.post(
    '/api/v1/auth/first-login',
    { preHandler: (request) => requireAuthenticated(request, dependencies) },
    async (request) => {
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['password'])
      const password = parsePassword(body.password)
      const passwordHash = await bcrypt.hash(password, 12)
      const now = dependencies.now()
      const current = request.auth as AuthenticatedSession

      const result = await asServiceUser(dependencies.db, current.accountId, async (client: PoolClient) => {
        const locked = await client.query<{
          first_login: boolean
          password_version: number
        }>(
          `select p.first_login, a.password_version
             from app_auth.accounts a
             join public.users p on p.auth_user_id = a.id
            where a.id = $1
            for update of a, p`,
          [current.accountId],
        )
        const account = locked.rows[0]
        if (!account) throw new ApiError(404, 'profile_missing', 'The account profile was not found.')
        if (!account.first_login) {
          return { alreadyComplete: true, created: null, passwordVersion: account.password_version }
        }

        const passwordVersion = account.password_version + 1
        await client.query(
          `update app_auth.accounts
              set encrypted_password = $2, password_version = $3, updated_at = $4
            where id = $1`,
          [current.accountId, passwordHash, passwordVersion, now],
        )
        await client.query(
          'update public.users set first_login = false where auth_user_id = $1 and first_login = true',
          [current.accountId],
        )
        await client.query(
          'update app_auth.sessions set revoked_at = $2 where account_id = $1 and revoked_at is null',
          [current.accountId, now],
        )
        const created = await createSession(
          client,
          current.accountId,
          passwordVersion,
          now,
          dependencies.env.sessionTtlSeconds,
          request,
        )
        return { alreadyComplete: false, created, passwordVersion }
      })

      if (result.alreadyComplete || !result.created) {
        return {
          data: {
            user: current.profile,
            alreadyComplete: true,
            session: sessionEnvelope(current).session,
          },
          error: null,
        }
      }

      const profileResult = await dependencies.db.query<SafeProfileRow>(
        `select ${SAFE_PROFILE_COLUMNS.join(', ')} from public.users where auth_user_id = $1`,
        [current.accountId],
      )
      const profile = profileResult.rows[0]
      if (!profile) throw new ApiError(500, 'setup_incomplete', 'Account setup could not be verified.')
      const session: AuthenticatedSession = {
        sessionId: result.created.id,
        accountId: current.accountId,
        profile,
        createdAt: now,
        expiresAt: result.created.expiresAt,
        rawToken: result.created.rawToken,
      }
      return {
        data: {
          ...sessionEnvelope(session, true),
          alreadyComplete: false,
        },
        error: null,
      }
    },
  )
}
