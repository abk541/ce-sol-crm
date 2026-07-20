import type { EmployeeTeam, Role, User } from '../types'

// Keep this projection in one place. public.users still contains legacy
// credential/MFA columns during migration, so `select('*')` is never safe.
export const SAFE_USER_COLUMNS = [
  'id',
  'auth_user_id',
  'name',
  'email',
  'username',
  'role',
  'avatar',
  'status',
  'first_login',
  'team',
  'manager_id',
  'created_at',
].join(',')

const ROLES: Role[] = ['CAPTURE_MANAGER', 'BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE', 'OPS_MANAGER']

function dateOnly(value: unknown): string {
  const date = typeof value === 'string' ? value : ''
  return date.split('T')[0] || new Date().toISOString().split('T')[0]
}

export function mapSafeUserRow(row: Record<string, unknown>): User {
  const role = ROLES.includes(row.role as Role) ? row.role as Role : 'ASSOCIATE'
  const status = row.status === 'inactive' ? 'inactive' : 'active'
  const team = row.team === 'OPS' || row.team === 'BD'
    ? row.team as EmployeeTeam
    : undefined

  return {
    id: String(row.id ?? ''),
    authUserId: typeof (row.auth_user_id ?? row.authUserId) === 'string'
      ? String(row.auth_user_id ?? row.authUserId)
      : undefined,
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    username: String(row.username ?? ''),
    role,
    avatar: typeof row.avatar === 'string' ? row.avatar : '',
    status,
    firstLogin: (row.first_login ?? row.firstLogin) === true,
    createdAt: dateOnly(row.created_at ?? row.createdAt),
    team,
    managerId: typeof (row.manager_id ?? row.managerId) === 'string'
      ? String(row.manager_id ?? row.managerId)
      : null,
  }
}

/** Strip credentials and legacy MFA material from untrusted/imported user data. */
export function toSafeUser(user: User): User {
  const {
    password: _password,
    mfaEnabled: _mfaEnabled,
    mfaSecret: _mfaSecret,
    mfaRecoveryCodes: _mfaRecoveryCodes,
    ...safe
  } = user
  return safe
}

export function mergeSafeUser(users: User[], profile: User): User[] {
  const safeProfile = toSafeUser(profile)
  const index = users.findIndex(user =>
    user.id === safeProfile.id ||
    (!!safeProfile.authUserId && user.authUserId === safeProfile.authUserId),
  )
  if (index < 0) return [...users.map(toSafeUser), safeProfile]
  return users.map((user, i) => i === index ? safeProfile : toSafeUser(user))
}
