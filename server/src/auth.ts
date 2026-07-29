import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import { asServiceUser, transaction, type Queryable } from './db.js'
import type { MfaStage } from './mfa.js'
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
  assurance_level: 'legacy' | 'mfa'
  mfa_verified_at: Date | null
}

interface LoginLookupRow extends SafeProfileRow {
  account_id: string
  encrypted_password: string
  password_version: number
}

export interface MfaChallenge extends SafeProfileRow {
  challengeId: string
  accountId: string
  passwordVersion: number
  stage: MfaStage
  attemptsRemaining: number
  createdAt: Date
  expiresAt: Date
  rawToken?: string
}

interface ChallengeLookupRow extends SafeProfileRow {
  challenge_id: string
  account_id: string
  challenge_password_version: number
  current_password_version: number
  stage: MfaStage
  attempts_remaining: number
  challenge_created_at: Date
  expires_at: Date
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
    stage: 'authenticated',
    session: {
      ...(includeToken && session.rawToken ? { access_token: session.rawToken } : {}),
      expires_at: session.expiresAt.toISOString(),
      assurance_level: session.assuranceLevel,
      user: sessionUser(session),
    },
  }
}

export async function createSession(
  client: Queryable,
  accountId: string,
  passwordVersion: number,
  now: Date,
  ttlSeconds: number,
  request: FastifyRequest,
  assuranceLevel: 'legacy' | 'mfa',
): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  const id = randomUUID()
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const userAgent = request.headers['user-agent']?.slice(0, 512) ?? null
  const remoteAddress = request.ip || null
  await client.query(
    `insert into app_auth.sessions
      (id, account_id, token_hash, password_version, created_at, expires_at,
       user_agent, remote_address, assurance_level, mfa_verified_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      accountId,
      hashToken(rawToken),
      passwordVersion,
      now,
      expiresAt,
      userAgent,
      remoteAddress,
      assuranceLevel,
      assuranceLevel === 'mfa' ? now : null,
    ],
  )
  return { id, rawToken, expiresAt }
}

export async function serializeAuthAccount(
  client: Queryable,
  accountId: string,
): Promise<void> {
  await client.query(
    'select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))',
    [accountId],
  )
}

async function serializeCurrentActiveAccount(
  client: Queryable,
  accountId: string,
  passwordVersion: number,
): Promise<{ firstLogin: boolean; hasMfaFactor: boolean }> {
  // Serialize credential issuance per account without taking row locks in the
  // opposite order from first-login/MFA verification. User deactivation takes
  // this same lock before changing the profile or revoking credentials.
  await serializeAuthAccount(client, accountId)
  // Password verification happened before this transaction and may have raced
  // an administrator action, so re-check both generation and active status.
  const accountGuard = await client.query<{
    id: string
    first_login: boolean
    has_mfa_factor: boolean
  }>(
    `select account.id,
            profile.first_login,
            exists (
              select 1
                from app_auth.mfa_factors factor
               where factor.account_id = account.id
                 and factor.enabled_at is not null
            ) as has_mfa_factor
       from app_auth.accounts account
       join public.users profile on profile.auth_user_id = account.id
      where account.id = $1
        and account.password_version = $2
        and profile.status = 'active'`,
    [accountId, passwordVersion],
  )
  if (!accountGuard.rows[0]) {
    throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
  }
  return {
    firstLogin: accountGuard.rows[0].first_login,
    hasMfaFactor: accountGuard.rows[0].has_mfa_factor,
  }
}

export async function createMfaChallenge(
  client: Queryable,
  accountId: string,
  passwordVersion: number,
  now: Date,
  ttlSeconds: number,
  maxAttempts: number,
  request: FastifyRequest,
): Promise<{ id: string; rawToken: string; expiresAt: Date; stage: MfaStage }> {
  const id = randomUUID()
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const userAgent = request.headers['user-agent']?.slice(0, 512) ?? null
  const remoteAddress = request.ip || null
  const account = await serializeCurrentActiveAccount(client, accountId, passwordVersion)
  const stage: MfaStage = account.firstLogin
    ? 'first_login'
    : account.hasMfaFactor
      ? 'mfa_verify'
      : 'mfa_enroll'
  await client.query(
    `update app_auth.mfa_challenges
        set consumed_at = coalesce(consumed_at, $2)
      where account_id = $1 and consumed_at is null`,
    [accountId, now],
  )
  await client.query(
    `insert into app_auth.mfa_challenges
      (id, account_id, token_hash, password_version, stage, attempts_remaining,
       created_at, expires_at, user_agent, remote_address)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      accountId,
      hashToken(rawToken),
      passwordVersion,
      stage,
      maxAttempts,
      now,
      expiresAt,
      userAgent,
      remoteAddress,
    ],
  )
  return { id, rawToken, expiresAt, stage }
}

