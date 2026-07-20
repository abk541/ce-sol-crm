import { resolve } from 'node:path'

export interface Environment {
  databaseUrl: string
  host: string
  port: number
  trustProxy: boolean
  logLevel: string
  allowedOrigins: ReadonlySet<string>
  attachmentsDir: string
  maxUploadBytes: number
  samGovApiKey: string
  samGovTimeoutMs: number
  samGovMaxResponseBytes: number
  sessionTtlSeconds: number
  loginRateLimitMax: number
  loginRateLimitWindow: string
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('TRUST_PROXY must be true or false.')
}

function origins(value: string | undefined): ReadonlySet<string> {
  const result = new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => new URL(entry).origin),
  )
  if (result.has('*')) throw new Error('ALLOWED_ORIGINS cannot contain a wildcard.')
  return result
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const databaseUrl = source.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')

  return {
    databaseUrl,
    host: source.HOST?.trim() || '127.0.0.1',
    port: positiveInteger(source.PORT, 3000, 'PORT'),
    trustProxy: booleanValue(source.TRUST_PROXY, true),
    logLevel: source.LOG_LEVEL?.trim() || 'info',
    allowedOrigins: origins(source.ALLOWED_ORIGINS),
    attachmentsDir: resolve(source.ATTACHMENTS_DIR?.trim() || './var/attachments'),
    maxUploadBytes: positiveInteger(source.MAX_UPLOAD_BYTES, 25 * 1024 * 1024, 'MAX_UPLOAD_BYTES'),
    samGovApiKey: source.SAM_GOV_API_KEY?.trim() || '',
    samGovTimeoutMs: positiveInteger(source.SAM_GOV_TIMEOUT_MS, 20_000, 'SAM_GOV_TIMEOUT_MS'),
    samGovMaxResponseBytes: positiveInteger(
      source.SAM_GOV_MAX_RESPONSE_BYTES,
      5 * 1024 * 1024,
      'SAM_GOV_MAX_RESPONSE_BYTES',
    ),
    sessionTtlSeconds: positiveInteger(source.SESSION_TTL_SECONDS, 86_400, 'SESSION_TTL_SECONDS'),
    loginRateLimitMax: positiveInteger(source.LOGIN_RATE_LIMIT_MAX, 8, 'LOGIN_RATE_LIMIT_MAX'),
    loginRateLimitWindow: source.LOGIN_RATE_LIMIT_WINDOW?.trim() || '1 minute',
  }
}
