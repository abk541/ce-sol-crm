import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/007_contract_award_documents.sql', import.meta.url),
  'utf8',
)

describe('contract award documents migration', () => {
  it('adds an idempotent, non-null JSONB collection to contracts', () => {
    expect(migration).toContain('alter table public.contracts')
    expect(migration).toContain('add column if not exists award_documents jsonb')
    expect(migration).toContain("not null default '[]'::jsonb")
    expect(migration).toContain('\\set ON_ERROR_STOP on')
  })

  it('guards cleanup with a narrow definer function that locks and checks every contract', () => {
    expect(migration).toContain('private.contract_award_file_is_referenced')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set row_security = off')
    expect(migration).toContain('lock table public.contracts in share mode')
    expect(migration).toContain('grant execute on function private.contract_award_file_is_referenced(text)')
    expect(migration).toContain('to app_runtime')
    expect(migration).toContain('from public, authenticated')
  })

  it('creates a least-privilege durable deletion queue for post-commit byte cleanup', () => {
    expect(migration).toContain(
      'create table if not exists app_files.contract_award_deletion_queue',
    )
    expect(migration).toContain('object_key uuid primary key')
    expect(migration).toContain("storage_path like 'contract_awards/%'")
    expect(migration).toContain('attempt_count integer not null default 0')
    expect(migration).toContain(
      'grant select, delete\n  on table app_files.contract_award_deletion_queue\n  to app_runtime',
    )
    expect(migration).toContain(
      'grant insert (object_key, storage_path, queued_by)',
    )
    expect(migration).toContain(
      'grant update (attempt_count, last_attempt_at, last_error_code)',
    )
    expect(migration).toContain(
      'revoke truncate, references, trigger\n  on table app_files.contract_award_deletion_queue\n  from app_runtime',
    )
  })

  it('locks award object rows before contract writes without exposing the file table', () => {
    expect(migration).toContain(
      'private.lock_existing_contract_award_files',
    )
    expect(migration).toContain('order by object_file.storage_path')
    expect(migration).toContain('for key share')
    expect(migration).toContain(
      'revoke all on function private.lock_existing_contract_award_files(text[])\n  from public',
    )
    expect(migration).toContain(
      'grant execute on function private.lock_existing_contract_award_files(text[])\n  to authenticated',
    )
  })
})