function challengeUser(challenge: MfaChallenge): Record<string, unknown> {
  return {
    id: challenge.accountId,
    last_sign_in_at: challenge.createdAt.toISOString(),
  }
}

export function challengeEnvelope(
  challenge: MfaChallenge,
  includeToken = false,
): Record<string, unknown> {
  return {
    user: safeProfile(challenge),
    stage: challenge.stage,
    challenge: {
      ...(includeToken && challenge.rawToken ? { access_token: challenge.rawToken } : {}),
      expires_at: challenge.expiresAt.toISOString(),
      user: challengeUser(challenge),
    },
  }
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
            s.assurance_level,
            s.mfa_verified_at,
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
    assuranceLevel: row.assurance_level,
    mfaVerifiedAt: row.mfa_verified_at ? new Date(row.mfa_verified_at) : null,
  }
}

export async function authenticateMfaChallenge(
  request: FastifyRequest,
  dependencies: Dependencies,
  allowedStages?: ReadonlySet<MfaStage>,
): Promise<MfaChallenge> {
  const token = bearerToken(request)
  if (!token) throw new ApiError(401, 'challenge_invalid', 'The sign-in challenge is no longer valid.')

  const result = await dependencies.db.query<ChallengeLookupRow>(
    `select c.id as challenge_id,
            c.account_id,
            c.password_version as challenge_password_version,
            c.stage,
            c.attempts_remaining,
            c.created_at as challenge_created_at,
            c.expires_at,
            a.password_version as current_password_version,
            ${SAFE_PROFILE_SQL}
       from app_auth.mfa_challenges c
       join app_auth.accounts a on a.id = c.account_id
       join public.users p on p.auth_user_id = a.id
      where c.token_hash = $1
        and c.consumed_at is null
        and c.expires_at > $2
        and c.attempts_remaining > 0
      limit 1`,
    [hashToken(token), dependencies.now()],
  )
  const row = result.rows[0]
  if (
    !row
    || row.challenge_password_version !== row.current_password_version
    || (allowedStages && !allowedStages.has(row.stage))
  ) {
    throw new ApiError(401, 'challenge_invalid', 'The sign-in challenge is no longer valid.')
  }
  if (row.status !== 'active') {
    throw new ApiError(403, 'account_inactive', 'This account is inactive. Contact an administrator.')
  }
  return {
    ...safeProfile(row),
    challengeId: row.challenge_id,
    accountId: row.account_id,
    passwordVersion: row.current_password_version,
    stage: row.stage,
    attemptsRemaining: row.attempts_remaining,
    createdAt: new Date(row.challenge_created_at),
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
  if (
    dependencies.env.mfaEnforcementEnabled
    && (
      request.auth.assuranceLevel !== 'mfa'
      || request.auth.mfaVerifiedAt === null
    )
  ) {
    throw new ApiError(
      403,
      'mfa_required',
      'Complete two-factor authentication before using the workspace.',
    )
  }
}

export async function initializeMfaEnforcement(dependencies: Dependencies): Promise<void> {
  if (!dependencies.env.mfaEnforcementEnabled) return
  const now = dependencies.now()
  await transaction(dependencies.db, async (client) => {
    // Sessions issued before this rollout were authenticated by password only.
    // Revoking exactly that assurance class preserves already verified MFA
    // sessions across an ordinary API restart.
    await client.query(
      `update app_auth.sessions
          set revoked_at = coalesce(revoked_at, $1)
        where assurance_level = 'legacy'
          and revoked_at is null`,
      [now],
    )
    await client.query(
      `update app_auth.mfa_challenges
          set consumed_at = coalesce(consumed_at, $1)
        where consumed_at is null
          and expires_at <= $1`,
      [now],
    )
  })
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
      assertAllowedKeys(body, ['email', 'password', 'mfaSupported'])
      const email = requiredString(body.email, 'email', 254).toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      if (body.mfaSupported !== undefined && typeof body.mfaSupported !== 'boolean') {
        throw new ApiError(400, 'invalid_request', 'mfaSupported must be a boolean.')
      }
      if (!password || password.length > 1024) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
      }

      const accountResult = await dependencies.db.query<LoginLookupRow>(
        `select a.id as account_id,
                a.encrypted_password,
                a.password_version,
                ${SAFE_PROFILE_SQL}
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
      const useMfaFlow = dependencies.env.mfaEnforcementEnabled || body.mfaSupported === true
      if (useMfaFlow) {
        if (!dependencies.env.mfaEncryptionKey) {
          throw new ApiError(
            503,
            'mfa_unavailable',
            'Two-factor authentication is temporarily unavailable.',
          )
        }
        const created = await transaction(dependencies.db, async (client) => (
          createMfaChallenge(
            client,
            account.account_id,
            account.password_version,
            now,
            dependencies.env.mfaChallengeTtlSeconds,
            dependencies.env.mfaMaxAttempts,
            request,
          )
        ))
        const challenge: MfaChallenge = {
          ...safeProfile(account),
          challengeId: created.id,
          accountId: account.account_id,
          passwordVersion: account.password_version,
          stage: created.stage,
          attemptsRemaining: dependencies.env.mfaMaxAttempts,
          createdAt: now,
          expiresAt: created.expiresAt,
          rawToken: created.rawToken,
        }
        return { data: challengeEnvelope(challenge, true), error: null }
      }

      const created = await transaction(dependencies.db, async (client) => {
        await serializeCurrentActiveAccount(
          client,
          account.account_id,
          account.password_version,
        )
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
          'legacy',
        )
      })

      const session: AuthenticatedSession = {
        sessionId: created.id,
        accountId: account.account_id,
        profile: safeProfile(account),
        createdAt: now,
        expiresAt: created.expiresAt,
        assuranceLevel: 'legacy',
        mfaVerifiedAt: null,
        rawToken: created.rawToken,
      }
      return { data: sessionEnvelope(session, true), error: null }
    },
  )

  app.get(
    '/api/v1/auth/session',
    async (request) => {
      try {
        const session = await authenticateRequest(request, dependencies)
        if (dependencies.env.mfaEnforcementEnabled && session.assuranceLevel !== 'mfa') {
          await dependencies.db.query(
            'update app_auth.sessions set revoked_at = coalesce(revoked_at, $2) where id = $1',
            [session.sessionId, dependencies.now()],
          )
          throw new ApiError(401, 'mfa_required', 'Sign in again to complete two-factor authentication.')
        }
        return { data: sessionEnvelope(session), error: null }
      } catch (error) {
        if (!(error instanceof ApiError) || !['session_invalid', 'unauthorized'].includes(error.code)) {
          throw error
        }
      }
      const challenge = await authenticateMfaChallenge(request, dependencies)
      return { data: challengeEnvelope(challenge), error: null }
    },
  )

  app.post(
    '/api/v1/auth/logout',
    async (request) => {
      const token = bearerToken(request)
      if (token) {
        const tokenHash = hashToken(token)
        const now = dependencies.now()
        await transaction(dependencies.db, async (client) => {
          await client.query(
            `update app_auth.sessions
                set revoked_at = coalesce(revoked_at, $2)
              where token_hash = $1`,
            [tokenHash, now],
          )
          await client.query(
            `update app_auth.mfa_challenges
                set consumed_at = coalesce(consumed_at, $2)
              where token_hash = $1`,
            [tokenHash, now],
          )
        })
      }
      return { data: null, error: null }
    },
  )

  app.post(
    '/api/v1/auth/first-login',
    {
      config: {
        rateLimit: {
          max: dependencies.env.mfaMaxAttempts,
          timeWindow: dependencies.env.mfaChallengeTtlSeconds * 1000,
          keyGenerator: (request: FastifyRequest) => {
            const token = bearerToken(request)
            return `${request.ip}:${token ? hashToken(token) : 'missing'}`
          },
        },
      },
    },
    async (request) => {
      let pending: MfaChallenge | null = null
      let current: AuthenticatedSession | null = null
      try {
        pending = await authenticateMfaChallenge(
          request,
          dependencies,
          new Set<MfaStage>(['first_login']),
        )
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'challenge_invalid') throw error
        current = await authenticateRequest(request, dependencies)
        if (dependencies.env.mfaEnforcementEnabled || current.assuranceLevel !== 'legacy') {
          throw new ApiError(401, 'challenge_invalid', 'The sign-in challenge is no longer valid.')
        }
      }

      // Authenticate the provisional challenge (or the temporary legacy
      // rollout session) before parsing and cost-12 hashing attacker input.
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['password'])
      const password = parsePassword(body.password)
      const passwordHash = await bcrypt.hash(password, 12)
      const now = dependencies.now()

      if (pending) {
        if (!dependencies.env.mfaEncryptionKey) {
          throw new ApiError(
            503,
            'mfa_unavailable',
            'Two-factor authentication is temporarily unavailable.',
          )
        }
        const updated = await asServiceUser(
          dependencies.db,
          pending.accountId,
          async (client: PoolClient) => {
            await serializeAuthAccount(client, pending.accountId)
            const locked = await client.query<{
              first_login: boolean
              password_version: number
              has_mfa_factor: boolean
            }>(
              `select p.first_login,
                      a.password_version,
                      exists (
                        select 1
                          from app_auth.mfa_factors factor
                         where factor.account_id = a.id
                           and factor.enabled_at is not null
                      ) as has_mfa_factor
                 from app_auth.mfa_challenges challenge
                 join app_auth.accounts a on a.id = challenge.account_id
                 join public.users p on p.auth_user_id = a.id
                where challenge.id = $1
                  and challenge.stage = 'first_login'
                  and challenge.consumed_at is null
                  and challenge.expires_at > $2
                  and challenge.password_version = a.password_version
                for update of challenge, a, p`,
              [pending.challengeId, now],
            )
            const account = locked.rows[0]
            if (!account || !account.first_login) {
              throw new ApiError(401, 'challenge_invalid', 'The sign-in challenge is no longer valid.')
            }

            const passwordVersion = account.password_version + 1
            const stage: MfaStage = account.has_mfa_factor ? 'mfa_verify' : 'mfa_enroll'
            const expiresAt = new Date(now.getTime() + dependencies.env.mfaChallengeTtlSeconds * 1000)
            await client.query(
              `update app_auth.accounts
                  set encrypted_password = $2, password_version = $3, updated_at = $4
                where id = $1`,
              [pending.accountId, passwordHash, passwordVersion, now],
            )
            const profileResult = await client.query<SafeProfileRow>(
              `update public.users
                  set first_login = false
                where auth_user_id = $1 and first_login = true
              returning ${SAFE_PROFILE_COLUMNS.join(', ')}`,
              [pending.accountId],
            )
            const profile = profileResult.rows[0]
            if (!profile) {
              throw new ApiError(500, 'setup_incomplete', 'Account setup could not be verified.')
            }
            await client.query(
              `update app_auth.sessions
                  set revoked_at = coalesce(revoked_at, $2)
                where account_id = $1 and revoked_at is null`,
              [pending.accountId, now],
            )
            await client.query(
              `update app_auth.mfa_challenges
                  set consumed_at = coalesce(consumed_at, $3)
                where account_id = $1 and id <> $2 and consumed_at is null`,
              [pending.accountId, pending.challengeId, now],
            )
            await client.query(
              `update app_auth.mfa_challenges
                  set password_version = $2,
                      stage = $3,
                      attempts_remaining = $4,
                      expires_at = $5,
                      pending_secret = null,
                      pending_secret_iv = null,
                      pending_secret_auth_tag = null,
                      pending_secret_key_version = null,
                      pending_factor_id = null,
                      pending_recovery_codes = null,
                      pending_recovery_iv = null,
                      pending_recovery_auth_tag = null,
                      pending_recovery_key_version = null
                where id = $1`,
              [
                pending.challengeId,
                passwordVersion,
                stage,
                dependencies.env.mfaMaxAttempts,
                expiresAt,
              ],
            )
            return { profile, passwordVersion, stage, expiresAt }
          },
        )
        return {
          data: {
            ...challengeEnvelope({
              ...updated.profile,
              challengeId: pending.challengeId,
              accountId: pending.accountId,
              passwordVersion: updated.passwordVersion,
              stage: updated.stage,
              attemptsRemaining: dependencies.env.mfaMaxAttempts,
              createdAt: pending.createdAt,
              expiresAt: updated.expiresAt,
            }),
            alreadyComplete: false,
          },
          error: null,
        }
      }

      // Transitional compatibility for the old frontend while enforcement is
      // off. The mandatory end-state never reaches this branch because login
      // then issues only a short-lived MFA challenge.
      const legacySession = current as AuthenticatedSession
      const result = await asServiceUser(dependencies.db, legacySession.accountId, async (client: PoolClient) => {
        await serializeAuthAccount(client, legacySession.accountId)
        const locked = await client.query<{
          first_login: boolean
          password_version: number
        }>(
           `select p.first_login, a.password_version
              from app_auth.accounts a
              join public.users p on p.auth_user_id = a.id
             where a.id = $1
               and p.status = 'active'
             for update of a, p`,
          [legacySession.accountId],
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
          [legacySession.accountId, passwordHash, passwordVersion, now],
        )
        await client.query(
          'update public.users set first_login = false where auth_user_id = $1 and first_login = true',
          [legacySession.accountId],
        )
        await client.query(
          'update app_auth.sessions set revoked_at = $2 where account_id = $1 and revoked_at is null',
          [legacySession.accountId, now],
        )
        const created = await createSession(
          client,
          legacySession.accountId,
          passwordVersion,
          now,
          dependencies.env.sessionTtlSeconds,
          request,
          'legacy',
        )
        return { alreadyComplete: false, created, passwordVersion }
      })

      if (result.alreadyComplete || !result.created) {
        return {
          data: {
            user: legacySession.profile,
            alreadyComplete: true,
            session: sessionEnvelope(legacySession).session,
          },
          error: null,
        }
      }

      const profileResult = await dependencies.db.query<SafeProfileRow>(
        `select ${SAFE_PROFILE_COLUMNS.join(', ')} from public.users where auth_user_id = $1`,
        [legacySession.accountId],
      )
      const profile = profileResult.rows[0]
      if (!profile) throw new ApiError(500, 'setup_incomplete', 'Account setup could not be verified.')
      const session: AuthenticatedSession = {
        sessionId: result.created.id,
        accountId: legacySession.accountId,
        profile,
        createdAt: now,
        expiresAt: result.created.expiresAt,
        assuranceLevel: 'legacy',
        mfaVerifiedAt: null,
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
