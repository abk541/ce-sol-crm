import type { Role, User } from '../types'

export type Permission =
  | 'admin:manageUsers'
  | 'opportunity:create'
  | 'opportunity:read'
  | 'opportunity:edit'
  | 'opportunity:comment'
  | 'opportunity:submitProposal'
  | 'opportunity:assign'
  | 'opportunity:cancel'
  | 'opportunity:deleteRequest'
  | 'opportunity:deleteApprove'
  | 'sourcing:read'
  | 'sourcing:write'
  | 'nonSubmission:submit'
  | 'nonSubmission:viewAll'
  | 'nonSubmission:review'
  | 'contract:read'
  | 'contract:edit'
  | 'operations:manage'
  | 'hr:manageCertifications'
  | 'hr:viewCertifications'
  | 'hr:reviewRequests'

export const ROLE_LABELS: Record<Role, string> = {
  CAPTURE_MANAGER: 'Capture Manager',
  BD_MANAGER: 'BD Manager',
  TEAM_LEAD: 'Team Lead',
  ASSOCIATE: 'Associate',
  OPS_MANAGER: 'Operations Manager',
}

const ALL_PERMISSIONS: Permission[] = [
  'admin:manageUsers',
  'opportunity:create',
  'opportunity:read',
  'opportunity:edit',
  'opportunity:comment',
  'opportunity:submitProposal',
  'opportunity:assign',
  'opportunity:cancel',
  'opportunity:deleteRequest',
  'opportunity:deleteApprove',
  'sourcing:read',
  'sourcing:write',
  'nonSubmission:submit',
  'nonSubmission:viewAll',
  'nonSubmission:review',
  'contract:read',
  'contract:edit',
  'operations:manage',
  'hr:manageCertifications',
  'hr:viewCertifications',
  'hr:reviewRequests',
]

export const PERMISSION_REGISTRY: ReadonlyArray<Permission> = ALL_PERMISSIONS

export const PERMISSION_LABELS: Record<Permission, string> = {
  'admin:manageUsers':           'Manage user accounts',
  'opportunity:create':          'Create opportunities',
  'opportunity:read':            'View opportunities',
  'opportunity:edit':            'Edit opportunities',
  'opportunity:comment':         'Comment on opportunities',
  'opportunity:submitProposal':  'Submit proposals',
  'opportunity:assign':          'Assign opportunities',
  'opportunity:cancel':          'Cancel opportunities',
  'opportunity:deleteRequest':   'Request opportunity deletion',
  'opportunity:deleteApprove':   'Approve / deny deletion requests',
  'sourcing:read':               'View sourcing database',
  'sourcing:write':              'Edit sourcing database',
  'nonSubmission:submit':        'Submit non-submission reports',
  'nonSubmission:viewAll':       'View all non-submission reports',
  'nonSubmission:review':        'Review non-submission reports',
  'contract:read':               'View contracts',
  'contract:edit':               'Edit contracts',
  'operations:manage':           'Manage operations workflow',
  'hr:manageCertifications':     'Manage company certifications',
  'hr:viewCertifications':       'View company certifications',
  'hr:reviewRequests':           'Review HR / employee requests',
}

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  admin:         'Administration',
  opportunity:   'Opportunities',
  sourcing:      'Sourcing',
  nonSubmission: 'Non-submission reporting',
  contract:      'Contracts',
  operations:    'Operations',
  hr:            'HR',
}

export function getPermissionGroup(perm: Permission): string {
  return perm.split(':')[0]
}

export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  CAPTURE_MANAGER: ALL_PERMISSIONS,
  BD_MANAGER: [
    'opportunity:read',
    'opportunity:comment',
    'opportunity:assign',
    'opportunity:deleteRequest',
    'sourcing:read',
    'sourcing:write',
    'nonSubmission:submit',
    'hr:viewCertifications',
  ],
  TEAM_LEAD: [
    'opportunity:read',
    'opportunity:comment',
    'opportunity:submitProposal',
    'opportunity:assign',
    'opportunity:deleteRequest',
    'sourcing:read',
    'sourcing:write',
    'nonSubmission:submit',
    'hr:viewCertifications',
  ],
  ASSOCIATE: [
    'opportunity:read',
    'opportunity:submitProposal',
    'sourcing:read',
    'sourcing:write',
    'hr:viewCertifications',
  ],
  OPS_MANAGER: [
    'contract:read',
    'contract:edit',
    'operations:manage',
    'hr:viewCertifications',
  ],
}

export function hasPermission(user: User | null | undefined, permission: Permission) {
  if (!user) return false
  return getEffectiveUserPermissions(user).has(permission)
}

export function hasAnyPermission(user: User | null | undefined, permissions: Permission[]) {
  return permissions.some(permission => hasPermission(user, permission))
}

export function isCaptureManager(user: User | null | undefined) {
  return user?.role === 'CAPTURE_MANAGER'
}

export function canManageOperations(user: User | null | undefined) {
  return hasPermission(user, 'operations:manage')
}

// ── Runtime overrides ────────────────────────────────────────────────────────
// These are mutated by the Zustand store (see useStore.ts), which subscribes
// to itself and calls applyPermissionOverrides() on every state change. We
// keep the override table here (a plain module variable) instead of importing
// the store to avoid a circular import.
//
// Falsy values fall back to defaults, so a fresh install with no overrides
// behaves exactly like before this feature was added — that's how we keep
// hasPermission() backward-compatible for every existing caller.

let activeRoleOverrides: Partial<Record<Role, Permission[]>> = {}
let activeUserGrants: Record<string, Permission[]> = {}
let activeUserRevokes: Record<string, Permission[]> = {}

export function applyPermissionOverrides(
  rolePerms?: Partial<Record<Role, Permission[]>> | null,
  userGrants?: Record<string, Permission[]> | null,
  userRevokes?: Record<string, Permission[]> | null,
) {
  activeRoleOverrides = rolePerms ?? {}
  activeUserGrants    = userGrants ?? {}
  activeUserRevokes   = userRevokes ?? {}
}

export function getEffectiveRolePermissions(role: Role): Permission[] {
  const override = activeRoleOverrides[role]
  return override ?? PERMISSIONS_BY_ROLE[role] ?? []
}

export function getEffectiveUserPermissions(
  user: { id: string; role: Role } | null | undefined,
): Set<Permission> {
  if (!user) return new Set()
  const base    = getEffectiveRolePermissions(user.role)
  const grants  = activeUserGrants[user.id]  ?? []
  const revokes = new Set<Permission>(activeUserRevokes[user.id] ?? [])
  const out = new Set<Permission>()
  for (const p of base)   if (!revokes.has(p)) out.add(p)
  for (const g of grants) out.add(g)
  return out
}

export function isRoleCustomized(role: Role): boolean {
  return Array.isArray(activeRoleOverrides[role])
}

export function userHasCustomOverrides(userId: string): boolean {
  const g = activeUserGrants[userId]
  const r = activeUserRevokes[userId]
  return (Array.isArray(g) && g.length > 0) || (Array.isArray(r) && r.length > 0)
}
