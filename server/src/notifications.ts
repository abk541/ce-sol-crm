import type { FastifyInstance } from 'fastify'
import { requireCompleted } from './auth.js'
import { asAuthenticatedUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies } from './types.js'

const MAX_NOTIFICATION_IDS = 500

function parseNotificationIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_NOTIFICATION_IDS) {
    throw new ApiError(
      400,
      'invalid_request',
      `notificationIds must contain between 1 and ${MAX_NOTIFICATION_IDS} ids.`,
    )
  }

  return [...new Set(value.map((id, index) =>
    requiredString(id, `notificationIds[${index}]`, 256),
  ))]
}

async function notificationReadIds(client: Queryable, accountId: string): Promise<string[]> {
  const result = await client.query<{ notification_id: string }>(
    `select receipt.notification_id
       from app_auth.notification_reads receipt
       join public.notifications notification on notification.id = receipt.notification_id
      where receipt.account_id = $1
      order by receipt.read_at desc
      limit 5000`,
    [accountId],
  )
  return result.rows.map((row) => row.notification_id)
}

async function markNotificationsRead(
  client: Queryable,
  accountId: string,
  notificationIds: readonly string[],
  readAt: Date,
): Promise<string[]> {
  const result = await client.query<{ notification_id: string }>(
    `insert into app_auth.notification_reads (notification_id, account_id, read_at)
     select notification.id, $2::uuid, $3::timestamptz
       from unnest($1::text[]) as requested(notification_id)
       join public.notifications notification on notification.id = requested.notification_id
     on conflict (notification_id, account_id)
     do update set read_at = greatest(app_auth.notification_reads.read_at, excluded.read_at)
     returning notification_id`,
    [notificationIds, accountId, readAt],
  )
  return result.rows.map((row) => row.notification_id)
}

export function registerNotificationRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.get(
    '/api/v1/notifications/read-state',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const accountId = request.auth?.accountId as string
      const notificationIds = await asAuthenticatedUser(
        dependencies.db,
        accountId,
        (client) => notificationReadIds(client, accountId),
      )
      return { data: { notificationIds }, error: null }
    },
  )

  app.post(
    '/api/v1/notifications/read',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['notificationIds'])
      const notificationIds = parseNotificationIds(body.notificationIds)
      const accountId = request.auth?.accountId as string
      const markedIds = await asAuthenticatedUser(
        dependencies.db,
        accountId,
        (client) => markNotificationsRead(client, accountId, notificationIds, dependencies.now()),
      )
      return { data: { notificationIds: markedIds }, error: null }
    },
  )
}

export const __test = {
  parseNotificationIds,
  notificationReadIds,
  markNotificationsRead,
}
