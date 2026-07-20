import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('SAM.gov server-side integration boundary', () => {
  const client = readRepoFile('src/lib/samGov.ts')
  const edgeFunction = readRepoFile('supabase/functions/sam-gov-import/index.ts')

  it('keeps the upstream endpoint and credential out of client code', () => {
    expect(client).not.toContain('api.sam.gov')
    expect(client).not.toContain('api_key')
    expect(client).toContain("requestSamGov('/integrations/sam/status')")
    expect(client).toContain("requestSamGov('/integrations/sam/import'")
  })

  it('requires a completed active profile and exposes status without the secret', () => {
    expect(edgeFunction).toContain('SAM_GOV_API_KEY')
    expect(edgeFunction).toContain('profile.status !== "active"')
    expect(edgeFunction).toContain('profile.first_login !== false')
    expect(edgeFunction).toContain('admin.rpc("service_role_has_user_permission"')
    expect(edgeFunction).toContain('requireUserPermission(admin, callerAuthUserId, "opportunity:create")')
    expect(edgeFunction).toContain('{ configured: apiKey.length > 0 }')
    expect(edgeFunction).toContain('sanitizeSecret(opportunity, apiKey)')
    expect(edgeFunction).not.toContain('return jsonResponse({ apiKey')
  })
})

describe('private attachments and non-secret settings migration', () => {
  const migration = readRepoFile(
    'supabase/migrations/20260720191000_secure_sam_and_private_attachments.sql',
  )
  const contractsPage = readRepoFile('src/pages/ContractsPage.tsx')
  const pipelinePage = readRepoFile('src/pages/PipelinePage.tsx')
  const attachmentHelpers = readRepoFile('src/lib/attachments.ts')

  it('makes the bucket private and removes anonymous object privileges', () => {
    expect(migration).toContain("values ('attachments', 'attachments', false)")
    expect(migration).toContain('to authenticated')
    expect(migration).toContain('revoke all privileges on storage.objects from public, anon')
    expect(migration).not.toMatch(/create policy attachments_read[\s\S]*?to anon/)
  })

  it('deletes browser-stored secrets and permits only confirmed non-secret keys', () => {
    expect(migration).toContain('app_settings_known_non_secret_key')
    expect(migration).toContain("'non_sub_grace_hours', 'non_sub_grace_minutes'")
    expect(migration).not.toContain("'sam_gov_api_key'")
  })

  it('routes every contract preview through the centralized safe-preview helper', () => {
    expect(contractsPage).toContain('previewAttachment as previewAttachmentFile')
    expect(contractsPage).not.toContain("mimeType.startsWith('image/')")
    expect(contractsPage).not.toMatch(/jpe\?g\|gif\|webp\|avif\|svg/)
    expect(attachmentHelpers).toContain("blob.slice(0, blob.size, 'application/octet-stream')")
    expect(attachmentHelpers).toContain('hasExpectedFileSignature')
  })

  it('routes every Pipeline download through one rejection-handled toast helper', () => {
    expect(pipelinePage).toMatch(
      /async function downloadPipelineAttachment[\s\S]*?try\s*\{[\s\S]*?await downloadAttachment\(file\)[\s\S]*?catch\s*\{[\s\S]*?toast\.error/,
    )
    expect(pipelinePage.match(/void downloadPipelineAttachment\(/g)).toHaveLength(3)
    expect(pipelinePage).not.toContain('void downloadAttachment(')
  })
})
