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

describe('per-account notification popup claims', () => {
  it('claims only unread personal rows for the authenticated account', async () => {
    const accountId = '33333333-3333-4333-8333-333333333333'
    const now = new Date('2026-07-31T18:00:00.000Z')
    const row = {
      id: 'deletion-review-request-1',
      type: 'DELETION_REQUEST',
      title: 'Deletion request approved',
      message: 'Your deletion request was approved.',
      read: false,
      created_at: '2026-07-31T17:59:00.000Z',
      related_id: 'opportunity-1',
      target_role: null,
      target_user_id: 'user-associate',
    }
    const client = queryable((text, values) => {
      expect(text).toContain('profile.id = notification.target_user_id')
      expect(text).toContain('profile.auth_user_id = $1::uuid')
      expect(text).toContain('app_auth.notification_reads')
      expect(text).toContain('app_auth.notification_popup_deliveries')
      expect(text).toContain("delivery.claimed_at <= $2::timestamptz - interval '5 minutes'")
      expect(text).toContain("notification.type = 'DELETION_REQUEST'")
      expect(text).toContain("notification.type = 'DEADLINE'")
      expect(text).toContain("notification.type = 'SYSTEM'")
      expect(text).toContain('for update of notification skip locked')
      expect(text).toContain('on conflict (notification_id, account_id) do update')
      expect(values).toEqual([accountId, now, 20])
      return [row]
    })

    await expect(__test.claimNotificationPopups(client, accountId, now)).resolves.toEqual([row])
  })

  it('acknowledges only leases owned by the authenticated account', async () => {
    const accountId = '44444444-4444-4444-8444-444444444444'
    const now = new Date('2026-07-31T18:01:00.000Z')
    const client = queryable((text, values) => {
      expect(text).toContain('update app_auth.notification_popup_deliveries delivery')
      expect(text).toContain('delivery.account_id = $2::uuid')
      expect(text).toContain('delivery.delivered_at is null')
      expect(values).toEqual([['personal-1', 'not-owned'], accountId, now])
      return [{ notification_id: 'personal-1' }]
    })

    await expect(
      __test.acknowledgeNotificationPopups(client, accountId, ['personal-1', 'not-owned'], now),
    ).resolves.toEqual(['personal-1'])
  })
})
