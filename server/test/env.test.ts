import { describe, expect, it } from 'vitest'
import { loadEnvironment } from '../src/env.js'

describe('environment validation', () => {
  it('normalizes an exact origin allowlist', () => {
    const env = loadEnvironment({
      DATABASE_URL: 'postgresql://example.invalid/app',
      ALLOWED_ORIGINS: 'https://crm.example.test,https://backup.example.test/path',
    })
    expect([...env.allowedOrigins]).toEqual([
      'https://crm.example.test',
      'https://backup.example.test',
    ])
  })

  it('requires a database URL and rejects invalid numbers', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/)
    expect(() => loadEnvironment({ DATABASE_URL: 'postgresql://x/y', PORT: '0' })).toThrow(/PORT/)
  })

  it('keeps MFA enforcement off only when the flag is absent or exactly false', () => {
    const base = { DATABASE_URL: 'postgresql://example.invalid/app' }
    expect(loadEnvironment(base).mfaEnforcementEnabled).toBe(false)
    expect(loadEnvironment({ ...base, MFA_ENFORCEMENT_ENABLED: 'false' }).mfaEnforcementEnabled).toBe(false)
    expect(() => loadEnvironment({ ...base, MFA_ENFORCEMENT_ENABLED: 'TRUE' })).toThrow(
      /exactly true or false/,
    )
    expect(() => loadEnvironment({ ...base, MFA_ENFORCEMENT_ENABLED: '1' })).toThrow(
      /exactly true or false/,
    )
  })

  it('requires one canonical 32-byte key when MFA enforcement is enabled', () => {
    const base = {
      DATABASE_URL: 'postgresql://example.invalid/app',
      MFA_ENFORCEMENT_ENABLED: 'true',
    }
    expect(() => loadEnvironment(base)).toThrow(/MFA_ENCRYPTION_KEY is required/)
    expect(() => loadEnvironment({ ...base, MFA_ENCRYPTION_KEY: 'not-base64' })).toThrow(
      /canonical base64-encoded 32-byte key/,
    )
    const key = Buffer.alloc(32, 7).toString('base64')
    expect(loadEnvironment({ ...base, MFA_ENCRYPTION_KEY: key }).mfaEncryptionKey).toEqual(
      Buffer.alloc(32, 7),
    )
  })
})
