import { describe, expect, it } from 'vitest'
import type { Queryable } from '../src/db.js'
import { __test } from '../src/opportunity-notifications.js'

function queryable(
  handler: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[],
): Queryable {
  return {
    async query(text, values) {
      const rows = handler(text, values)
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
      }
    },
  } as Queryable
}

describe('opportunity deadline notifications', () => {
  it('notifies every active Capture Manager when an Associate changes a deadline', async () => {
    const statements: string[] = []
    let notificationValues: readonly unknown[] | undefined
    const client = queryable((text, values) => {
      statements.push(text)
      if (text.includes('profile.auth_user_id = app_auth.request_account_id()')) {
        return [{ id: 'associate-user', name: 'Amina Associate', role: 'ASSOCIATE' }]
      }
      if (text.includes("profile.role = 'CAPTURE_MANAGER'")) {
        expect(values).toEqual(['associate-user'])
        return [{ id: 'capture-1' }, { id: 'capture-2' }]
      }
      if (text.startsWith('insert into public.notifications')) {
        notificationValues = values
        return [{ id: 'notification-1' }, { id: 'notification-2' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.persistOpportunityDeadlineNotifications(client, {
      id: 'opp-1',
      solicitation: 'Facilities Support',
      assigned_to: 'employee-associate',
      due_date: '2026-08-10',
      local_time: '13:00',
      timezone: 'UTC',
    }, {
      due_date: '2026-08-12',
    })).resolves.toBe(2)

    expect(notificationValues?.[1]).toBe('DEADLINE')
    expect(notificationValues?.[2]).toBe('Opportunity deadline extended')
    expect(notificationValues?.[3]).toContain('Amina Associate changed the deadline for Facilities Support')
    expect(notificationValues?.[5]).toBe('opp-1')
    expect(notificationValues?.[6]).toEqual(['capture-1', 'capture-2'])
    expect(statements.filter(text => text.startsWith('insert into public.notifications'))).toHaveLength(1)
  })

  it('notifies only the assigned Associate when a manager changes a deadline', async () => {
    let notificationValues: readonly unknown[] | undefined
    const client = queryable((text, values) => {
      if (text.includes('profile.auth_user_id = app_auth.request_account_id()')) {
        return [{ id: 'capture-1', name: 'Capture Manager', role: 'CAPTURE_MANAGER' }]
      }
      if (text.includes('left join public.employees assigned')) {
        expect(values).toEqual(['employee-associate'])
        return [{
          id: 'associate-user',
          username: 'amina',
          name: 'Amina Associate',
          email: 'amina@example.test',
          assigned_id: 'employee-associate',
          assigned_name: 'Amina Associate',
          assigned_email: 'amina@example.test',
          assigned_role: 'ASSOCIATE',
        }]
      }
      if (text.startsWith('insert into public.notifications')) {
        notificationValues = values
        return [{ id: 'notification-1' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.persistOpportunityDeadlineNotifications(client, {
      id: 'opp-1',
      solicitation: 'Facilities Support',
      assigned_to: 'employee-associate',
      due_date: '2026-08-10',
      local_time: '13:00',
      timezone: 'UTC',
    }, {
      due_date: '2026-08-11',
    })).resolves.toBe(1)

    expect(notificationValues?.[6]).toEqual(['associate-user'])
    expect(notificationValues?.[3]).toBe('Facilities Support now has a deadline of 2026-08-11 13:00 UTC.')
  })

  it('does not notify when deadline formatting changes but the effective instant does not', async () => {
    const client = queryable((text) => {
      throw new Error(`No database query expected: ${text}`)
    })
    await expect(__test.persistOpportunityDeadlineNotifications(client, {
      id: 'opp-1',
      due_date: '2026-08-10',
      local_time: '13:00',
      timezone: 'UTC',
    }, {
      local_time: '1:00 PM',
    })).resolves.toBe(0)
  })
})

describe('non-submission review notifications', () => {
  it.each([
    ['APPROVED', 'approved'],
    ['DECLINED', 'declined'],
  ] as const)('persists a personal %s decision for the report owner', async (decision, outcome) => {
    const reviewedAt = new Date('2026-08-04T10:00:00.000Z')
    let notificationValues: readonly unknown[] | undefined
    const client = queryable((text, values) => {
      if (text.includes('profile.auth_user_id = app_auth.request_account_id()')) {
        return [{ id: 'capture-1', name: 'Mehdi Manager', role: 'CAPTURE_MANAGER' }]
      }
      if (text.includes('left join public.employees assigned')) {
        expect(values).toEqual(['employee-associate'])
        return [{
          id: 'associate-user',
          username: 'amina',
          name: 'Amina Associate',
          email: 'amina@example.test',
          assigned_id: 'employee-associate',
          assigned_name: 'Amina Associate',
          assigned_email: 'amina@example.test',
          assigned_role: 'ASSOCIATE',
        }]
      }
      if (text.startsWith('insert into public.notifications')) {
        notificationValues = values
        return [{ id: `review-${outcome}` }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.persistNonSubmissionReviewNotification(client, {
      reportId: 'report-1',
      opportunity: {
        id: 'opp-1',
        solicitation: 'Facilities Support',
        assigned_to: 'employee-associate',
      },
      agentUsername: 'Amina',
      decision,
      reviewedAt,
    })).resolves.toBe(1)

    expect(notificationValues).toEqual([
      'non-sub-review-report-1',
      'NON_SUB_REVIEW',
      `Non-submission report ${outcome}`,
      `Your non-submission report for Facilities Support was ${outcome} by Mehdi Manager.`,
      reviewedAt.toISOString(),
      'opp-1',
      ['associate-user'],
    ])
  })

  it('notifies the original reporter after the opportunity is reassigned', async () => {
    const reviewedAt = new Date('2026-08-04T11:00:00.000Z')
    let notificationValues: readonly unknown[] | undefined
    const candidates = [
      {
        id: 'original-associate-user',
        username: 'amina',
        name: 'Amina Original',
        email: 'amina@example.test',
        assigned_id: 'employee-current',
        assigned_name: 'Salma Current',
        assigned_email: 'salma@example.test',
        assigned_role: 'ASSOCIATE',
      },
      {
        id: 'current-associate-user',
        username: 'salma',
        name: 'Salma Current',
        email: 'salma@example.test',
        assigned_id: 'employee-current',
        assigned_name: 'Salma Current',
        assigned_email: 'salma@example.test',
        assigned_role: 'ASSOCIATE',
      },
    ]
    const client = queryable((text, values) => {
      if (text.includes('profile.auth_user_id = app_auth.request_account_id()')) {
        return [{ id: 'capture-1', name: 'Mehdi Manager', role: 'CAPTURE_MANAGER' }]
      }
      if (text.includes('left join public.employees assigned')) {
        expect(values).toEqual(['employee-current'])
        return candidates
      }
      if (text.startsWith('insert into public.notifications')) {
        notificationValues = values
        return [{ id: 'review-original-agent' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.persistNonSubmissionReviewNotification(client, {
      reportId: 'report-before-reassignment',
      opportunity: {
        id: 'opp-1',
        solicitation: 'Facilities Support',
        assigned_to: 'employee-current',
      },
      agentUsername: 'amina',
      decision: 'APPROVED',
      reviewedAt,
    })).resolves.toBe(1)

    expect(notificationValues?.[6]).toEqual(['original-associate-user'])
    expect(__test.resolveAssignedAssociateTarget(candidates, 'amina', 'assignment-first')?.id)
      .toBe('current-associate-user')
    expect(__test.resolveAssignedAssociateTarget(candidates, 'amina', 'agent-first')?.id)
      .toBe('original-associate-user')
  })

  it('fails closed when a legacy employee name matches multiple active Associates', () => {
    const duplicateNameCandidates = [
      {
        id: 'associate-1',
        username: 'associate-one',
        name: 'Shared Name',
        email: 'one@example.test',
        assigned_id: 'legacy-employee',
        assigned_name: 'Shared Name',
        assigned_email: '',
        assigned_role: 'ASSOCIATE',
      },
      {
        id: 'associate-2',
        username: 'associate-two',
        name: 'Shared Name',
        email: 'two@example.test',
        assigned_id: 'legacy-employee',
        assigned_name: 'Shared Name',
        assigned_email: '',
        assigned_role: 'ASSOCIATE',
      },
    ]

    expect(__test.resolveAssignedAssociateTarget(duplicateNameCandidates, '')).toBeNull()
  })
})
