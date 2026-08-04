import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/012_repair_contract_proposal_reference.sql', import.meta.url),
  'utf8',
)

describe('verified contract proposal repair migration', () => {
  it('remains limited to the one audited contract and opportunity', () => {
    expect(migration).toContain("c.id = 'c1785334021365'")
    expect(migration).toContain("c.opportunity_id = 'o1783017612509'")
    expect(migration).toContain("c.proposal_attachments->0->>'id' = '1b06f2a7-3b92-4cc2-907e-57d5dd609719'")
    expect(migration).toContain("o.proposal_attachments->0->>'id' = '74747b7a-1c87-4857-8bee-8bebdbc5ec5c'")
    expect(migration).toMatch(/c\.proposal_attachments->0->>'mimeType' is not distinct from\s+o\.proposal_attachments->0->>'mimeType'/)
    expect(migration).toContain('if eligible_rows <> 1 then')
    expect(migration).toContain('if repaired_rows <> 1 then')
  })

  it('locks every row that participates in the eligibility decision', () => {
    expect(migration).toMatch(/from public\.contracts c[\s\S]+?for update;/)
    expect(migration).toMatch(/from public\.opportunities o[\s\S]+?for update;/)
    expect(migration).toMatch(/from app_files\.objects f[\s\S]+?order by f\.storage_path[\s\S]+?for update;/)
  })

  it('requires the healthy JSON metadata to match the private file row exactly', () => {
    expect(migration).toContain("f.attachment_id = o.proposal_attachments->0->>'id'")
    expect(migration).toContain("f.original_name = o.proposal_attachments->0->>'name'")
    expect(migration).toContain("f.size_bytes::text = o.proposal_attachments->0->>'size'")
    expect(migration).toContain("f.content_type is not distinct from o.proposal_attachments->0->>'mimeType'")
    expect(migration).toContain("f.attached_at at time zone 'UTC'")
    expect(migration).toContain("o.proposal_attachments->0->>'attachedAt'")
    expect(migration).toContain('left join public.users uploader')
    expect(migration).toContain("coalesce(uploader.username, uploader.name, '')")
    expect(migration).toContain("o.proposal_attachments->0->>'uploadedBy'")
    expect(migration).toContain('and f.content_available')
  })
})
