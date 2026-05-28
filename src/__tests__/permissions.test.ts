import { describe, expect, it } from 'vitest'
import { MOCK_USERS } from '../data/mock'
import { hasPermission } from '../lib/permissions'
import type { Role, User } from '../types'

function user(role: Role): User {
  return {
    id: `u-${role}`,
    name: role,
    email: `${role.toLowerCase()}@ces.com`,
    username: role.toLowerCase(),
    role,
    avatar: role.slice(0, 2),
    status: 'active',
    firstLogin: false,
    mfaEnabled: true,
    createdAt: '2026-01-01',
  }
}

describe('role permissions', () => {
  it('seeds one login account for each app role', () => {
    const seededRoles = new Set(MOCK_USERS.map(user => user.role))

    expect(seededRoles).toEqual(new Set<Role>([
      'CAPTURE_MANAGER',
      'BD_MANAGER',
      'TEAM_LEAD',
      'ASSOCIATE',
      'OPS_MANAGER',
    ]))
    expect(MOCK_USERS.every(user => user.email && user.password && user.status === 'active')).toBe(true)
  })

  it('gives Capture Manager full control', () => {
    const captureManager = user('CAPTURE_MANAGER')

    expect(hasPermission(captureManager, 'opportunity:create')).toBe(true)
    expect(hasPermission(captureManager, 'opportunity:cancel')).toBe(true)
    expect(hasPermission(captureManager, 'opportunity:deleteApprove')).toBe(true)
    expect(hasPermission(captureManager, 'nonSubmission:review')).toBe(true)
    expect(hasPermission(captureManager, 'admin:manageUsers')).toBe(true)
    expect(hasPermission(captureManager, 'operations:manage')).toBe(true)
  })

  it('keeps BD Manager below Capture Manager authority', () => {
    const bdManager = user('BD_MANAGER')

    expect(hasPermission(bdManager, 'opportunity:read')).toBe(true)
    expect(hasPermission(bdManager, 'opportunity:comment')).toBe(true)
    expect(hasPermission(bdManager, 'opportunity:deleteRequest')).toBe(true)
    expect(hasPermission(bdManager, 'sourcing:write')).toBe(true)
    expect(hasPermission(bdManager, 'opportunity:create')).toBe(false)
    expect(hasPermission(bdManager, 'opportunity:cancel')).toBe(false)
    expect(hasPermission(bdManager, 'opportunity:deleteApprove')).toBe(false)
    expect(hasPermission(bdManager, 'nonSubmission:viewAll')).toBe(false)
    expect(hasPermission(bdManager, 'nonSubmission:review')).toBe(false)
    expect(hasPermission(bdManager, 'contract:edit')).toBe(false)
  })

  it('lets BD Team Leads submit and assign without admin approvals', () => {
    const teamLead = user('TEAM_LEAD')

    expect(hasPermission(teamLead, 'opportunity:read')).toBe(true)
    expect(hasPermission(teamLead, 'opportunity:submitProposal')).toBe(true)
    expect(hasPermission(teamLead, 'opportunity:assign')).toBe(true)
    expect(hasPermission(teamLead, 'opportunity:comment')).toBe(true)
    expect(hasPermission(teamLead, 'sourcing:write')).toBe(true)
    expect(hasPermission(teamLead, 'opportunity:cancel')).toBe(false)
    expect(hasPermission(teamLead, 'opportunity:create')).toBe(false)
    expect(hasPermission(teamLead, 'opportunity:deleteApprove')).toBe(false)
    expect(hasPermission(teamLead, 'nonSubmission:review')).toBe(false)
  })

  it('keeps Associates limited to proposal submission and sourcing', () => {
    const associate = user('ASSOCIATE')

    expect(hasPermission(associate, 'opportunity:read')).toBe(true)
    expect(hasPermission(associate, 'opportunity:submitProposal')).toBe(true)
    expect(hasPermission(associate, 'sourcing:read')).toBe(true)
    expect(hasPermission(associate, 'sourcing:write')).toBe(true)
    expect(hasPermission(associate, 'opportunity:comment')).toBe(false)
    expect(hasPermission(associate, 'opportunity:assign')).toBe(false)
    expect(hasPermission(associate, 'opportunity:deleteRequest')).toBe(false)
    expect(hasPermission(associate, 'nonSubmission:submit')).toBe(false)
  })

  it('limits Operations Manager to operations-side controls', () => {
    const opsManager = user('OPS_MANAGER')

    expect(hasPermission(opsManager, 'operations:manage')).toBe(true)
    expect(hasPermission(opsManager, 'contract:read')).toBe(true)
    expect(hasPermission(opsManager, 'contract:edit')).toBe(true)
    expect(hasPermission(opsManager, 'opportunity:read')).toBe(false)
    expect(hasPermission(opsManager, 'opportunity:create')).toBe(false)
    expect(hasPermission(opsManager, 'opportunity:cancel')).toBe(false)
    expect(hasPermission(opsManager, 'opportunity:submitProposal')).toBe(false)
  })
})
