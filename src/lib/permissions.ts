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
  TEAM_LEAD: 'BD Team Lead',
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

const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
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
  return PERMISSIONS_BY_ROLE[user.role]?.includes(permission) ?? false
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
