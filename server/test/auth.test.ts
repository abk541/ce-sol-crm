import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import type { FastifyRequest } from 'fastify'
import type { Database, Queryable } from '../src/db.js'
import { buildApp } from '../src/app.js'
import {
  createMfaChallenge,
  hashToken,
  initializeMfaEnforcement,
  passwordMeetsPolicy,
} from '../src/auth.js'
import { loadEnvironment } from '../src/env.js'

describe('password migration compatibility', () => {
  it('verifies imported GoTrue $2a$ bcrypt hashes', async () => {
    const hash = await bcrypt.hash('Valid1!Password', 4)
    const gotrueStyle = `$2a$${hash.slice(4)}`
    await expect(bcrypt.compare('Valid1!Password', gotrueStyle)).resolves.toBe(true)
    await expect(bcrypt.compare('wrong', gotrueStyle)).resolves.toBe(false)
  })

  it('keeps the application password policy and bcrypt byte boundary', () => {
    expect(passwordMeetsPolicy('Valid1!Password')).toBe(true)
    expect(passwordMeetsPolicy('no-uppercase1!')).toBe(false)
    expect(passwordMeetsPolicy('A1!')).toBe(false)
    expect(passwordMeetsPolicy(`A1!${'é'.repeat(40)}`)).toBe(false)
  })
})

describe('opaque token hashing', () => {
  it('uses a deterministic SHA-256 digest without preserving the token', () => {
    const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_1234'
    const digest = hashToken(token)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toContain(token)
    expect(hashToken(token)).toBe(digest)
  })
})

describe('MFA enforcement startup', () => {
  it('consumes every pending challenge before reactivation begins serving requests', async () => {
    const statements: Array<{ text: string; values?: readonly unknown[] }> = []
    const client = {
      query: vi.fn(async (text: string, values?: readonly unknown[]) => {
        statements.push({ text, values })
        return {
          rows: [],
          rowCount: 0,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        }
      }),
      release: vi.fn(),
    }
    const now = new Date('2026-07-29T12:00:00.000Z')

    await initializeMfaEnforcement({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        MFA_ENFORCEMENT_ENABLED: 'true',
        MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      }),
      db: {
        connect: vi.fn(async () => client),
      } as unknown as Database,
      fetch: globalThis.fetch,
      now: () => now,
    })

    const challengeCleanup = statements.find(({ text }) =>
      text.includes('update app_auth.mfa_challenges'))
    expect(challengeCleanup?.text).toContain('where consumed_at is null')
    expect(challengeCleanup?.text).not.toContain('expires_at')
    expect(challengeCleanup?.values).toEqual([now])
    expect(client.release).toHaveBeenCalledOnce()
  })
})

describe('MFA challenge serialization', () => {
  it('serializes by account without reversing the challenge/account lock order', async () => {
    const statements: Array<{ text: string; values?: readonly unknown[] }> = []
    const accountId = '10000000-0000-4000-8000-000000000001'
    const client = {
      async query(text: string, values?: readonly unknown[]) {
        statements.push({ text, values })
        const rows = text.includes('from app_auth.accounts account')
          ? [{ id: accountId, first_login: false, has_mfa_factor: true }]
          : []
        return {
          rows,
          rowCount: rows.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }
      },
    } as Queryable
    const now = new Date('2026-07-29T12:00:00.000Z')

    const created = await createMfaChallenge(
      client,
      accountId,
      3,
      now,
      600,
      5,
      {
        headers: { 'user-agent': 'challenge-test' },
        ip: '127.0.0.1',
      } as FastifyRequest,
    )

    expect(statements).toHaveLength(4)
    expect(statements[0]).toMatchObject({
      text: 'select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))',
      values: [accountId],
    })
    expect(statements[1]).toMatchObject({
      values: [accountId, 3],
    })
    expect(statements[1]?.text).toContain('account.password_version = $2')
    expect(statements[1]?.text).toContain("profile.status = 'active'")
    expect(statements[2]?.text).toContain('update app_auth.mfa_challenges')
    expect(statements[3]?.text).toContain('insert into app_auth.mfa_challenges')
    expect(created.stage).toBe('mfa_verify')
  })

  it('does not issue a challenge after the profile or password version changed', async () => {
    const query = vi.fn(async () => ({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }))
    const now = new Date('2026-07-29T12:00:00.000Z')

    await expect(createMfaChallenge(
      { query } as unknown as Queryable,
      '10000000-0000-4000-8000-000000000001',
      3,
      now,
      600,
      5,
      { headers: {}, ip: '127.0.0.1' } as FastifyRequest,
    )).rejects.toMatchObject({ statusCode: 401, code: 'invalid_credentials' })

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    expect(query.mock.calls[1]?.[0]).toContain("profile.status = 'active'")
    expect(query.mock.calls[1]?.[0]).toContain('account.password_version = $2')
  })
})

