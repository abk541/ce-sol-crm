import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/008_private_integration_secrets.sql', import.meta.url),
  'utf8',
)

describe('private integration secrets migration', () => {
  it('creates an idempotent private store with fail-fast execution', () => {
    expect(migration).toContain('\\set ON_ERROR_STOP on')
    expect(migration).toContain('create table if not exists private.integration_secrets')
    expect(migration).toContain('secret_value text not null')
    expect(migration).toContain('create index if not exists integration_secrets_updated_by_idx')
  })

  it('keeps browser roles out and grants only the API service access', () => {
    expect(migration).toContain(
      'revoke all on private.integration_secrets from public, authenticated',
    )
    expect(migration).not.toContain('from public, anon, authenticated')
    expect(migration).toContain(
      'grant select, insert, update, delete on private.integration_secrets to app_runtime',
    )
  })

  it('moves and removes any legacy browser-readable SAM.gov key', () => {
    expect(migration).toContain("insert into private.integration_secrets (name, secret_value)")
    expect(migration).toContain("where key = 'sam_gov_api_key'")
    expect(migration).toContain(
      "delete from public.app_settings where key = 'sam_gov_api_key'",
    )
    expect(migration).toContain('delete from app_events.outbox')
    expect(migration).toContain("old_row ->> 'key' = 'sam_gov_api_key'")
    expect(migration).toContain("new_row ->> 'key' = 'sam_gov_api_key'")
  })

  it('tightens the public allowlist only after preserving and deleting the legacy key', () => {
    const copyIndex = migration.indexOf("select 'sam_gov_api_key', btrim(value)")
    const deleteIndex = migration.indexOf(
      "delete from public.app_settings where key = 'sam_gov_api_key'",
    )
    const strictConstraintIndex = migration.lastIndexOf(
      'add constraint app_settings_known_non_secret_key',
    )

    expect(copyIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(copyIndex)
    expect(strictConstraintIndex).toBeGreaterThan(deleteIndex)
    expect(migration.slice(strictConstraintIndex)).not.toContain('not valid')
  })
})
