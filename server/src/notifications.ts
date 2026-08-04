import type { FastifyInstance } from 'fastify'
import { requireCompleted } from './auth.js'
import { asAuthenticatedUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies } from './types.js'

const MAX_NOTIFICATION_IDS = 500
const MAX_POPUP_CLAIMS = 20

interface NotificationPopupRow {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  related_id: string | null
  target_role: string | null
  target_user_id: string | null
}

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

async function claimNotificationPopups(
  client: Queryable,
  accountId: string,
  claimedAt: Date,
): Promise<NotificationPopupRow[]> {
  const result = await client.query<NotificationPopupRow>(
    `with candidates as materialized (
       select notification.id
         from public.notifications notification
         join public.users profile
           on profile.id = notification.target_user_id
         left join app_auth.notification_popup_deliveries delivery
           on delivery.notification_id = notification.id
          and delivery.account_id = $1::uuid
        where profile.auth_user_id = $1::uuid
          and not exists (
            select 1
              from app_auth.notification_reads receipt
             where receipt.notification_id = notification.id
               and receipt.account_id = $1::uuid
          )
          and (
            delivery.notification_id is null
            or (
              delivery.delivered_at is null
              and delivery.claimed_at <= $2::timestamptz - interval '5 minutes'
            )
          )
          and (
            (notification.type = 'DELETION_REQUEST' and notification.title in (
              'Deletion request approved', 'Deletion request declined'
            ))
            or (notification.type = 'DEADLINE' and notification.title in (
              'Opportunity deadline removed',
              'Opportunity deadline extended',
              'Opportunity deadline updated'
            ))
            or (notification.type = 'NON_SUB_REVIEW' and notification.title in (
              'Non-submission report approved',
              'Non-submission report declined'
            ))
            or (notification.type = 'SYSTEM' and (
              notification.title like '%: monthly goal achieved'
              or notification.title like '%: monthly goal at risk'
            ))
          )
        order by notification.created_at asc, notification.id asc
        limit $3
        for update of notification skip locked
     ), claimed as (
       insert into app_auth.notification_popup_deliveries (
         notification_id, account_id, claimed_at, delivered_at
       )
       select candidate.id, $1::uuid, $2::timestamptz, null
         from candidates candidate
       on conflict (notification_id, account_id) do update
         set claimed_at = excluded.claimed_at
       where app_auth.notification_popup_deliveries.delivered_at is null
         and app_auth.notification_popup_deliveries.claimed_at
             <= excluded.claimed_at - interval '5 minutes'
       returning notification_id
     )
     select notification.id,
            notification.type,
            notification.title,
            notification.message,
            false as read,
            notification.created_at,
            notification.related_id,
            notification.target_role,
            notification.target_user_id
       from claimed
       join public.notifications notification
         on notification.id = claimed.notification_id
      order by notification.created_at asc, notification.id asc`,
    [accountId, claimedAt, MAX_POPUP_CLAIMS],
  )
  return result.rows
}

async function acknowledgeNotificationPopups(
  client: Queryable,
  accountId: string,
  notificationIds: readonly string[],
  deliveredAt: Date,
): Promise<string[]> {
  const result = await client.query<{ notification_id: string }>(
    `update app_auth.notification_popup_deliveries delivery
        set delivered_at = $3::timestamptz
       from unnest($1::text[]) as acknowledged(notification_id)
      where delivery.notification_id = acknowledged.notification_id
        and delivery.account_id = $2::uuid
        and delivery.delivered_at is null
      returning delivery.notification_id`,
    [notificationIds, accountId, deliveredAt],
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

  app.post(
    '/api/v1/notifications/popup-claims',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const accountId = request.auth?.accountId as string
      const notifications = await asAuthenticatedUser(
        dependencies.db,
        accountId,
        (client) => claimNotificationPopups(client, accountId, dependencies.now()),
      )
      return { data: { notifications }, error: null }
    },
  )

  app.post(
    '/api/v1/notifications/popup-ack',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['notificationIds'])
      const notificationIds = parseNotificationIds(body.notificationIds)
      const accountId = request.auth?.accountId as string
      const acknowledgedIds = await asAuthenticatedUser(
        dependencies.db,
        accountId,
        (client) => acknowledgeNotificationPopups(
          client,
          accountId,
          notificationIds,
          dependencies.now(),
        ),
      )
      return { data: { notificationIds: acknowledgedIds }, error: null }
    },
  )
}

export const __test = {
  parseNotificationIds,
  notificationReadIds,
  markNotificationsRead,
  claimNotificationPopups,
  acknowledgeNotificationPopups,
}
