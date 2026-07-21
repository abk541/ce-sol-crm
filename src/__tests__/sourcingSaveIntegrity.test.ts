import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/pages/PipelinePage.tsx'), 'utf8')

describe('sourcing save integrity contract', () => {
  it('blocks saves and edits while quote uploads are unsettled', () => {
    expect(source).toContain('if (saving || uploadingQuotesRef.current || deletingRef.current) return')
    expect(source).toContain('<fieldset disabled={saving || uploadingQuotes || deleting}')
    expect(source).toContain('disabled={!dirty || saving || uploadingQuotes}')
    expect(source.match(/disabled=\{saving \|\| uploadingQuotes\}/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('awaits a sourcing deletion before removing the local row or showing success', () => {
    expect(source).toContain('deleted = await deleteSubcontractor(selected.id)')
    expect(source).toContain('if (!deleted) return')
    expect(source.indexOf('deleted = await deleteSubcontractor(selected.id)'))
      .toBeLessThan(source.indexOf("toast.success('Subcontractor removed')"))
  })

  it('keeps successful files when only part of a multi-file upload fails', () => {
    expect(source).toContain('await Promise.allSettled(')
    expect(source).toContain("result.status === 'fulfilled'")
    expect(source).toContain('if (additions.length > 0)')
    expect(source).toContain('finally {')
    expect(source).toContain('uploadingQuotesRef.current = false')
  })
})
