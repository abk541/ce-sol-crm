import type { ActivityLog, BDSubmission, Notification, User, Employee, Contract, Opportunity } from '../types'
import {
  isBDSubmissionAssociatedToUser,
  isContractAssociatedToUser,
  isOpportunityOwnedByUser,
} from './team'

const COMPANY_ACTIVITY_ROLES = new Set<User['role']>([
  'CAPTURE_MANAGER',
  'BD_MANAGER',
  'OPS_MANAGER',
])

export interface ActivityHistoryItem {
  id: string
  action: string
  user: string
  createdAt: string
  source: 'activity' | 'notification'
  entityType?: ActivityLog['entityType']
  entityId?: string
  entityName?: string
}

export function canViewCompanyActivity(user?: User | null): boolean {
  return Boolean(user && COMPANY_ACTIVITY_ROLES.has(user.role))
}

export function buildActivityHistory(
  activityLogs: ActivityLog[],
  _notifications: Notification[] = [],
): ActivityHistoryItem[] {
  return activityLogs.map<ActivityHistoryItem>(log => ({
    id: `activity:${log.id}`,
    action: log.action,
    user: log.user,
    createdAt: log.createdAt,
    source: 'activity',
    entityType: log.entityType,
    entityId: log.entityId,
    entityName: log.entityName,
  })).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

/**
 * Applies the activity dashboard's user selection with an exact name match.
 * An empty selection and the explicit ALL sentinel both preserve the full log.
 */
export function filterActivityHistoryByUser(
  history: ActivityHistoryItem[],
  selectedUser?: string | null,
): ActivityHistoryItem[] {
  if (!selectedUser || selectedUser === 'ALL') return history
  return history.filter(item => item.user === selectedUser)
}

export interface ActivityHistoryPage {
  items: ActivityHistoryItem[]
  page: number
  pageCount: number
  total: number
}

export function activityHistoryPage(
  history: ActivityHistoryItem[],
  selectedUser: string | null | undefined,
  requestedPage: number,
  pageSize: number,
): ActivityHistoryPage {
  const filtered = filterActivityHistoryByUser(history, selectedUser)
  const safePageSize = Math.max(1, pageSize)
  const pageCount = Math.max(1, Math.ceil(filtered.length / safePageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const start = (page - 1) * safePageSize

  return {
    items: filtered.slice(start, start + safePageSize),
    page,
    pageCount,
    total: filtered.length,
  }
}

export interface NotificationVisibilityContext {
  user?: User | null
  employees: Employee[]
  contracts: Contract[]
  opportunities?: Opportunity[]
  bdSubmissions?: BDSubmission[]
}

/**
 * Single source of truth for "should this user see this notification".
 * Used by the header bell (TopBar), the Notifications page, and the sidebar
 * unread badge so all three always agree.
 *
 * Rules, in order:
 * 0. Capture, BD, and Operations Managers see everything (company oversight).
 * 1. targetUserId set  → only that exact user sees it (personal notifications).
 * 2. targetRole set (not 'ALL') → only that role sees it.
 * 3. Notification relates to a contract → only users associated with that
 *    contract (assignee, their supervisors, or Capture/BD/Ops Managers) see it,
 *    so each user only gets actions on contracts associated with them.
 * 4. Otherwise it is a general / capture-manager broadcast → everyone sees it.
 */
export function isNotificationVisibleTo(
  n: Notification,
  ctx: NotificationVisibilityContext,
): boolean {
  const { user, employees, contracts, opportunities = [], bdSubmissions = [] } = ctx

  if (!user) return false

  // Deadline edits are operationally private: only the assigned associate
  // should receive the bell item and live popup. Keep manager oversight intact
  // for all other direct notifications to avoid regressing company activity.
  if (n.type === 'DEADLINE' && n.targetUserId) return n.targetUserId === user.id

  // Managers oversee company activity and must see every action, including
  // role- or user-targeted notifications. Team Leads and Associates remain
  // scoped to work that concerns them.
  if (canViewCompanyActivity(user)) return true

  if (n.targetUserId) return n.targetUserId === user.id
  if (n.targetRole && n.targetRole !== 'ALL') return n.targetRole === user.role

  const contract = n.relatedId ? contracts.find(c => c.id === n.relatedId) : undefined
  if (contract) return isContractAssociatedToUser(employees, user, contract)

  const opportunity = n.relatedId
    ? opportunities.find(o => o.id === n.relatedId || o.solicitationId === n.relatedId)
    : undefined
  if (opportunity) return isOpportunityOwnedByUser(employees, user, opportunity.assignedTo)

  const trackerRow = n.relatedId
    ? bdSubmissions.find(row => String(row.id) === n.relatedId || row.solicitationId === n.relatedId)
    : undefined
  if (trackerRow) return isBDSubmissionAssociatedToUser(employees, user, trackerRow, opportunities)

  return n.targetRole === 'ALL'
}

/**
 * Merges shared rows with private read receipts and optimistic local state.
 * Locally-created alerts remain until their database upsert becomes visible.
 */
export function mergeNotificationSnapshot(
  remote: Notification[],
  local: Notification[],
  receiptIds: Iterable<string> = [],
): Notification[] {
  const readIds = new Set(receiptIds)
  local.forEach(notification => {
    if (notification.read) readIds.add(notification.id)
  })
  const remoteIds = new Set(remote.map(notification => notification.id))
  const localOnly = local.filter(notification => !remoteIds.has(notification.id))
  return [
    ...remote.map(notification => ({
      ...notification,
      // The migration converts every legacy shared read into per-account
      // receipts and clears the shared flag. From then on, only a private
      // receipt or an optimistic local read is authoritative.
      read: readIds.has(notification.id),
    })),
    ...localOnly,
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export interface NotificationArrivalSnapshot {
  seen: Set<string> | null
  fresh: Notification[]
}

/**
 * Treats the first successful DB snapshot as history, then returns each later
 * unread id once. An early empty render can no longer replay all old rows.
 */
export function reconcileNotificationArrivals(
  notifications: Notification[],
  ready: boolean,
  seen: Set<string> | null,
): NotificationArrivalSnapshot {
  if (!ready) return { seen, fresh: [] }
  if (seen === null) {
    return { seen: new Set(notifications.map(notification => notification.id)), fresh: [] }
  }

  const nextSeen = new Set(seen)
  const fresh: Notification[] = []
  notifications.forEach(notification => {
    if (nextSeen.has(notification.id)) return
    nextSeen.add(notification.id)
    if (!notification.read) fresh.push(notification)
  })
  return { seen: nextSeen, fresh }
}

export interface NotificationRouteContext {
  contracts: Contract[]
  opportunities: Opportunity[]
  bdSubmissions?: BDSubmission[]
}

/** Returns the exact record route used by both notification surfaces. */
export function notificationRecordRoute(
  notification: Notification,
  { contracts, opportunities, bdSubmissions = [] }: NotificationRouteContext,
): string | null {
  if (!notification.relatedId) return null
  const relatedId = notification.relatedId
  const contract = contracts.find(item => item.id === relatedId || item.contractId === relatedId)
  if (contract) return `/contracts?record=${encodeURIComponent(contract.id)}`

  const opportunity = opportunities.find(item => item.id === relatedId || item.solicitationId === relatedId)
  if (opportunity) return `/pipeline?record=${encodeURIComponent(opportunity.id)}`

  const trackerRow = bdSubmissions.find(item => String(item.id) === relatedId || item.solicitationId === relatedId)
  if (trackerRow) {
    return `/bd-tracker?record=${encodeURIComponent(String(trackerRow.id))}&tab=${encodeURIComponent(trackerRow.status)}`
  }

  return null
}
