import { describe, expect, it } from 'vitest'
import {
  normalizeContractDeliverables,
  serializeContractDeliverables,
} from '../lib/contractDeliverables'

describe('contract deliverable helpers', () => {
  it('keeps legacy text deliverables readable', () => {
    const deliverables = normalizeContractDeliverables(['Submit closeout package'])

    expect(deliverables).toEqual([
      expect.objectContaining({
        title: 'Submit closeout package',
        issuanceDate: '',
        deadline: '',
        attachments: [],
        createdBy: 'Legacy',
      }),
    ])
  })

  it('round-trips structured deliverables through the text-array database column', () => {
    const serialized = serializeContractDeliverables([{
      id: 'del-1',
      title: 'Monthly report',
      issuanceDate: '2026-05-24',
      deadline: '2026-05-31',
      createdAt: '2026-05-24T10:00:00.000Z',
      createdBy: 'manager',
      attachments: [{
        id: 'att-1',
        name: 'report-template.pdf',
        attachedAt: '2026-05-24T10:15:00.000Z',
        uploadedBy: 'manager',
        dataUrl: 'data:application/pdf;base64,JVBERi0x',
        mimeType: 'application/pdf',
        size: 1024,
      }],
    }])

    expect(serialized).toHaveLength(1)
    expect(normalizeContractDeliverables(serialized)[0]).toEqual({
      id: 'del-1',
      title: 'Monthly report',
      issuanceDate: '2026-05-24',
      deadline: '2026-05-31',
      createdAt: '2026-05-24T10:00:00.000Z',
      createdBy: 'manager',
      attachments: [{
        id: 'att-1',
        name: 'report-template.pdf',
        attachedAt: '2026-05-24T10:15:00.000Z',
        uploadedBy: 'manager',
        dataUrl: 'data:application/pdf;base64,JVBERi0x',
        mimeType: 'application/pdf',
        size: 1024,
      }],
    })
  })
})
