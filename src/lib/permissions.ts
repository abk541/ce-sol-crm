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
