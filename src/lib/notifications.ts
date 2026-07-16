import type { Notification, User, Employee, Contract, Opportunity } from '../types'
import { isContractAssociatedToUser, isOpportunityOwnedByUser } from './team'

export interface NotificationVisibilityContext {
  user?: User | null
  employees: Employee[]
  contracts: Contract[]
  opportunities?: Opportunity[]
}

/**
 * Single source of truth for "should this user see this notification".
 * Used by the header bell (TopBar), the Notifications page, and the sidebar
 * unread badge so all three always agree.
 *
 * Rules, in order:
 * 0. Capture Manager sees everything (oversees all actions).
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
  const { user, employees, contracts, opportunities = [] } = ctx

  // Capture Manager oversees everything and must see every action taken by
  // associates and team leads, even role- or user-targeted notifications.
  if (user?.role === 'CAPTURE_MANAGER') return true

  if (n.targetUserId) return n.targetUserId === user?.id
  if (n.targetRole && n.targetRole !== 'ALL' && n.targetRole !== user?.role) return false

  const contract = n.relatedId ? contracts.find(c => c.id === n.relatedId) : undefined
  if (contract) return isContractAssociatedToUser(employees, user, contract)

  const opportunity = n.relatedId
    ? opportunities.find(o => o.id === n.relatedId || o.solicitationId === n.relatedId)
    : undefined
  if (opportunity) return isOpportunityOwnedByUser(employees, user, opportunity.assignedTo)

  return true
}
