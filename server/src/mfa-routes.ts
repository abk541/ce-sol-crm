import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import {
  authenticateMfaChallenge,
  bearerToken,
  challengeEnvelope,
  createSession,
  hashToken,
  serializeAuthAccount,
  sessionEnvelope,
  type MfaChallenge,
} from './auth.js'
import { asServiceUser } from './db.js'
import { ApiError, asRecord, assertAllowedKeys } from './errors.js'
import {
  decryptMfaValue,
  encryptMfaValue,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  normalizeTotpCode,
  provisioningUri,
  verifyTotpCode,
  type MfaStage,
  type StoredEncryptedValue,
} from './mfa.js'
import type { AuthenticatedSession, Dependencies, SafeProfileRow } from './types.js'

interface LockedChallengeRow {
  id: string
  account_id: string
  password_version: number
  stage: MfaStage
  attempts_remaining: number
  expires_at: Date
  pending_secret: Buffer | null
  pending_secret_iv: Buffer | null
  pending_secret_auth_tag: Buffer | null
  pending_secret_key_version: number | null
  pending_factor_id: string | null
  pending_recovery_codes: Buffer | null
  pending_recovery_iv: Buffer | null
  pending_recovery_auth_tag: Buffer | null
  pending_recovery_key_version: number | null
}

interface FactorRow {
  id: string
  encrypted_secret: Buffer
  secret_iv: Buffer
  secret_auth_tag: Buffer
  key_version: number
  last_used_timestep: string | number | null
}

function configuredKey(dependencies: Dependencies): Buffer {
  if (!dependencies.env.mfaEncryptionKey) {
    throw new ApiError(
      503,
      'mfa_unavailable',
      'Two-factor authentication is temporarily unavailable.',
    )
  }
  return dependencies.env.mfaEncryptionKey
}

function routeRateLimit(dependencies: Dependencies) {
  return {
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
  }
}

async function lockChallenge(
  client: PoolClient,
  challenge: MfaChallenge,
  expectedStage: MfaStage,
  now: Date,
): Promise<LockedChallengeRow> {
  await serializeAuthAccount(client, challenge.accountId)
  const result = await client.query<LockedChallengeRow>(
    `select challenge.id,
            challenge.account_id,
            challenge.password_version,
            challenge.stage,
            challenge.attempts_remaining,
            challenge.expires_at,
            challenge.pending_secret,
            challenge.pending_secret_iv,
            challenge.pending_secret_auth_tag,
            challenge.pending_secret_key_version,
            challenge.pending_factor_id,
            challenge.pending_recovery_codes,
            challenge.pending_recovery_iv,
            challenge.pending_recovery_auth_tag,
            challenge.pending_recovery_key_version
       from app_auth.mfa_challenges challenge
       join app_auth.accounts account on account.id = challenge.account_id
      where challenge.id = $1
        and challenge.account_id = $2
        and challenge.stage = $3
        and challenge.password_version = account.password_version
        and challenge.consumed_at is null
        and challenge.expires_at > $4
        and challenge.attempts_remaining > 0
      for update of challenge`,
    [challenge.challengeId, challenge.accountId, expectedStage, now],
  )
  const locked = result.rows[0]
  if (!locked) throw new ApiError(401, 'challenge_invalid', 'The sign-in challenge is no longer valid.')
  return locked
}

function encryptedValue(
  ciphertext: Buffer | null,
  iv: Buffer | null,
  authTag: Buffer | null,
  keyVersion: number | null,
): StoredEncryptedValue {
  if (!ciphertext || !iv || !authTag || !keyVersion) {
    throw new ApiError(409, 'enrollment_incomplete', 'Authenticator enrollment must be started first.')
  }
  return { ciphertext, iv, authTag, keyVersion }
}

async function loadPendingRecoveryCodes(
  client: PoolClient,
  challenge: MfaChallenge,
  key: Buffer,
  now: Date,
): Promise<{ recoveryCodes: string[]; expiresAt: Date }> {
  const locked = await lockChallenge(client, challenge, 'mfa_recovery', now)
  const decoded = decryptMfaValue(
    key,
    encryptedValue(
      locked.pending_recovery_codes,
      locked.pending_recovery_iv,
      locked.pending_recovery_auth_tag,
      locked.pending_recovery_key_version,
    ),
    `challenge:${locked.id}:recovery`,
  )
  const recoveryCodes = JSON.parse(decoded) as unknown
  if (
    !Array.isArray(recoveryCodes)
    || recoveryCodes.length !== 10
    || !recoveryCodes.every(code => (
      typeof code === 'string'
      && normalizeRecoveryCode(code) !== null
    ))
    || new Set(recoveryCodes).size !== recoveryCodes.length
  ) {
    throw new Error('Invalid encrypted MFA recovery payload.')
  }
  return { recoveryCodes, expiresAt: locked.expires_at }
}

