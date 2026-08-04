import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readPage = (name: string) => readFileSync(join(process.cwd(), 'src/pages', name), 'utf8')

describe('attachment download surface coverage', () => {
  it('shows reusable download rows for BD proposals and comment attachments', () => {
    const source = readPage('BDTrackerPage.tsx')
    expect(source).toContain('<AttachmentDownloadAction')
    expect(source).toMatch(/proposalAttachments\.map\(att => \([\s\S]*?<AttachmentDownloadRow/)
    expect(source).toMatch(/comment\.attachments[\s\S]*?\.map\(attachment => \([\s\S]*?<AttachmentDownloadRow/)
  })

  it('uses the source opportunity as the authoritative Fresh Award proposal list', () => {
    const source = readPage('FreshAwardPage.tsx')
    expect(source).toMatch(/const proposalAttachments: FileAttachment\[\] = sourceOpp[\s\S]*?\? sourceOpp\.proposalAttachments \?\? \[\][\s\S]*?: fa\.proposalAttachments \?\? \[\]/)
    expect(source).not.toContain('sourceOpp?.proposalAttachments?.length')
    expect(source).toMatch(/proposalAttachments\.map\(att => \([\s\S]*?<AttachmentDownloadRow/)
  })

  it('adds explicit reusable download rows to contract warnings and communication entries', () => {
    const source = readPage('ContractsPage.tsx')
    expect(source).toMatch(/w\.attachments[\s\S]*?\.map\(att => \([\s\S]*?<AttachmentDownloadRow/)
    expect(source).toMatch(/comment\.attachments[\s\S]*?\.map\(att => \([\s\S]*?<AttachmentDownloadRow/)
    expect(source).toMatch(/entry\.attachments[\s\S]*?\.map\(att => \([\s\S]*?<AttachmentDownloadRow/)
  })

  it('lists a separate visible action for every certification attachment', () => {
    const source = readPage('CertificationsPage.tsx')
    expect(source).not.toContain('downloadCertificationAttachment(cert)')
    expect(source).toMatch(/cert\.attachments[\s\S]*?\.map\(attachment => \([\s\S]*?<AttachmentDownloadRow/)
    expect(source).toMatch(/attachments\.map\(att => \([\s\S]*?<AttachmentDownloadAction/)
  })
})
