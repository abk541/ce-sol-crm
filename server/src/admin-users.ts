import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { requireCompleted, passwordMeetsPolicy, PASSWORD_POLICY_MESSAGE } from './auth.js'
import { asServiceUser, type Queryable } from './db.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies, SafeProfileRow } from './types.js'

const ROLES = new Set(['CAPTURE_MANAGER', 'BD_MANAGER', 'OPS_MANAGER', 'TEAM_LEAD', 'ASSOCIATE'])
const STATUSES = new Set(['active', 'inactive'])
const TEAMS = new Set(['BD', 'OPS'])
const SAFE_COLUMNS =
  'id, auth_user_id, name, email, username, role, avatar, status, first_login, mfa_enabled, created_at, team, manager_id'

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label, maxLength)
}

function nullableString(value: unknown, label: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return requiredString(value, label, maxLength)
}

function email(value: unknown, required = true): string | undefined {
  if (!required && value === undefined) return undefined
  const result = requiredString(value, 'email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new ApiError(400, 'invalid_request', 'email is not valid.')
  }
  return result
}

function username(value: unknown, required = true): string | undefined {
  if (!required && value === undefined) return undefined
  const result = requiredString(value, 'username', 64)
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(result)) {
    throw new ApiError(400, 'invalid_request', 'username must be 3-64 letters, numbers, dots, underscores, or hyphens.')
  }
  return result
}

function enumValue(value: unknown, allowed: ReadonlySet<string>, label: string, required = true): string | undefined {
  if (!required && value === undefined) return undefined
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ApiError(400, 'invalid_request', `${label} is not valid.`)
  }
  return value
}

function team(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return enumValue(value, TEAMS, 'team')
}

function password(value: unknown): string {
  if (typeof value !== 'string' || !passwordMeetsPolicy(value)) {
    throw new ApiError(400, 'weak_password', PASSWORD_POLICY_MESSAGE)
  }
  return value
}

async function requireAdmin(client: Queryable, accountId: string): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    "select private.effective_permission_for_auth_user($1, 'admin:manageUsers') as allowed",
    [accountId],
  )
  if (result.rows[0]?.allowed !== true) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to manage users.')
  }
}

async function targetById(client: PoolClient, userId: string, lock = false): Promise<SafeProfileRow> {
  const result = await client.query<SafeProfileRow>(
    `select ${SAFE_COLUMNS} from public.users where id = $1${lock ? ' for update' : ''}`,
    [userId],
  )
  const target = result.rows[0]
  if (!target) throw new ApiError(404, 'user_not_found', 'User was not found.')
  return target
}

async function targetIsAdmin(client: PoolClient, accountId: string): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    "select private.effective_permission_for_auth_user($1, 'admin:manageUsers') as allowed",
    [accountId],
  )
  return result.rows[0]?.allowed === true
}

async function ensureAnotherAdmin(client: PoolClient, target: SafeProfileRow): Promise<void> {
  // Serializes every operation that can remove effective administrator access.
  await client.query("select pg_advisory_xact_lock(hashtext('ce-crm-last-admin'))")
  if (!(await targetIsAdmin(client, target.auth_user_id))) return
  const result = await client.query<{ available: boolean }>(
    `select exists (
       select 1 from public.users p
        where p.id is distinct from $1
          and private.effective_permission_for_auth_user(p.auth_user_id, 'admin:manageUsers')
     ) as available`,
    [target.id],
  )
  if (result.rows[0]?.available !== true) {
    throw new ApiError(
      409,
      'last_admin',
      'The last effective administrator cannot be reset, disabled, demoted, or deleted.',
    )
  }
}

async function ensureManager(client: PoolClient, managerId: string | null | undefined, targetId?: string): Promise<void> {
  if (!managerId) return
  if (managerId === targetId) throw new ApiError(400, 'invalid_manager', 'A user cannot manage themselves.')
  const result = await client.query('select 1 from public.users where id = $1 and status = $2', [managerId, 'active'])
  if (result.rowCount !== 1) {
    throw new ApiError(400, 'invalid_manager', 'managerId must identify an active user.')
  }
}

function translateConflict(error: unknown): never {
  const candidate = error as { code?: unknown; detail?: unknown }
  if (candidate.code === '23505') {
    throw new ApiError(409, 'user_conflict', 'A user with that email or username already exists.', candidate.detail ?? null)
  }
  if (candidate.code === '23514') {
    throw new ApiError(409, 'last_admin', 'The last effective administrator cannot be changed.')
  }
  throw error
}