async function failAttempt(
  client: PoolClient,
  challengeId: string,
  attemptsRemaining: number,
  now: Date,
): Promise<void> {
  await client.query(
    `update app_auth.mfa_challenges
        set attempts_remaining = greatest(attempts_remaining - 1, 0),
            consumed_at = case
              when attempts_remaining <= 1 then coalesce(consumed_at, $2)
              else consumed_at
            end
      where id = $1 and consumed_at is null`,
    [challengeId, now],
  )
  if (attemptsRemaining <= 1) {
    await client.query(
      `delete from app_auth.mfa_factors factor
        using app_auth.mfa_challenges challenge
        where challenge.id = $1
          and challenge.pending_factor_id = factor.id
          and factor.enabled_at is null`,
      [challengeId],
    )
  }
}

function invalidCode(): ApiError {
  return new ApiError(401, 'invalid_mfa_code', 'The authentication code is invalid or expired.')
}

function profileWithMfa(challenge: MfaChallenge, enabled: boolean): SafeProfileRow {
  return {
    id: challenge.id,
    auth_user_id: challenge.auth_user_id,
    name: challenge.name,
    email: challenge.email,
    username: challenge.username,
    role: challenge.role,
    avatar: challenge.avatar,
    status: challenge.status,
    first_login: false,
    mfa_enabled: enabled,
    created_at: challenge.created_at,
    team: challenge.team,
    manager_id: challenge.manager_id,
  }
}

async function revokeLegacySessions(
  client: PoolClient,
  accountId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `update app_auth.sessions
        set revoked_at = coalesce(revoked_at, $2)
      where account_id = $1
        and assurance_level = 'legacy'
        and revoked_at is null`,
    [accountId, now],
  )
}

async function completeVerifiedSession(
  client: PoolClient,
  request: FastifyRequest,
  dependencies: Dependencies,
  challenge: MfaChallenge,
  now: Date,
): Promise<AuthenticatedSession> {
  await client.query(
    `update app_auth.mfa_challenges
        set consumed_at = coalesce(consumed_at, $2),
            pending_secret = null,
            pending_secret_iv = null,
            pending_secret_auth_tag = null,
            pending_secret_key_version = null,
            pending_recovery_codes = null,
            pending_recovery_iv = null,
            pending_recovery_auth_tag = null,
            pending_recovery_key_version = null
      where id = $1`,
    [challenge.challengeId, now],
  )
  // A successful MFA sign-in supersedes any password-only sessions left from
  // before enforcement. Other MFA-verified devices remain signed in.
  await revokeLegacySessions(client, challenge.accountId, now)
  await client.query(
    'update app_auth.accounts set last_sign_in_at = $2, updated_at = $2 where id = $1',
    [challenge.accountId, now],
  )
  const created = await createSession(
    client,
    challenge.accountId,
    challenge.passwordVersion,
    now,
    dependencies.env.sessionTtlSeconds,
    request,
    'mfa',
  )
  return {
    sessionId: created.id,
    accountId: challenge.accountId,
    profile: profileWithMfa(challenge, true),
    createdAt: now,
    expiresAt: created.expiresAt,
    assuranceLevel: 'mfa',
    mfaVerifiedAt: now,
    rawToken: created.rawToken,
  }
}

