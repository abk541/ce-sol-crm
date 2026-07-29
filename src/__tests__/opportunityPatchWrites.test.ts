import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity } from '../types'

const state = vi.hoisted(() => ({
  updates: [] as Array<{
    table: string
    values: Record<string, unknown>
    options?: Record<string, unknown>
  }>,
  responseData: undefined as Record<string, unknown>[] | null | undefined,
}))

vi.mock('../lib/api', () => ({
  isApiConnected: true,
  subscribeToApiEvents: vi.fn(() => () => undefined),
  api: {
    from: vi.fn((table: string) => {
      const call: {
        table: string
        values: Record<string, unknown>
        options?: Record<string, unknown>
      } = { table, values: {} }
      const builder = {
        upsert: vi.fn((
          values: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) => {
          call.values = values
          call.options = options
          state.updates.push(call)
          return builder
        }),
        select: vi.fn(async () => ({
          data: state.responseData === undefined
            ? [{ id: call.values.id }]
            : state.responseData,
          error: null,
        })),
      }
      return builder
    }),
  },
}))

import {
  appendNonSubReportCommentRecord,
  updateNonSubReportReasonRecord,
  updateNonSubReportReminderRecord,
  updateOpportunityRecord,
} from '../lib/db'

describe('narrow opportunity updates', () => {
  beforeEach(() => {
    state.updates = []
    state.responseData = undefined
  })

  it('does not send stale workflow fields while saving a deadline extension', async () => {
    const opportunity = {
      id: 'opp-extension',
      solicitation: 'Extended solicitation',
      solicitationId: 'SOL-EXTENDED',
      client: 'Agency',
      type: 'OTJ',
      naicsCode: '238220',
      setAside: 'SB',
      priority: 'MEDIUM',
      status: 'ACTIVE',
      dueDate: '2026-07-30',
      localTime: '13:00',
      timezone: 'America/New_York',
      location: 'Dover, DE',
      pop: '',
      bdm: 'Manager',
      bds: 'Lead',
      comments: [],
      period: 'JUL 2026',
      capturedOn: '2026-07-06',
      nonSubmissionReportId: undefined,
      nonSubmissionExempt: false,
      notifiedDue24h: false,
      notifiedDue4h: false,
    } satisfies Opportunity

    await expect(updateOpportunityRecord(opportunity, [
      'dueDate',
      'nonSubmissionExempt',
      'notifiedDue24h',
      'notifiedDue4h',
    ])).resolves.toBe(true)

    expect(state.updates).toEqual([{
      table: 'opportunities',
      values: {
        id: 'opp-extension',
        due_date: '2026-07-30',
        non_submission_exempt: false,
        notified_due_24h: false,
        notified_due_4h: false,
      },
      options: {
        onConflict: 'id',
        patchExisting: true,
      },
    }])
    expect(state.updates[0]?.values).not.toHaveProperty('non_submission_report_id')
    expect(state.updates[0]?.values).not.toHaveProperty('local_time')
    expect(state.updates[0]?.values).not.toHaveProperty('status')
  })

  it('accepts an error-free protected save when the optional selected row body is absent', async () => {
    state.responseData = null
    const opportunity = {
      id: 'opp-confirmed-without-selection',
      solicitation: 'Updated title',
      solicitationId: 'SOL-200',
      client: 'Agency',
      type: 'OTJ',
      naicsCode: '238220',
      setAside: 'SB',
      priority: 'MEDIUM',
      status: 'ACTIVE',
      dueDate: '2026-08-01',
      localTime: '13:00',
      timezone: 'America/New_York',
      location: 'Dover, DE',
      pop: '',
      bdm: 'Manager',
      bds: 'Lead',
      comments: [],
      period: 'AUG 2026',
      capturedOn: '2026-07-29',
    } satisfies Opportunity

    await expect(
      updateOpportunityRecord(opportunity, ['solicitation']),
    ).resolves.toBe(true)

    expect(state.updates).toEqual([{
      table: 'opportunities',
      values: {
        id: 'opp-confirmed-without-selection',
        solicitation: 'Updated title',
      },
      options: {
        onConflict: 'id',
        patchExisting: true,
      },
    }])
  })

  it('sends separate narrow reason, reminder, and comment report patches', async () => {
    const editedAt = '2026-07-28T16:00:00.000Z'
    const reminderAt = '2026-07-28T17:00:00.000Z'
    const comment = {
      id: 'comment-1',
      text: 'Preserve concurrent comments.',
      author: 'Reviewer',
      authorId: 'user-1',
      createdAt: '2026-07-28T17:01:00.000Z',
    }

    await expect(
      updateNonSubReportReasonRecord('report-1', 'Clarified reason', editedAt),
    ).resolves.toBe(true)
    await expect(
      updateNonSubReportReminderRecord('report-1', reminderAt),
    ).resolves.toBe(true)
    await expect(
      appendNonSubReportCommentRecord('report-1', comment),
    ).resolves.toBe(true)

    expect(state.updates).toEqual([
      {
        table: 'non_submission_reports',
        values: {
          id: 'report-1',
          reason: 'Clarified reason',
          reason_edited_at: editedAt,
        },
        options: { onConflict: 'id' },
      },
      {
        table: 'non_submission_reports',
        values: {
          id: 'report-1',
          last_reminder_at: reminderAt,
        },
        options: { onConflict: 'id' },
      },
      {
        table: 'non_submission_reports',
        values: {
          id: 'report-1',
          comments: [comment],
        },
        options: { onConflict: 'id' },
      },
    ])
  })
})
