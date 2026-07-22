import { describe, expect, it } from 'vitest'
import type { Queryable } from '../src/db.js'
import { ApiError } from '../src/errors.js'
import { __test } from '../src/notifications.js'

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

describe('per-account notification read receipts', () => {
  it('validates, trims, and deduplicates notification ids', () => {
    expect(__test.parseNotificationIds([' n-1 ', 'n-1', 'n-2'])).toEqual(['n-1', 'n-2'])
    expect(() => __test.parseNotificationIds([])).toThrowError(ApiError)
    expect(() => __test.parseNotificationIds([''])).toThrowError(ApiError)
  })

  it('reads receipts for only the authenticated account', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111'
    const client = queryable((text, values) => {
      expect(text).toContain('where receipt.account_id = $1')
      expect(values).toEqual([accountId])
      return [{ notification_id: 'n-2' }, { notification_id: 'n-1' }]
    })

    await expect(__test.notificationReadIds(client, accountId)).resolves.toEqual(['n-2', 'n-1'])
  })

  it('binds writes to the authenticated account and ignores stale notification ids', async () => {
    const accountId = '22222222-2222-4222-8222-222222222222'
    const now = new Date('2026-07-22T12:00:00.000Z')
    const client = queryable((text, values) => {
      expect(text).toContain('join public.notifications notification')
      expect(text).toContain('on conflict (notification_id, account_id)')
      expect(values).toEqual([['n-live', 'n-stale'], accountId, now])
      return [{ notification_id: 'n-live' }]
    })

    await expect(
      __test.markNotificationsRead(client, accountId, ['n-live', 'n-stale'], now),
    ).resolves.toEqual(['n-live'])
  })
})
