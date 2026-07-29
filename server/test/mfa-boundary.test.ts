import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SENSITIVE_LOG_PATHS } from '../src/app.js'

const authSource = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8')

describe('MFA disclosure boundary', () => {
  it('redacts challenge, authenticator, OTP, and recovery material from structured logs', () => {
    expect(SENSITIVE_LOG_PATHS).toEqual(expect.arrayContaining([
      'body.code',
      'body.recoveryCode',
      'body.mfaSecret',
      'body.secret',
      'body.manualKey',
      'body.otpauthUrl',
      'body.challengeToken',
      'body.recoveryCodes',
    ]))
  })

  it('projects only the public MFA status in normal profile envelopes', () => {
    const projection = authSource.match(
      /const SAFE_PROFILE_COLUMNS = \[([\s\S]*?)\]\s+as const/,
    )?.[1] ?? ''
    expect(projection).toContain("'mfa_enabled'")
    expect(projection).not.toMatch(/secret|recovery|challenge|auth_tag|ciphertext/i)
  })
})
