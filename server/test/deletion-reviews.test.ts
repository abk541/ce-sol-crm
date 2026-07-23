import { describe, expect, it } from 'vitest'
import type { Queryable } from '../src/db.js'
import { ApiError } from '../src/errors.js'
import { __test } from '../src/deletion-reviews.js'

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

describe('atomic deletion-request reviews', () => {
  it('validates the request id and decision', () => {
    expect(__test.parseDeletionReview({
      requestId: ' request-1 ',
      decision: 'approved',
    })).toEqual({
      requestId: 'request-1',
      decision: 'APPROVED',
    })
    expect(() => __test.parseDeletionReview({
      requestId: 'request-1',
      decision: 'DELETE',
    })).toThrowError(ApiError)
  })

  it.each([
    ['APPROVED', true, 'approved'],
    ['DECLINED', false, 'declined'],
  ] as const)(
    'updates the request, opportunity, and requester notification together for %s',
    async (decision, expectedDeleted, outcome) => {
      const now = new Date('2026-07-23T08:30:00.000Z')
      const seen: string[] = []
      const client = queryable((text, values) => {
        seen.push(text)
        if (text.includes('private.has_permission')) return [{ allowed: true }]
        if (text.includes('from public.deletion_requests')) {
          expect(values).toEqual(['request-1'])
          return [{
            id: 'request-1',
            opportunity_id: 'opp-1',
            requested_by: 'associate@example.com',
            status: 'PENDING',
          }]
        }
        if (text.includes('from public.users') && text.includes('lower(btrim')) {
          expect(values).toEqual(['associate@example.com'])
          return [{ id: 'requester-1' }]
        }
        if (text.includes('app_auth.request_account_id')) {
          return [{ reviewed_by: 'Capture Manager' }]
        }
        if (text.includes('from public.opportunities')) {
          expect(values).toEqual(['opp-1'])
          return [{ id: 'opp-1', solicitation: 'Airfield Repair' }]
        }
        if (text.includes('update public.deletion_requests')) {
          expect(values).toEqual([
            decision,
            'Capture Manager',
            now.toISOString(),
            'request-1',
          ])
          return [{ id: 'request-1' }]
        }
        if (text.includes('update public.opportunities')) {
          expect(values).toEqual([decision, 'opp-1'])
          expect(text).toContain("case when $1 = 'APPROVED' then true")
          return [{ id: 'opp-1', is_deleted: expectedDeleted }]
        }
        if (text.includes('insert into public.notifications')) {
          expect(values).toEqual([
            'deletion-review-request-1',
            `Deletion request ${outcome}`,
            `Your deletion request for Airfield Repair was ${outcome} by Capture Manager.`,
            now.toISOString(),
            'opp-1',
            'requester-1',
          ])
          return [{ id: 'deletion-review-request-1' }]
        }
        throw new Error(`Unexpected query: ${text}`)
      })

      await expect(__test.reviewDeletionRequest(
        client,
        { requestId: 'request-1', decision },
        now,
      )).resolves.toEqual({
        requestId: 'request-1',
        opportunityId: 'opp-1',
        decision,
        requesterId: 'requester-1',
        reviewedBy: 'Capture Manager',
        reviewedAt: now.toISOString(),
        notificationId: 'deletion-review-request-1',
        notificationTitle: `Deletion request ${outcome}`,
        notificationMessage: `Your deletion request for Airfield Repair was ${outcome} by Capture Manager.`,
      })
      expect(seen.some(text => text.includes('update public.deletion_requests'))).toBe(true)
      expect(seen.some(text => text.includes('update public.opportunities'))).toBe(true)
      expect(seen.some(text => text.includes('insert into public.notifications'))).toBe(true)
    },
  )

  it('rejects an already-reviewed request before any mutation', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return [{ allowed: true }]
      if (text.includes('from public.deletion_requests')) {
        return [{
          id: 'request-1',
          opportunity_id: 'opp-1',
          requested_by: 'requester-1',
          status: 'APPROVED',
        }]
      }
      throw new Error(`Unexpected mutation: ${text}`)
    })

    await expect(__test.reviewDeletionRequest(
      client,
      { requestId: 'request-1', decision: 'APPROVED' },
      new Date(),
    )).rejects.toMatchObject({ statusCode: 409 })
  })
})