export function registerAdminUserRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/admin/users/actions',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const body = asRecord(request.body)
      const action = requiredString(body.action, 'action', 32)
      const caller = request.auth as NonNullable<typeof request.auth>

      // Reject non-administrators before parsing or hashing action payloads.
      // The transactional checks below remain in place to protect the actual
      // mutations and last-admin invariants.
      await requireAdmin(dependencies.db, caller.accountId)

      try {
        if (action === 'create') {
          assertAllowedKeys(body, ['action', 'user'])
          const input = asRecord(body.user, 'user')
          assertAllowedKeys(input, [
            'name', 'email', 'username', 'role', 'avatar', 'status', 'firstLogin', 'team', 'managerId', 'password',
          ], 'user')
          const newPassword = password(input.password)
          const hash = await bcrypt.hash(newPassword, 12)
          const result = await asServiceUser(dependencies.db, caller.accountId, async (client) => {
            await requireAdmin(client, caller.accountId)
            const managerId = nullableString(input.managerId, 'managerId', 128) ?? null
            await ensureManager(client, managerId)
            if (input.firstLogin === false) {
              throw new ApiError(400, 'invalid_request', 'New users must complete first-login password setup.')
            }
            const accountId = randomUUID()
            const userId = randomUUID()
            const userEmail = email(input.email) as string
            const userName = username(input.username) as string
            await client.query(
              `insert into app_auth.accounts (id, email, encrypted_password)
               values ($1, $2, $3)`,
              [accountId, userEmail, hash],
            )
            const inserted = await client.query<SafeProfileRow>(
              `insert into public.users
                (id, auth_user_id, name, email, username, role, avatar, status, first_login, mfa_enabled, team, manager_id)
               values ($1,$2,$3,$4,$5,$6,$7,$8,true,false,$9,$10)
               returning ${SAFE_COLUMNS}`,
              [
                userId,
                accountId,
                requiredString(input.name, 'name', 120),
                userEmail,
                userName,
                enumValue(input.role, ROLES, 'role'),
                nullableString(input.avatar, 'avatar', 2048) ?? null,
                enumValue(input.status, STATUSES, 'status', false) ?? 'active',
                team(input.team) ?? null,
                managerId,
              ],
            )
            return inserted.rows[0]
          })
          return { user: result, error: null }
        }

        if (action === 'update') {
          assertAllowedKeys(body, ['action', 'userId', 'updates'])
          const userId = requiredString(body.userId, 'userId', 128)
          const updates = asRecord(body.updates, 'updates')
          assertAllowedKeys(updates, ['name', 'email', 'username', 'role', 'avatar', 'status', 'team', 'managerId'], 'updates')
          if (Object.keys(updates).length === 0) {
            throw new ApiError(400, 'invalid_request', 'updates must contain at least one field.')
          }
          const result = await asServiceUser(dependencies.db, caller.accountId, async (client) => {
            await requireAdmin(client, caller.accountId)
            const target = await targetById(client, userId, true)
            const nextRole = enumValue(updates.role, ROLES, 'role', false)
            const nextStatus = enumValue(updates.status, STATUSES, 'status', false)
            const removesAdmin = (nextRole !== undefined && nextRole !== target.role)
              || (nextStatus === 'inactive' && target.status !== 'inactive')
            if (removesAdmin) {
              if (target.auth_user_id === caller.accountId && await targetIsAdmin(client, target.auth_user_id)) {
                throw new ApiError(409, 'self_lockout', 'You cannot disable or demote your own account.')
              }
              await ensureAnotherAdmin(client, target)
            }

            const managerId = nullableString(updates.managerId, 'managerId', 128)
            if (managerId !== undefined) await ensureManager(client, managerId, target.id)
            const profilePatch: Record<string, unknown> = {}
            const add = (key: string, value: unknown) => {
              if (value !== undefined) profilePatch[key] = value
            }
            add('name', optionalString(updates.name, 'name', 120))
            const nextEmail = email(updates.email, false)
            add('email', nextEmail)
            add('username', username(updates.username, false))
            add('role', nextRole)
            add('avatar', nullableString(updates.avatar, 'avatar', 2048))
            add('status', nextStatus)
            add('team', team(updates.team))
            add('manager_id', managerId)
            const keys = Object.keys(profilePatch)
            const values = keys.map((key) => profilePatch[key])
            values.push(target.id)
            const updated = await client.query<SafeProfileRow>(
              `update public.users set ${keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ')}
                where id = $${values.length} returning ${SAFE_COLUMNS}`,
              values,
            )
            if (nextEmail !== undefined) {
              await client.query('update app_auth.accounts set email = $2, updated_at = now() where id = $1', [
                target.auth_user_id,
                nextEmail,
              ])
            }
            if (nextStatus === 'inactive') {
              await client.query(
                'update app_auth.sessions set revoked_at = now() where account_id = $1 and revoked_at is null',
                [target.auth_user_id],
              )
            }
            return updated.rows[0]
          })
          return { user: result, error: null }
        }

        if (action === 'reset-password') {
          assertAllowedKeys(body, ['action', 'userId', 'password'])
          const userId = requiredString(body.userId, 'userId', 128)
          const hash = await bcrypt.hash(password(body.password), 12)
          const result = await asServiceUser(dependencies.db, caller.accountId, async (client) => {
            await requireAdmin(client, caller.accountId)
            const target = await targetById(client, userId, true)
            await ensureAnotherAdmin(client, target)
            await client.query(
              `update app_auth.accounts
                  set encrypted_password = $2,
                      password_version = password_version + 1,
                      updated_at = now()
                where id = $1`,
              [target.auth_user_id, hash],
            )
            const updated = await client.query<SafeProfileRow>(
              `update public.users set first_login = true where id = $1 returning ${SAFE_COLUMNS}`,
              [target.id],
            )
            await client.query(
              'update app_auth.sessions set revoked_at = now() where account_id = $1 and revoked_at is null',
              [target.auth_user_id],
            )
            return updated.rows[0]
          })
          return { user: result, error: null }
        }

        if (action === 'delete') {
          assertAllowedKeys(body, ['action', 'userId'])
          const userId = requiredString(body.userId, 'userId', 128)
          const result = await asServiceUser(dependencies.db, caller.accountId, async (client) => {
            await requireAdmin(client, caller.accountId)
            const target = await targetById(client, userId, true)
            if (target.auth_user_id === caller.accountId) {
              throw new ApiError(409, 'self_delete', 'You cannot delete your own account.')
            }
            await ensureAnotherAdmin(client, target)
            await client.query('delete from app_auth.accounts where id = $1', [target.auth_user_id])
            return target
          })
          return { user: result, error: null }
        }

        throw new ApiError(400, 'unsupported_action', 'The requested user-management action is not supported.')
      } catch (error) {
        translateConflict(error)
      }
    },
  )
}
