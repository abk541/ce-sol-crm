import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/013_sync_proposal_snapshots.sql', import.meta.url),
  'utf8',
)

describe('proposal snapshot synchronization migration', () => {
  it('keeps both helper functions narrow and permission gated', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("private.has_permission('opportunity:submitProposal')")
    expect(migration).toContain("private.has_permission('opportunity:edit')")
    expect(migration).toContain('revoke all on function private.proposal_attachment_file_metadata(text[])')
    expect(migration).toContain('revoke all on function private.sync_opportunity_proposal_attachments(text, jsonb)')
    expect(migration).toContain('from public, app_runtime')
    expect(migration).toContain('to authenticated')
  })

  it('accepts only immutable proposal objects with canonical metadata', () => {
    expect(migration).toContain("requested_path not like 'proposals/%'")
    expect(migration).toContain("attachment->>'storagePath' not like 'proposals/%'")
    expect(migration).toContain('object_file.content_available')
    expect(migration).toContain("object_file.attachment_id = attachment->>'id'")
    expect(migration).toContain("object_file.original_name = attachment->>'name'")
    expect(migration).toContain("object_file.size_bytes::text = attachment->>'size'")
    expect(migration).toContain('for key share')
  })

  it('cannot be used to desynchronize a linked contract or award directly', () => {
    expect(migration).toMatch(/from public\.opportunities opportunity[\s\S]+for update;/)
    expect(migration).toContain('current_attachments is distinct from target_attachments')
    expect(migration).toContain('set proposal_attachments = target_attachments')
    expect(migration).not.toContain('set proposal_attachments = coalesce')
  })
})
