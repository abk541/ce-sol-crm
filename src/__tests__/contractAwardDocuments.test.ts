import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  appendAwardDocument,
  awardDocumentFilename,
  cleanupContractAwardDocument,
  cleanupContractAwardDocuments,
  createAwardDocumentUploadFile,
  detachedAwardDocuments,
  removeAwardDocument,
} from '../lib/contractAwardDocuments'

const contractsPage = readFileSync(
  join(process.cwd(), 'src/pages/ContractsPage.tsx'),
  'utf8',
)

describe('contract award documents', () => {
  it('uses the custom document name while retaining the real file extension', () => {
    expect(awardDocumentFilename('  Signed   Notice / of Award  ', 'original.PDF'))
      .toBe('Signed Notice of Award.PDF')
    expect(awardDocumentFilename('Executed Award.pdf', 'original.pdf'))
      .toBe('Executed Award.pdf')
  })

  it('rejects a blank custom name', () => {
    expect(() => awardDocumentFilename('  /  ', 'award.pdf'))
      .toThrow('Enter a document name')
  })

  it('keeps the real extension when a long custom name is truncated', () => {
    const filename = awardDocumentFilename(`${'Award '.repeat(40)}.pdf`, 'original.pdf')

    expect(filename.length).toBeLessThanOrEqual(180)
    expect(filename.endsWith('.pdf')).toBe(true)
  })

  it('renames the private upload without converting its bytes to base64', async () => {
    const source = new File(['private award bytes'], 'scan.pdf', {
      type: 'application/pdf',
      lastModified: 123,
    })

    const upload = createAwardDocumentUploadFile(source, 'Signed Award')

    expect(upload.name).toBe('Signed Award.pdf')
    expect(upload.type).toBe('application/pdf')
    expect(upload.lastModified).toBe(123)
    expect(await upload.text()).toBe('private award bytes')
  })

  it('applies a completed upload to the latest document list after a concurrent removal', () => {
    const removed = {
      id: 'old-award',
      name: 'Old Award.pdf',
      attachedAt: '2026-07-29T10:00:00.000Z',
      uploadedBy: 'Contract Admin',
      storagePath: 'contract_awards/old-award.pdf',
    }
    const uploaded = {
      id: 'new-award',
      name: 'New Award.pdf',
      attachedAt: '2026-07-29T11:00:00.000Z',
      uploadedBy: 'Contract Admin',
      storagePath: 'contract_awards/new-award.pdf',
    }

    const latestDocuments = removeAwardDocument([removed], removed.id)
    expect(appendAwardDocument(latestDocuments, uploaded)).toEqual([uploaded])
  })

  it('wires uploads to functional form updates instead of a captured attachment snapshot', () => {
    expect(contractsPage).toContain(
      'onChange(current => appendAwardDocument(current, attachment))',
    )
    expect(contractsPage).toContain(
      'awardDocuments: updateAwardDocuments(form.awardDocuments)',
    )
  })

  it('locks every edit-modal exit and document removal while an upload is pending', () => {
    expect(contractsPage.match(/onClick=\{\(\) => \{ void closeEditDetails\(\) \}\}/g)).toHaveLength(3)
    expect(contractsPage.match(/disabled=\{awardDocumentLifecycleBusy\}/g)).toHaveLength(2)
    expect(contractsPage).toMatch(
      /disabled=\{\s*awardDocumentLifecycleBusy\s*\|\| awardCleanupQueue\.length > 0\s*\}/,
    )
    expect(contractsPage).toMatch(
      /onClick=\{\(\) => onChange\(current => removeAwardDocument\(current, attachment\.id\)\)\}[\s\S]*?disabled=\{busy\}/,
    )
  })

  it('cleans newly uploaded private files before a canceled editor closes', async () => {
    const uploaded = {
      id: 'new-award',
      name: 'New Award.pdf',
      attachedAt: '2026-07-29T11:00:00.000Z',
      uploadedBy: 'Contract Admin',
      storagePath: 'contract_awards/new-award.pdf',
    }
    const cleanup = await cleanupContractAwardDocuments(
      [uploaded],
      async () => 'deleted',
    )

    expect(cleanup.deleted).toEqual([uploaded])
    expect(contractsPage).toMatch(
      /const closeEditDetails = async[\s\S]*\.\.\.newAwardDocuments[\s\S]*cleanupContractAwardDocuments\(cleanupCandidates\)/,
    )
  })

  it('treats a safely queued byte cleanup as resolved instead of blocking modal close', async () => {
    const uploaded = {
      id: 'queued-award',
      name: 'Queued Award.pdf',
      attachedAt: '2026-07-29T11:00:00.000Z',
      uploadedBy: 'Contract Admin',
      storagePath: 'contract_awards/queued-award.pdf',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        data: {
          deleted: true,
          storagePath: uploaded.storagePath,
          cleanupPending: true,
          status: 'queued',
        },
        error: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    try {
      await expect(cleanupContractAwardDocument(uploaded)).resolves.toBe('queued')
    } finally {
      fetchMock.mockRestore()
    }

    const cleanup = await cleanupContractAwardDocuments(
      [uploaded],
      async () => 'queued',
    )
    expect(cleanup.queued).toEqual([uploaded])
    expect(cleanup.failed).toEqual([])
    expect(contractsPage).toContain('...cleanup.queued')
  })

  it('cleans new uploads after a failed contract save without touching persisted removals', () => {
    const failedSaveStart = contractsPage.indexOf('if (!ok)')
    const successfulSaveStart = contractsPage.indexOf(
      'setPersistedAwardDocuments(finalAwardDocuments)',
      failedSaveStart,
    )
    const failedSaveBlock = contractsPage.slice(failedSaveStart, successfulSaveStart)

    expect(failedSaveStart).toBeGreaterThan(-1)
    expect(successfulSaveStart).toBeGreaterThan(failedSaveStart)
    expect(failedSaveBlock).toContain('cleanupContractAwardDocuments(pendingUploads)')
    expect(failedSaveBlock).not.toContain('detachedAwardDocuments(')
  })

  it('deletes detached persisted files only after a successful contract update', async () => {
    const persisted = {
      id: 'persisted-award',
      name: 'Persisted Award.pdf',
      attachedAt: '2026-07-29T10:00:00.000Z',
      uploadedBy: 'Contract Admin',
      storagePath: 'contract_awards/persisted-award.pdf',
    }
    const detached = detachedAwardDocuments([persisted], [])
    const cleanup = await cleanupContractAwardDocuments(
      detached,
      async () => 'deleted',
    )

    expect(cleanup.deleted).toEqual([persisted])
    const saveCall = contractsPage.indexOf('await updateContract(contract.id, patch)')
    const successCleanup = contractsPage.indexOf('...detachedAwardDocuments(', saveCall)
    expect(saveCall).toBeGreaterThan(-1)
    expect(successCleanup).toBeGreaterThan(saveCall)
  })
})
