import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/009_native_mfa.sql', import.meta.url),
  'utf8',
)

describe('native MFA migration', () => {
  it('fails fast and remains idempotent', () => {
    expect(migration).toContain('\\set ON_ERROR_STOP on')
    expect(migration).toContain('add column if not exists assurance_level')
    expect(migration).toContain('create table if not exists app_auth.mfa_factors')
    expect(migration).toContain('create table if not exists app_auth.mfa_challenges')
    expect(migration).toContain('create table if not exists app_auth.mfa_recovery_codes')
    expect(migration).toContain('create index if not exists mfa_challenges_account_active_idx')
  })

  it('keeps all MFA material private to the native API role', () => {
    expect(migration).toContain('from public, authenticated')
    expect(migration).not.toContain('from public, anon, authenticated')
    expect(migration).toContain('to app_runtime')
    expect(migration).not.toMatch(/grant\s+.+\s+to\s+(?:public|authenticated)/i)
  })

  it('rejects partially populated encryption envelopes', () => {
    for (const column of [
      'pending_secret_iv',
      'pending_secret_auth_tag',
      'pending_secret_key_version',
      'pending_recovery_iv',
      'pending_recovery_auth_tag',
      'pending_recovery_key_version',
    ]) {
      expect(migration).toContain(`${column} is not null`)
    }
  })

  it('marks old sessions as legacy and does not overwrite completed re-enrollment', () => {
    expect(migration).toContain("set assurance_level = 'legacy'")
    expect(migration).toContain("assurance_level in ('legacy', 'mfa')")
    expect(migration).toContain('where not exists (')
    expect(migration).toContain('factor.enabled_at is not null')
  })
})