export function registerMfaRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/auth/mfa/enroll/start',
    async (request) => {
      const key = configuredKey(dependencies)
      const challenge = await authenticateMfaChallenge(
        request,
        dependencies,
        new Set<MfaStage>(['mfa_enroll']),
      )
      const enrollment = await asServiceUser(
        dependencies.db,
        challenge.accountId,
        async (client: PoolClient) => {
          const locked = await lockChallenge(client, challenge, 'mfa_enroll', dependencies.now())
          let secret: string
          if (locked.pending_secret) {
            secret = decryptMfaValue(
              key,
              encryptedValue(
                locked.pending_secret,
                locked.pending_secret_iv,
                locked.pending_secret_auth_tag,
                locked.pending_secret_key_version,
              ),
              `challenge:${locked.id}:totp`,
            )
          } else {
            await client.query(
              `delete from app_auth.mfa_factors
                where account_id = $1 and enabled_at is null`,
              [challenge.accountId],
            )
            secret = generateTotpSecret()
            const encrypted = encryptMfaValue(key, secret, `challenge:${locked.id}:totp`)
            await client.query(
              `update app_auth.mfa_challenges
                  set pending_secret = $2,
                      pending_secret_iv = $3,
                      pending_secret_auth_tag = $4,
                      pending_secret_key_version = $5
                where id = $1`,
              [
                locked.id,
                encrypted.ciphertext,
                encrypted.iv,
                encrypted.authTag,
                encrypted.keyVersion,
              ],
            )
          }
          return {
            manualKey: secret,
            otpauthUrl: provisioningUri(challenge.email, secret),
          }
        },
      )
      return { data: enrollment, error: null }
    },
  )

  app.post(
    '/api/v1/auth/mfa/enroll/confirm',
    routeRateLimit(dependencies),
    async (request) => {
      const key = configuredKey(dependencies)
      const challenge = await authenticateMfaChallenge(
        request,
        dependencies,
        // Confirmation is idempotent once the TOTP was accepted. If the first
        // response was lost, the same short-lived challenge can safely reload
        // its already-created recovery bundle instead of becoming stranded.
        new Set<MfaStage>(['mfa_enroll', 'mfa_recovery']),
      )
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['code'])
      if (challenge.stage === 'mfa_recovery') {
        const recovered = await asServiceUser(
          dependencies.db,
          challenge.accountId,
          async (client: PoolClient) => loadPendingRecoveryCodes(
            client,
            challenge,
            key,
            dependencies.now(),
          ),
        )
        return {
          data: {
            user: profileWithMfa(challenge, false),
            stage: 'mfa_recovery',
            challenge: {
              expires_at: recovered.expiresAt.toISOString(),
              user: {
                id: challenge.accountId,
                last_sign_in_at: challenge.createdAt.toISOString(),
              },
            },
            recoveryCodes: recovered.recoveryCodes,
          },
          error: null,
        }
      }
      const code = normalizeTotpCode(body.code)
      const now = dependencies.now()
      const result = await asServiceUser(
        dependencies.db,
        challenge.accountId,
        async (client: PoolClient) => {
          const locked = await lockChallenge(client, challenge, 'mfa_enroll', now)
          const secret = decryptMfaValue(
            key,
            encryptedValue(
              locked.pending_secret,
              locked.pending_secret_iv,
              locked.pending_secret_auth_tag,
              locked.pending_secret_key_version,
            ),
            `challenge:${locked.id}:totp`,
          )
          const timestep = code ? verifyTotpCode(secret, code, now, null) : null
          if (timestep === null) {
            await failAttempt(client, locked.id, locked.attempts_remaining, now)
            return { ok: false as const }
          }

          await client.query(
            `delete from app_auth.mfa_factors
              where account_id = $1 and enabled_at is null`,
            [challenge.accountId],
          )
          const factorId = randomUUID()
          const factorSecret = encryptMfaValue(key, secret, `factor:${factorId}:totp`)
          await client.query(
            `insert into app_auth.mfa_factors
              (id, account_id, encrypted_secret, secret_iv, secret_auth_tag,
               key_version, last_used_timestep, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
            [
              factorId,
              challenge.accountId,
              factorSecret.ciphertext,
              factorSecret.iv,
              factorSecret.authTag,
              factorSecret.keyVersion,
              timestep,
              now,
            ],
          )
          const recoveryCodes = generateRecoveryCodes()
          for (const recoveryCode of recoveryCodes) {
            const normalized = normalizeRecoveryCode(recoveryCode)
            if (!normalized) throw new Error('Generated an invalid recovery code.')
            await client.query(
              `insert into app_auth.mfa_recovery_codes
                (id, factor_id, code_hash, created_at)
               values ($1,$2,$3,$4)`,
              [randomUUID(), factorId, hashRecoveryCode(key, normalized), now],
            )
          }
          const encryptedCodes = encryptMfaValue(
            key,
            JSON.stringify(recoveryCodes),
            `challenge:${locked.id}:recovery`,
          )
          const expiresAt = new Date(now.getTime() + dependencies.env.mfaChallengeTtlSeconds * 1000)
          await client.query(
            `update app_auth.mfa_challenges
                set stage = 'mfa_recovery',
                    attempts_remaining = $2,
                    expires_at = $3,
                    pending_secret = null,
                    pending_secret_iv = null,
                    pending_secret_auth_tag = null,
                    pending_secret_key_version = null,
                    pending_factor_id = $4,
                    pending_recovery_codes = $5,
                    pending_recovery_iv = $6,
                    pending_recovery_auth_tag = $7,
                    pending_recovery_key_version = $8
              where id = $1`,
            [
              locked.id,
              dependencies.env.mfaMaxAttempts,
              expiresAt,
              factorId,
              encryptedCodes.ciphertext,
              encryptedCodes.iv,
              encryptedCodes.authTag,
              encryptedCodes.keyVersion,
            ],
          )
          return { ok: true as const, recoveryCodes, expiresAt }
        },
      )
      if (!result.ok) throw invalidCode()
      return {
        data: {
          user: profileWithMfa(challenge, false),
          stage: 'mfa_recovery',
          challenge: {
            expires_at: result.expiresAt.toISOString(),
            user: {
              id: challenge.accountId,
              last_sign_in_at: challenge.createdAt.toISOString(),
            },
          },
          recoveryCodes: result.recoveryCodes,
        },
        error: null,
      }
    },
  )

  app.post(
    '/api/v1/auth/mfa/recovery',
    async (request) => {
      const key = configuredKey(dependencies)
      const challenge = await authenticateMfaChallenge(
        request,
        dependencies,
        new Set<MfaStage>(['mfa_recovery']),
      )
      const recoveryCodes = await asServiceUser(
        dependencies.db,
        challenge.accountId,
        async (client: PoolClient) => (
          await loadPendingRecoveryCodes(
            client,
            challenge,
            key,
            dependencies.now(),
          )
        ).recoveryCodes,
      )
      return { data: { recoveryCodes }, error: null }
    },
  )

  app.post(
    '/api/v1/auth/mfa/enroll/complete',
    async (request) => {
      configuredKey(dependencies)
      const challenge = await authenticateMfaChallenge(
        request,
        dependencies,
        new Set<MfaStage>(['mfa_recovery']),
      )
      const now = dependencies.now()
      const session = await asServiceUser(
        dependencies.db,
        challenge.accountId,
        async (client: PoolClient) => {
          const locked = await lockChallenge(client, challenge, 'mfa_recovery', now)
          if (!locked.pending_factor_id || !locked.pending_recovery_codes) {
            throw new ApiError(409, 'enrollment_incomplete', 'Authenticator enrollment is not complete.')
          }
          const enabled = await client.query(
            `update app_auth.mfa_factors
                set enabled_at = $2, updated_at = $2
              where id = $1 and account_id = $3 and enabled_at is null
              returning id`,
            [locked.pending_factor_id, now, challenge.accountId],
          )
          if (enabled.rowCount !== 1) {
            throw new ApiError(409, 'enrollment_incomplete', 'Authenticator enrollment is not complete.')
          }
          await client.query(
            'update public.users set mfa_enabled = true where auth_user_id = $1',
            [challenge.accountId],
          )
          await client.query(
            `insert into app_auth.mfa_audit_events
              (id, actor_account_id, target_account_id, action, created_at, remote_address, user_agent)
             values ($1,$2,$2,'enrollment_completed',$3,$4,$5)`,
            [
              randomUUID(),
              challenge.accountId,
              now,
              request.ip || null,
              request.headers['user-agent']?.slice(0, 512) ?? null,
            ],
          )
          return completeVerifiedSession(client, request, dependencies, challenge, now)
        },
      )
      return { data: sessionEnvelope(session, true), error: null }
    },
  )

  app.post(
    '/api/v1/auth/mfa/verify',
    routeRateLimit(dependencies),
    async (request) => {
      const key = configuredKey(dependencies)
      const challenge = await authenticateMfaChallenge(
        request,
        dependencies,
        new Set<MfaStage>(['mfa_verify']),
      )
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['code', 'recoveryCode'])
      const hasCode = body.code !== undefined
      const hasRecovery = body.recoveryCode !== undefined
      if (hasCode === hasRecovery) {
        throw new ApiError(400, 'invalid_request', 'Provide one authentication or recovery code.')
      }
      const code = hasCode ? normalizeTotpCode(body.code) : null
      const recoveryCode = hasRecovery ? normalizeRecoveryCode(body.recoveryCode) : null
      const now = dependencies.now()
      const result = await asServiceUser(
        dependencies.db,
        challenge.accountId,
        async (client: PoolClient) => {
          const locked = await lockChallenge(client, challenge, 'mfa_verify', now)
          const factorResult = await client.query<FactorRow>(
            `select factor.id,
                    factor.encrypted_secret,
                    factor.secret_iv,
                    factor.secret_auth_tag,
                    factor.key_version,
                    factor.last_used_timestep
               from app_auth.mfa_factors factor
              where factor.account_id = $1
                and factor.enabled_at is not null
              for update`,
            [challenge.accountId],
          )
          const factor = factorResult.rows[0]
          if (!factor) {
            throw new ApiError(409, 'mfa_enrollment_required', 'Authenticator enrollment is required.')
          }

          let recoveryUsed = false
          if (code) {
            const secret = decryptMfaValue(
              key,
              {
                ciphertext: factor.encrypted_secret,
                iv: factor.secret_iv,
                authTag: factor.secret_auth_tag,
                keyVersion: factor.key_version,
              },
              `factor:${factor.id}:totp`,
            )
            const storedTimestep = factor.last_used_timestep === null
              ? null
              : Number(factor.last_used_timestep)
            const timestep = verifyTotpCode(secret, code, now, storedTimestep)
            if (timestep !== null) {
              await client.query(
                `update app_auth.mfa_factors
                    set last_used_timestep = $2, updated_at = $3
                  where id = $1`,
                [factor.id, timestep, now],
              )
            } else {
              await failAttempt(client, locked.id, locked.attempts_remaining, now)
              return { ok: false as const }
            }
          } else if (recoveryCode) {
            const consumed = await client.query(
              `update app_auth.mfa_recovery_codes
                  set used_at = $3
                where factor_id = $1
                  and code_hash = $2
                  and used_at is null
              returning id`,
              [factor.id, hashRecoveryCode(key, recoveryCode), now],
            )
            if (consumed.rowCount !== 1) {
              await failAttempt(client, locked.id, locked.attempts_remaining, now)
              return { ok: false as const }
            }
            recoveryUsed = true
          } else {
            await failAttempt(client, locked.id, locked.attempts_remaining, now)
            return { ok: false as const }
          }

          if (recoveryUsed) {
            await client.query(
              `insert into app_auth.mfa_audit_events
                (id, actor_account_id, target_account_id, action, created_at, remote_address, user_agent)
               values ($1,$2,$2,'recovery_code_used',$3,$4,$5)`,
              [
                randomUUID(),
                challenge.accountId,
                now,
                request.ip || null,
                request.headers['user-agent']?.slice(0, 512) ?? null,
              ],
            )
          }
          return {
            ok: true as const,
            session: await completeVerifiedSession(
              client,
              request,
              dependencies,
              challenge,
              now,
            ),
          }
        },
      )
      if (!result.ok) throw invalidCode()
      return { data: sessionEnvelope(result.session, true), error: null }
    },
  )

  app.post(
    '/api/v1/auth/mfa/cancel',
    async (request) => {
      const challenge = await authenticateMfaChallenge(request, dependencies)
      const now = dependencies.now()
      await asServiceUser(dependencies.db, challenge.accountId, async (client: PoolClient) => {
        const locked = await lockChallenge(client, challenge, challenge.stage, now)
        if (locked.pending_factor_id) {
          await client.query(
            `delete from app_auth.mfa_factors
              where id = $1 and account_id = $2 and enabled_at is null`,
            [locked.pending_factor_id, challenge.accountId],
          )
        }
        await client.query(
          `update app_auth.mfa_challenges
              set consumed_at = coalesce(consumed_at, $2),
                  pending_secret = null,
                  pending_secret_iv = null,
                  pending_secret_auth_tag = null,
                  pending_secret_key_version = null,
                  pending_recovery_codes = null,
                  pending_recovery_iv = null,
                  pending_recovery_auth_tag = null,
                  pending_recovery_key_version = null
            where id = $1`,
          [locked.id, now],
        )
      })
      return { data: null, error: null }
    },
  )
}

export const __test = {
  invalidCode,
  loadPendingRecoveryCodes,
  lockChallenge,
  revokeLegacySessions,
}