describe('server-controlled MFA rollout session issuance', () => {
  async function createLoginHarness() {
    const now = new Date('2026-07-29T12:00:00.000Z')
    const accountId = '10000000-0000-4000-8000-000000000001'
    const password = 'Valid1!Password'
    const encryptedPassword = await bcrypt.hash(password, 4)
    const statements: string[] = []
    const row = {
      id: 'profile-1',
      auth_user_id: accountId,
      name: 'Legacy User',
      email: 'legacy@example.test',
      username: 'legacy',
      role: 'ASSOCIATE',
      avatar: null,
      status: 'active',
      first_login: false,
      mfa_enabled: false,
      created_at: now,
      team: 'BD',
      manager_id: null,
      account_id: accountId,
      encrypted_password: encryptedPassword,
      password_version: 4,
      has_mfa_factor: false,
    }
    const client = {
      query: vi.fn(async (text: string) => {
        statements.push(text)
        const rows = text.includes('from app_auth.accounts account')
          ? [{ id: accountId, first_login: false, has_mfa_factor: false }]
          : []
        return {
          rows,
          rowCount: rows.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }
      }),
      release: vi.fn(),
    }
    const db = {
      query: vi.fn(async (text: string) => {
        if (text.includes('from app_auth.accounts a')) {
          return {
            rows: [row],
            rowCount: 1,
            command: 'SELECT',
            oid: 0,
            fields: [],
          }
        }
        throw new Error(`Unexpected pool query: ${text}`)
      }),
      connect: vi.fn(async () => client),
      end: vi.fn(async () => undefined),
    } as unknown as Database

    return { db, now, password, row, statements }
  }

  it('ignores a cached client MFA preference while enforcement is disabled', async () => {
    const { db, now, password, row, statements } = await createLoginHarness()
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        LOG_LEVEL: 'silent',
      }),
      db,
      fetch: globalThis.fetch,
      now: () => now,
    })

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: row.email, password, mfaSupported: true },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.session.assurance_level).toBe('legacy')
      const guardIndex = statements.findIndex(text =>
        text.includes('from app_auth.accounts account'))
      const insertIndex = statements.findIndex(text =>
        text.includes('insert into app_auth.sessions'))
      expect(statements[guardIndex]).toContain('account.password_version = $2')
      expect(statements[guardIndex]).toContain("profile.status = 'active'")
      expect(statements.slice(0, guardIndex)).toContain(
        'select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))',
      )
      expect(guardIndex).toBeLessThan(insertIndex)
    } finally {
      await app.close()
    }
  })

  it('starts the MFA flow when server enforcement is enabled without a client hint', async () => {
    const { db, now, password, row, statements } = await createLoginHarness()
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        LOG_LEVEL: 'silent',
        MFA_ENFORCEMENT_ENABLED: 'true',
        MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      }),
      db,
      fetch: globalThis.fetch,
      now: () => now,
    })

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: row.email, password },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.stage).toBe('mfa_enroll')
      expect(response.json().data.challenge.access_token).toEqual(expect.any(String))
      expect(statements.some(text =>
        text.includes('insert into app_auth.mfa_challenges'))).toBe(true)
      expect(statements.some(text =>
        text.includes('insert into app_auth.sessions'))).toBe(false)
    } finally {
      await app.close()
    }
  })

  it('rejects a previously issued MFA challenge while enforcement is disabled', async () => {
    const query = vi.fn(async () => ({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }))
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        LOG_LEVEL: 'silent',
      }),
      db: {
        query,
        end: async () => undefined,
      } as unknown as Database,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: {
          authorization: 'Bearer previously-issued-mfa-challenge-token-that-is-long-enough',
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('challenge_invalid')
      expect(query).toHaveBeenCalledTimes(1)
      expect(query.mock.calls[0]?.[0]).toContain('from app_auth.sessions')
    } finally {
      await app.close()
    }
  })
})

describe('first-login authentication boundary', () => {
  it('authenticates before password validation and rate-limits unauthenticated work', async () => {
    const query = vi.fn(async () => {
      throw new Error('The database must not be queried without a bearer token.')
    })
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        LOG_LEVEL: 'silent',
        MFA_MAX_ATTEMPTS: '1',
      }),
      db: {
        query,
        end: async () => undefined,
      } as unknown as Database,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })

    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/first-login',
        payload: { password: 'weak' },
      })
      expect(first.statusCode).toBe(401)
      expect(first.json().error.code).toBe('unauthorized')
      expect(query).not.toHaveBeenCalled()

      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/first-login',
        payload: { password: 'Valid1!Password' },
      })
      expect(second.statusCode).toBe(429)
      expect(query).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
