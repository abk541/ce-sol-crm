import { describe, expect, it } from 'vitest'
import type { Contract, Employee, Notification, Opportunity, User } from '../types'
import { isNotificationVisibleTo } from '../lib/notifications'
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

  it('keeps explicitly targeted notifications personal for non-capture users', () => {
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
