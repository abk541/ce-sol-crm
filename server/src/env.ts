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
  mfaEnforcementEnabled: boolean
  mfaEncryptionKey: Buffer | null
  mfaChallengeTtlSeconds: number
  mfaMaxAttempts: number
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be exactly true or false.`)
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const parsed = positiveInteger(value, fallback, name)
  if (parsed > maximum) throw new Error(`${name} must be at most ${maximum}.`)
  return parsed
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
  const mfaEnforcementEnabled = booleanValue(
    source.MFA_ENFORCEMENT_ENABLED,
    false,
    'MFA_ENFORCEMENT_ENABLED',
  )
  const encodedMfaKey = source.MFA_ENCRYPTION_KEY?.trim() ?? ''
  let mfaEncryptionKey: Buffer | null = null
  if (encodedMfaKey) {
    const decoded = Buffer.from(encodedMfaKey, 'base64')
    const canonical = decoded.toString('base64')
    if (decoded.length !== 32 || canonical !== encodedMfaKey) {
      throw new Error('MFA_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.')
    }
    mfaEncryptionKey = decoded
  }
  if (mfaEnforcementEnabled && !mfaEncryptionKey) {
    throw new Error('MFA_ENCRYPTION_KEY is required when MFA_ENFORCEMENT_ENABLED is true.')
  }

  return {
    databaseUrl,
    host: source.HOST?.trim() || '127.0.0.1',
    port: positiveInteger(source.PORT, 3000, 'PORT'),
    trustProxy: booleanValue(source.TRUST_PROXY, true, 'TRUST_PROXY'),
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
    mfaEnforcementEnabled,
    mfaEncryptionKey,
    mfaChallengeTtlSeconds: positiveInteger(
      source.MFA_CHALLENGE_TTL_SECONDS,
      600,
      'MFA_CHALLENGE_TTL_SECONDS',
    ),
    mfaMaxAttempts: boundedInteger(source.MFA_MAX_ATTEMPTS, 5, 'MFA_MAX_ATTEMPTS', 10),
  }
}
