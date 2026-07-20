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
  })).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
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

  // Managers oversee company activity and must see every action, including
  // role- or user-targeted notifications. Team Leads and Associates remain
  // scoped to work that concerns them.
  if (canViewCompanyActivity(user)) return true
  if (!user) return false

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
