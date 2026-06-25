import { describe, expect, it, afterEach } from 'vitest'
import { MOCK_USERS } from '../data/mock'
import { applyPermissionOverrides, getEffectiveRolePermissions, getEffectiveUserPermissions, hasPermission } from '../lib/permissions'
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
    createdAt: '2026-01-01',
  }
}

describe('role permissions', () => {
  it('starts with only the Capture Manager seed login', () => {
    expect(MOCK_USERS).toHaveLength(1)
    expect(MOCK_USERS[0]).toMatchObject({
      id: 'u0',
      email: 'abk@cesolutionplus.com',
      role: 'CAPTURE_MANAGER',
      status: 'active',
    })
    expect(MOCK_USERS[0].password).toBeTruthy()
  })

  it('gives Capture Manager full control', () => {
    const captureManager = user('CAPTURE_MANAGER')

    expect(hasPermission(captureManager, 'opportunity:create')).toBe(true)
    expect(hasPermission(captureManager, 'opportunity:cancel')).toBe(true)
    expect(hasPermission(captureManager, 'opportunity:deleteApprove')).toBe(true)
    expect(hasPermission(captureManager, 'nonSubmission:review')).toBe(true)
    expect(hasPermission(captureManager, 'admin:manageUsers')).toBe(true)
    expect(hasPermission(captureManager, 'operations:manage')).toBe(true)
    expect(hasPermission(captureManager, 'hr:viewCertifications')).toBe(true)
    expect(hasPermission(captureManager, 'hr:manageCertifications')).toBe(true)
    expect(hasPermission(captureManager, 'hr:reviewRequests')).toBe(true)
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
    expect(hasPermission(bdManager, 'hr:viewCertifications')).toBe(true)
    expect(hasPermission(bdManager, 'hr:manageCertifications')).toBe(false)
    expect(hasPermission(bdManager, 'hr:reviewRequests')).toBe(false)
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
    expect(hasPermission(teamLead, 'hr:viewCertifications')).toBe(true)
    expect(hasPermission(teamLead, 'hr:manageCertifications')).toBe(false)
    expect(hasPermission(teamLead, 'hr:reviewRequests')).toBe(false)
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
    expect(hasPermission(associate, 'hr:viewCertifications')).toBe(true)
    expect(hasPermission(associate, 'hr:manageCertifications')).toBe(false)
    expect(hasPermission(associate, 'hr:reviewRequests')).toBe(false)
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
    expect(hasPermission(opsManager, 'hr:viewCertifications')).toBe(true)
    expect(hasPermission(opsManager, 'hr:manageCertifications')).toBe(false)
    expect(hasPermission(opsManager, 'hr:reviewRequests')).toBe(false)
  })
})

describe('permission overrides', () => {
  afterEach(() => {
    // Always clear overrides between tests so one test never leaks state into
    // another and the default-role tests above keep passing if reordered.
    applyPermissionOverrides({}, {}, {})
  })

  it('falls back to defaults when no overrides are applied', () => {
    const associate = user('ASSOCIATE')
    expect(hasPermission(associate, 'opportunity:create')).toBe(false)
    expect(hasPermission(associate, 'sourcing:read')).toBe(true)
  })

  it('lets a role override replace the default permission set', () => {
    applyPermissionOverrides({ ASSOCIATE: ['opportunity:create', 'opportunity:read'] }, {}, {})
    const associate = user('ASSOCIATE')
    expect(hasPermission(associate, 'opportunity:create')).toBe(true)
    expect(hasPermission(associate, 'opportunity:read')).toBe(true)
    // Defaults that aren't in the override are dropped:
    expect(hasPermission(associate, 'sourcing:read')).toBe(false)
  })

  it('grants an extra permission to one user without affecting peers', () => {
    const alice = { ...user('ASSOCIATE'), id: 'alice' }
    const bob   = { ...user('ASSOCIATE'), id: 'bob'   }
    applyPermissionOverrides({}, { alice: ['nonSubmission:submit'] }, {})
    expect(hasPermission(alice, 'nonSubmission:submit')).toBe(true)
    expect(hasPermission(bob,   'nonSubmission:submit')).toBe(false)
  })

  it('revokes a role-granted permission for one user without affecting peers', () => {
    const alice = { ...user('ASSOCIATE'), id: 'alice' }
    const bob   = { ...user('ASSOCIATE'), id: 'bob'   }
    applyPermissionOverrides({}, {}, { alice: ['sourcing:read'] })
    expect(hasPermission(alice, 'sourcing:read')).toBe(false)
    expect(hasPermission(bob,   'sourcing:read')).toBe(true)
  })

  it('grant beats revoke for the same user + permission', () => {
    const alice = { ...user('ASSOCIATE'), id: 'alice' }
    applyPermissionOverrides({}, { alice: ['opportunity:create'] }, { alice: ['opportunity:create'] })
    expect(hasPermission(alice, 'opportunity:create')).toBe(true)
  })

  it('getEffectiveUserPermissions returns the merged set', () => {
    const alice = { ...user('ASSOCIATE'), id: 'alice' }
    applyPermissionOverrides({}, { alice: ['opportunity:create'] }, { alice: ['sourcing:read'] })
    const effective = getEffectiveUserPermissions(alice)
    expect(effective.has('opportunity:create')).toBe(true)  // granted
    expect(effective.has('sourcing:read')).toBe(false)       // revoked
    expect(effective.has('opportunity:read')).toBe(true)     // unchanged role default
  })

  it('getEffectiveRolePermissions reflects role-level overrides', () => {
    applyPermissionOverrides({ BD_MANAGER: ['opportunity:create'] }, {}, {})
    expect(getEffectiveRolePermissions('BD_MANAGER')).toEqual(['opportunity:create'])
    // Untouched roles still return their built-in defaults.
    expect(getEffectiveRolePermissions('CAPTURE_MANAGER').length).toBeGreaterThan(10)
  })
})
