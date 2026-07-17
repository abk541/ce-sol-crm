import { describe, expect, it } from 'vitest'
import type { ActivityLog, BDSubmission, Contract, Employee, Notification, Opportunity, User } from '../types'
import {
  buildActivityHistory,
  canViewCompanyActivity,
  isNotificationVisibleTo,
  notificationRecordRoute,
} from '../lib/notifications'
import { findUserForEmployee } from '../lib/team'

function user(overrides: Partial<User>): User {
  return {
    id: 'user-default',
    name: 'User Default',
    email: 'default@example.com',
    username: 'default',
    role: 'ASSOCIATE',
    avatar: 'UD',
    status: 'active',
    firstLogin: false,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: 'notif-1',
    type: 'ASSIGNMENT',
    title: 'Assignment updated',
    message: 'A work item changed.',
    read: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const employees: Employee[] = [
  {
    id: 'emp-manager',
    name: 'Manager Example',
    email: 'manager@example.com',
    role: 'BD_MANAGER',
    managerId: null,
    avatar: 'ME',
    team: 'BD',
  },
  {
    id: 'emp-lead',
    name: 'Lead Example',
    email: 'lead@example.com',
    role: 'TEAM_LEAD',
    managerId: 'emp-manager',
    avatar: 'LE',
    team: 'BD',
  },
  {
    id: 'emp-associate',
    name: 'Associate Example',
    email: 'associate@example.com',
    role: 'ASSOCIATE',
    managerId: 'emp-lead',
    avatar: 'AE',
    team: 'BD',
  },
  {
    id: 'emp-other',
    name: 'Other Example',
    email: 'other@example.com',
    role: 'ASSOCIATE',
    managerId: 'emp-lead',
    avatar: 'OE',
    team: 'BD',
  },
]

const captureManager = user({
  id: 'user-capture',
  name: 'Capture Manager',
  email: 'capture@example.com',
  username: 'capture',
  role: 'CAPTURE_MANAGER',
})

const bdManager = user({
  id: 'user-bd-manager',
  name: 'BD Manager',
  email: 'bd.manager@example.com',
  username: 'bd-manager',
  role: 'BD_MANAGER',
})

const opsManager = user({
  id: 'user-ops-manager',
  name: 'Operations Manager',
  email: 'ops.manager@example.com',
  username: 'ops-manager',
  role: 'OPS_MANAGER',
  team: 'OPS',
})

const assignedAssociate = user({
  id: 'user-associate',
  name: 'Associate Example',
  email: 'associate@example.com',
  username: 'associate',
  role: 'ASSOCIATE',
})

const otherAssociate = user({
  id: 'user-other',
  name: 'Other Example',
  email: 'other@example.com',
  username: 'other',
  role: 'ASSOCIATE',
})

const teamLead = user({
  id: 'user-lead',
  name: 'Lead Example',
  email: 'lead@example.com',
  username: 'lead',
  role: 'TEAM_LEAD',
})

const opportunity = {
  id: 'opp-1',
  solicitationId: 'SOL-1',
  assignedTo: 'emp-associate',
} as Opportunity

const contract = {
  id: 'contract-1',
  assignedTo: 'emp-associate',
} as Contract

describe('notification visibility', () => {
  it('lets the Capture Manager see a notification targeted to an associate', () => {
    const item = notification({ targetUserId: 'user-associate' })

    expect(isNotificationVisibleTo(item, {
      user: captureManager,
      employees,
      contracts: [],
      opportunities: [],
    })).toBe(true)
  })

  it.each([captureManager, bdManager, opsManager])(
    'lets company managers see notifications targeted to another user ($role)',
    manager => {
      const item = notification({ targetUserId: 'user-associate' })

      expect(isNotificationVisibleTo(item, {
        user: manager,
        employees,
        contracts: [],
        opportunities: [],
      })).toBe(true)
      expect(canViewCompanyActivity(manager)).toBe(true)
    },
  )

  it('keeps explicitly targeted notifications personal for non-management users', () => {
    const item = notification({ targetUserId: 'user-associate' })

    expect(isNotificationVisibleTo(item, {
      user: assignedAssociate,
      employees,
      contracts: [],
      opportunities: [],
    })).toBe(true)

    expect(isNotificationVisibleTo(item, {
      user: otherAssociate,
      employees,
      contracts: [],
      opportunities: [],
    })).toBe(false)
  })

  it('shows opportunity notifications to the assigned associate and their team lead', () => {
    const item = notification({ relatedId: 'opp-1' })
    const context = { employees, contracts: [], opportunities: [opportunity] }

    expect(isNotificationVisibleTo(item, { ...context, user: assignedAssociate })).toBe(true)
    expect(isNotificationVisibleTo(item, { ...context, user: teamLead })).toBe(true)
    expect(isNotificationVisibleTo(item, { ...context, user: otherAssociate })).toBe(false)
  })

  it('shows contract notifications to users associated with the contract', () => {
    const item = notification({ relatedId: 'contract-1' })
    const context = { employees, contracts: [contract], opportunities: [] }

    expect(isNotificationVisibleTo(item, { ...context, user: assignedAssociate })).toBe(true)
    expect(isNotificationVisibleTo(item, { ...context, user: teamLead })).toBe(true)
    expect(isNotificationVisibleTo(item, { ...context, user: otherAssociate })).toBe(false)
  })

  it('hides unscoped legacy notifications from associates', () => {
    const item = notification({ relatedId: undefined, targetRole: undefined, targetUserId: undefined })

    expect(isNotificationVisibleTo(item, {
      user: assignedAssociate,
      employees,
      contracts: [],
      opportunities: [],
    })).toBe(false)
  })

  it('keeps a canceled tracker notification visible to its associate after the opportunity is removed', () => {
    const canceled = {
      id: 42,
      solicitationId: 'SOL-CANCELED',
      solicitation: 'Canceled opportunity',
      status: 'CANCELED',
      bdm: 'Manager Example',
      bds: 'Lead Example',
      supportAgent: 'Associate Example',
    } as BDSubmission
    const item = notification({ relatedId: 'SOL-CANCELED' })
    const context = { employees, contracts: [], opportunities: [], bdSubmissions: [canceled] }

    expect(isNotificationVisibleTo(item, { ...context, user: assignedAssociate })).toBe(true)
    expect(isNotificationVisibleTo(item, { ...context, user: otherAssociate })).toBe(false)
  })
})

describe('company history', () => {
  it('contains actual activities without mixing in notification events', () => {
    const logs: ActivityLog[] = [{
      id: 'activity-1',
      action: 'Updated a work item',
      user: 'Team Member',
      userRole: 'ASSOCIATE',
      entityType: 'opportunity',
      createdAt: '2026-01-01T10:00:00.000Z',
    }]
    const alerts = [
      notification({ id: 'notif-older', title: 'Older alert', createdAt: '2026-01-01T09:00:00.000Z' }),
      notification({ id: 'notif-newer', title: 'Newer alert', createdAt: '2026-01-01T11:00:00.000Z' }),
    ]

    const history = buildActivityHistory(logs, alerts)

    expect(history).toHaveLength(1)
    expect(history.map(item => item.id)).toEqual(['activity:activity-1'])
    expect(history.every(item => item.source === 'activity')).toBe(true)
  })
})

describe('notification record navigation', () => {
  it('links directly to the related opportunity', () => {
    expect(notificationRecordRoute(notification({ relatedId: opportunity.id }), {
      contracts: [],
      opportunities: [opportunity],
    })).toBe('/pipeline?record=opp-1')
  })

  it('links directly to a tracker row when the source opportunity no longer exists', () => {
    const canceled = {
      id: 42,
      solicitationId: 'SOL-CANCELED',
      status: 'CANCELED',
    } as BDSubmission

    expect(notificationRecordRoute(notification({ relatedId: 'SOL-CANCELED' }), {
      contracts: [],
      opportunities: [],
      bdSubmissions: [canceled],
    })).toBe('/bd-tracker?record=42&tab=CANCELED')
  })
})

describe('employee-to-user notification targeting', () => {
  it('uses exact user id before legacy email/name matches', () => {
    const exactEmployee = employees[2]
    const users: User[] = [
      user({
        id: 'legacy-match',
        name: exactEmployee.name,
        email: exactEmployee.email,
        username: 'legacy',
        role: 'ASSOCIATE',
      }),
      user({
        id: exactEmployee.id,
        name: 'Renamed Login',
        email: 'renamed@example.com',
        username: 'renamed',
        role: 'ASSOCIATE',
      }),
    ]

    expect(findUserForEmployee(users, exactEmployee)?.id).toBe(exactEmployee.id)
  })
})
