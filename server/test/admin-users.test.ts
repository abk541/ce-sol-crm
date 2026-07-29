import { describe, expect, it, vi } from 'vitest'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import type { Database } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/env.js'
import type { SafeProfileRow } from '../src/types.js'

function result<R extends QueryResultRow>(rows: R[] = []): QueryResult<R> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }
}

describe('administrator user authentication revocation', () => {
  it('consumes pending MFA challenges in the same transaction that deactivates a user', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z')
    const callerAccountId = '10000000-0000-4000-8000-000000000001'
    const targetAccountId = '20000000-0000-4000-8000-000000000002'
    const targetUserId = 'target-user'
    const caller: SafeProfileRow = {
      id: 'caller-user',
      auth_user_id: callerAccountId,
      name: 'Admin',
      email: 'admin@example.test',
      username: 'admin',
      role: 'CAPTURE_MANAGER',
      avatar: null,
      status: 'active',
      first_login: false,
      mfa_enabled: true,
      created_at: now,
      team: 'BD',
      manager_id: null,
    }
    const target: SafeProfileRow = {
      id: targetUserId,
      auth_user_id: targetAccountId,
      name: 'Target',
      email: 'target@example.test',
      username: 'target',
      role: 'ASSOCIATE',
      avatar: null,
      status: 'active',
      first_login: false,
      mfa_enabled: true,
      created_at: now,
      team: 'BD',
      manager_id: caller.id,
    }
    const transactionStatements: Array<{ text: string; values?: readonly unknown[] }> = []

    const client = {
      query: vi.fn(async (text: string, values?: readonly unknown[]) => {
        transactionStatements.push({ text, values })
        if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
        if (text.includes("set_config('app.account_id'")) return result()
        if (text.includes('effective_permission_for_auth_user')) {
          return result([{ allowed: values?.[0] === callerAccountId }])
        }
        if (text.includes('pg_advisory_xact_lock')) return result()
        if (text.includes('from public.users where id = $1')) return result([target])
        if (text.startsWith('update public.users set')) {
          return result([{ ...target, status: 'inactive' as const }])
        }
        if (
          text.includes('update app_auth.sessions')
          || text.includes('update app_auth.mfa_challenges')
        ) {
          return result()
        }
        throw new Error(`Unexpected transaction query: ${text}`)
      }),
      release: vi.fn(),
    } as unknown as PoolClient

    const poolQuery = vi.fn(async (text: string) => {
      if (text.includes('from app_auth.sessions s')) {
        return result([{
          ...caller,
          session_id: 'session-1',
          account_id: callerAccountId,
          session_created_at: now,
          expires_at: new Date(now.getTime() + 60_000),
          password_version: 1,
          current_password_version: 1,
          assurance_level: 'mfa',
          mfa_verified_at: now,
        }])
      }
      if (text.includes('effective_permission_for_auth_user')) {
        return result([{ allowed: true }])
      }
      throw new Error(`Unexpected pool query: ${text}`)
    })
    const db = {
      query: poolQuery,
      connect: vi.fn(async () => client),
      end: vi.fn(async () => undefined),
    } as unknown as Database
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
        url: '/api/v1/admin/users/actions',
        headers: { authorization: `Bearer ${'a'.repeat(43)}` },
        payload: {
          action: 'update',
          userId: targetUserId,
          updates: { status: 'inactive' },
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().user.status).toBe('inactive')
      const sessionRevoke = transactionStatements.find(({ text }) =>
        text.includes('update app_auth.sessions'))
      const challengeRevoke = transactionStatements.find(({ text }) =>
        text.includes('update app_auth.mfa_challenges'))
      const challengeGuard = transactionStatements.find(({ text }) =>
        text.includes('hashtextextended'))
      expect(sessionRevoke?.values).toEqual([targetAccountId, now])
      expect(challengeRevoke?.values).toEqual([targetAccountId, now])
      expect(challengeGuard?.values).toEqual([targetAccountId])
      expect(transactionStatements.indexOf(challengeGuard!)).toBeLessThan(
        transactionStatements.indexOf(challengeRevoke!),
      )
      expect(transactionStatements.indexOf(challengeRevoke!)).toBeLessThan(
        transactionStatements.indexOf(sessionRevoke!),
      )
      expect(transactionStatements.at(-1)?.text).toBe('commit')
    } finally {
      await app.close()
    }
  })
})
