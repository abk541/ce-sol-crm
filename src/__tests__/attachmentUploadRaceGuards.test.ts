import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readPage = (name: string) => readFileSync(join(process.cwd(), 'src/pages', name), 'utf8')

describe('attachment upload race guards', () => {
  it('locks comment attachment upload and removal while the parent form saves or imports', () => {
    const source = readPage('PipelinePage.tsx')

    expect(source).toContain('onChange(current => [...current, attachment])')
    expect(source).toContain('onChange(current => current.filter(item => item.id !== att.id))')
    expect(source).toContain('const busy = uploading || locked')
    expect(source).toMatch(/if \(!selectedFile \|\| !attachedAt \|\| busy\) return/)
    expect(source).toMatch(/onClick=\{\(\) => onChange\(current => current\.filter\(item => item\.id !== att\.id\)\)\}[\s\S]*?disabled=\{busy\}/)
    expect(source).toMatch(/attachments=\{newCommentAttachments\}[\s\S]*?locked=\{saving\}/)
    expect(source).toMatch(/attachments=\{initialCommentAttachments\}[\s\S]*?locked=\{saving \|\| importing\}/)
  })

  it('locks every HR request control while an upload or database save is pending', () => {
    const source = readPage('HRPage.tsx')

    expect(source).toContain('const busy = uploading || submitting')
    expect(source).toContain('if (!files?.length || busy) return')
    expect(source).toContain('<fieldset disabled={busy} className="contents">')
    expect(source).toMatch(/onClick=\{\(\) => setAttachments\(current => current\.filter\(item => item\.id !== attachment\.id\)\)\}[\s\S]*?disabled=\{busy\}/)
    expect(source).toMatch(/type="file"[\s\S]*?disabled=\{busy\}/)
    expect(source).toMatch(/type="submit" disabled=\{busy\}/)
  })

  it('blocks proposal submission controls until every selected upload settles', () => {
    const source = readPage('PipelinePage.tsx')

    expect(source).toContain('const [uploadingProposals, setUploadingProposals] = useState(false)')
    expect(source).toContain('uploadAttachmentsSequentially(')
    expect(source).toContain('<ModalWrap onClose={closeWhenIdle} title="Submit Proposal"')
    expect(source).toMatch(/onClick=\{confirm\}[\s\S]*?disabled=\{proposalBusy\}/)
    expect(source).toMatch(/onClick=\{closeWhenIdle\}[\s\S]*?disabled=\{proposalBusy\}/)
  })

  it('persists successful tracker uploads incrementally and blocks save or close while busy', () => {
    const source = readPage('BDTrackerPage.tsx')

    expect(source).toContain('uploadAttachmentsSequentially(')
    expect(source).not.toMatch(/Promise\.all\(Array\.from\(files\).*fileToProposalAttachment/)
    expect(source).toContain('onClose={closeWhenIdle}')
    expect(source).toMatch(/onClick=\{save\} disabled=\{busy\}/)
    expect(source).toMatch(/onClick=\{closeWhenIdle\} disabled=\{busy\}/)
  })
})
