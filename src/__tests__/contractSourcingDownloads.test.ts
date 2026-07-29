import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Contract Admin sourcing downloads', () => {
  it('lists source-opportunity quote attachments with a visible download action', () => {
    const contractsSource = readFileSync(
      join(process.cwd(), 'src/pages/ContractsPage.tsx'),
      'utf8',
    )
    const pipelineSource = readFileSync(
      join(process.cwd(), 'src/pages/PipelinePage.tsx'),
      'utf8',
    )

    expect(contractsSource).toContain(
      'const contractSourcingQuoteAttachments = collectSourcingQuoteAttachments(sourceOpportunitySourcing)',
    )
    expect(contractsSource).toContain('Sourcing Quote Files')
    expect(contractsSource).toMatch(
      /contractSourcingQuoteAttachments\.map\(att =>[\s\S]*?onClick=\{\(\) => downloadAttachment\(att\)\}[\s\S]*?<Download size=\{12\} \/> Download/,
    )
    expect(pipelineSource).toMatch(
      /function QuoteFileChip[\s\S]*?downloadPipelineAttachment\(file\)[\s\S]*?<Download size=\{11\} \/> Download/,
    )
  })
})
