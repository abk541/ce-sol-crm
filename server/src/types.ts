import type { Database } from './db.js'
import type { Environment } from './env.js'

export interface Dependencies {
  env: Environment
  db: Database
  fetch: typeof globalThis.fetch
  now: () => Date
}

export interface SafeProfileRow {
  id: string
  auth_user_id: string
  name: string
  email: string
  username: string
  role: string
  avatar: string | null
  status: 'active' | 'inactive'
  first_login: boolean
  mfa_enabled: boolean
  created_at: Date | string | null
  team: 'BD' | 'OPS' | null
  manager_id: string | null
}

export interface AuthenticatedSession {
  sessionId: string
  accountId: string
  profile: SafeProfileRow
  createdAt: Date
  expiresAt: Date
  rawToken?: string
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedSession | null
  }
}
