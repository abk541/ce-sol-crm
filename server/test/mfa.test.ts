import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'
import {
  base32Decode,
  base32Encode,
  decryptMfaValue,
  encryptMfaValue,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  provisioningUri,
  verifyTotpCode,
} from '../src/mfa.js'
import { __test as mfaRouteTest } from '../src/mfa-routes.js'

describe('native MFA cryptography', () => {
  it('matches the RFC 6238 SHA-1 vector and rejects timestep replay', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
    const now = new Date(59_000)
    expect(verifyTotpCode(secret, '287082', now, null, 0)).toBe(1)
    expect(verifyTotpCode(secret, '287082', now, 1, 0)).toBeNull()
    expect(verifyTotpCode(secret, '000000', now, null, 0)).toBeNull()
  })

  it('round-trips base32 and produces an interoperable provisioning URI', () => {
    const bytes = randomBytes(20)
    const encoded = base32Encode(bytes)
    expect(base32Decode(encoded)).toEqual(bytes)
    const uri = new URL(provisioningUri('User@Example.test', encoded))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('secret')).toBe(encoded)
    expect(uri.searchParams.get('issuer')).toBe('CE Solution Plus CRM')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
  })

  it('encrypts secrets with authenticated context and rejects tampering or swapping', () => {
    const key = randomBytes(32)
    const encrypted = encryptMfaValue(key, 'TOP-SECRET', 'factor:one:totp')
    expect(encrypted.ciphertext.toString('utf8')).not.toContain('TOP-SECRET')
    expect(decryptMfaValue(key, encrypted, 'factor:one:totp')).toBe('TOP-SECRET')
    expect(() => decryptMfaValue(key, encrypted, 'factor:two:totp')).toThrow()
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from(encrypted.ciphertext),
    }
    tampered.ciphertext[0] = tampered.ciphertext[0]! ^ 1
    expect(() => decryptMfaValue(key, tampered, 'factor:one:totp')).toThrow()
  })

  it('creates high-entropy one-time recovery codes and keyed database hashes', () => {
    const key = randomBytes(32)
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/)
      const normalized = normalizeRecoveryCode(code)
      expect(normalized).toHaveLength(16)
      expect(hashRecoveryCode(key, normalized as string)).toMatch(/^[0-9a-f]{64}$/)
    }
    const normalized = normalizeRecoveryCode(codes[0]) as string
    expect(hashRecoveryCode(key, normalized)).not.toBe(hashRecoveryCode(Buffer.alloc(32, 7), normalized))
  })
})

describe('native MFA transaction ordering', () => {
  it('revokes only legacy sessions after MFA verification', async () => {
    const accountId = '10000000-0000-4000-8000-000000000001'
    const now = new Date('2026-07-29T12:00:00.000Z')
    const statements: Array<{ text: string; values?: readonly unknown[] }> = []
    const client = {
      query: async (text: string, values?: readonly unknown[]) => {
        statements.push({ text, values })
        return {
          rows: [],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        }
      },
    } as unknown as PoolClient

    await mfaRouteTest.revokeLegacySessions(client, accountId, now)

    expect(statements).toHaveLength(1)
    expect(statements[0]?.text).toContain("assurance_level = 'legacy'")
    expect(statements[0]?.text).toContain('revoked_at is null')
    expect(statements[0]?.values).toEqual([accountId, now])
  })

  it('serializes the account before locking a challenge row', async () => {
    const accountId = '10000000-0000-4000-8000-000000000001'
    const challengeId = '20000000-0000-4000-8000-000000000002'
    const now = new Date('2026-07-29T12:00:00.000Z')
    const statements: Array<{ text: string; values?: readonly unknown[] }> = []
    const lockedRow = {
      id: challengeId,
      account_id: accountId,
      password_version: 2,
      stage: 'mfa_verify' as const,
      attempts_remaining: 5,
      expires_at: new Date(now.getTime() + 60_000),
      pending_secret: null,
      pending_secret_iv: null,
      pending_secret_auth_tag: null,
      pending_secret_key_version: null,
      pending_factor_id: null,
      pending_recovery_codes: null,
      pending_recovery_iv: null,
      pending_recovery_auth_tag: null,
      pending_recovery_key_version: null,
    }
    const client = {
      query: async (text: string, values?: readonly unknown[]) => {
        statements.push({ text, values })
        const rows = text.includes('from app_auth.mfa_challenges challenge')
          ? [lockedRow]
          : []
        return {
          rows,
          rowCount: rows.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }
      },
    } as unknown as PoolClient

    await mfaRouteTest.lockChallenge(
      client,
      {
        id: 'profile-1',
        auth_user_id: accountId,
        name: 'MFA User',
        email: 'mfa@example.test',
        username: 'mfa-user',
        role: 'ASSOCIATE',
        avatar: null,
        status: 'active',
        first_login: false,
        mfa_enabled: true,
        created_at: now,
        team: 'BD',
        manager_id: null,
        challengeId,
        accountId,
        passwordVersion: 2,
        stage: 'mfa_verify',
        attemptsRemaining: 5,
        createdAt: now,
        expiresAt: lockedRow.expires_at,
      },
      'mfa_verify',
      now,
    )

    expect(statements).toHaveLength(2)
    expect(statements[0]).toEqual({
      text: 'select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))',
      values: [accountId],
    })
    expect(statements[1]?.text).toContain('for update of challenge')
  })

  it('restores a complete encrypted recovery bundle after a lost confirm response', async () => {
    const key = randomBytes(32)
    const accountId = '10000000-0000-4000-8000-000000000001'
    const challengeId = '20000000-0000-4000-8000-000000000002'
    const now = new Date('2026-07-29T12:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 60_000)
    const recoveryCodes = generateRecoveryCodes()
    const encrypted = encryptMfaValue(
      key,
      JSON.stringify(recoveryCodes),
      `challenge:${challengeId}:recovery`,
    )
    const challenge = {
      id: 'profile-1',
      auth_user_id: accountId,
      name: 'MFA User',
      email: 'mfa@example.test',
      username: 'mfa-user',
      role: 'ASSOCIATE',
      avatar: null,
      status: 'active',
      first_login: false,
      mfa_enabled: false,
      created_at: now,
      team: 'BD',
      manager_id: null,
      challengeId,
      accountId,
      passwordVersion: 2,
      stage: 'mfa_recovery' as const,
      attemptsRemaining: 5,
      createdAt: now,
      expiresAt,
    }
    const client = {
      query: async (text: string) => {
        const rows = text.includes('from app_auth.mfa_challenges challenge')
          ? [{
              id: challengeId,
              account_id: accountId,
              password_version: 2,
              stage: 'mfa_recovery',
              attempts_remaining: 5,
              expires_at: expiresAt,
              pending_secret: null,
              pending_secret_iv: null,
              pending_secret_auth_tag: null,
              pending_secret_key_version: null,
              pending_factor_id: '30000000-0000-4000-8000-000000000003',
              pending_recovery_codes: encrypted.ciphertext,
              pending_recovery_iv: encrypted.iv,
              pending_recovery_auth_tag: encrypted.authTag,
              pending_recovery_key_version: encrypted.keyVersion,
            }]
          : []
        return {
          rows,
          rowCount: rows.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }
      },
    } as unknown as PoolClient

    await expect(
      mfaRouteTest.loadPendingRecoveryCodes(client, challenge, key, now),
    ).resolves.toEqual({ recoveryCodes, expiresAt })
  })
})
