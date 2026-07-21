import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/004_preserve_canceled_opportunities.sql', import.meta.url),
  'utf8',
)

function deletePolicy(table: 'opportunities' | 'bd_submissions' | 'non_submission_reports'): string {
  const start = migration.indexOf(`create policy rbac_delete_authorized on public.${table}`)
  if (start < 0) throw new Error(`Missing ${table} delete policy`)
  const end = migration.indexOf(';', start)
  if (end < 0) throw new Error(`Unterminated ${table} delete policy`)
  return migration.slice(start, end + 1)
}

describe('canceled opportunity preservation migration', () => {
  it('keeps parent hard deletion approval-only', () => {
    const policy = deletePolicy('opportunities')
    expect(policy).toContain("'opportunity:deleteApprove'")
    expect(policy).not.toContain("'opportunity:edit'")
  })

  it('allows an edit-authorized return workflow to remove only its tracker row', () => {
    const policy = deletePolicy('bd_submissions')
    expect(policy).toContain("'opportunity:deleteApprove'")
    expect(policy).toContain("'opportunity:edit'")
  })

  it('counts soft-deleted opportunities when deciding whether a legacy link is unambiguous', () => {
    expect(migration).not.toContain('coalesce(is_deleted, false) = false')
  })

  it('lets the atomic late-submit workflow remove its pending report', () => {
    const policy = deletePolicy('non_submission_reports')
    expect(policy).toContain("'opportunity:submitProposal'")
    expect(policy).toContain("'opportunity:cancel'")
    expect(policy).toContain("'nonSubmission:review'")
  })

  it('keeps report create and edit policies permission-aware', () => {
    const insertStart = migration.indexOf('create policy native_authenticated_insert on public.non_submission_reports')
    const updateStart = migration.indexOf('create policy native_authenticated_update on public.non_submission_reports')
    expect(insertStart).toBeGreaterThan(-1)
    expect(updateStart).toBeGreaterThan(insertStart)
    const insertPolicy = migration.slice(insertStart, updateStart)
    const updatePolicy = migration.slice(updateStart, migration.indexOf('-- Late proposal submission', updateStart))
    expect(insertPolicy).toContain("'nonSubmission:submit'")
    expect(insertPolicy).not.toContain('with check (true)')
    expect(updatePolicy).toContain("'nonSubmission:review'")
    expect(updatePolicy).not.toContain('using (true)')
  })
})
