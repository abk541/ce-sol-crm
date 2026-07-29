import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Subcontractor Database quote downloads', () => {
  it('retains sourcing attachment metadata and wires every available quote to the shared download path', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/SubkDatabasePage.tsx'),
      'utf8',
    )

    expect(source).toContain('_quoteAttachments?: FileAttachment[]')
    expect(source).toContain(
      '_quoteAttachments: collectSourcingQuoteAttachments(sourcingByCompany.get(key) ?? [])',
    )
    expect(source).toMatch(
      /function downloadSubkQuote[\s\S]*?downloadAttachment\(file\)[\s\S]*?attachmentAccessErrorMessage\(error,/,
    )
    expect(source).toMatch(
      /quoteAttachments\.map\(file =>[\s\S]*?onClick=\{\(\) => downloadSubkQuote\(file\)\}[\s\S]*?<Download size=\{11\} \/> \{downloadable \? 'Download' : 'Re-upload required'\}/,
    )
    expect(source).not.toContain(
      '<button className="text-xs text-indigo-600 hover:underline">Download</button>',
    )
  })
})
