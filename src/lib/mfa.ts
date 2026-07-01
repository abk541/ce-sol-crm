import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

// ── Constants ────────────────────────────────────────────────────────────────

export const MFA_ISSUER = 'CE Solution Plus CRM'
const TOTP_DIGITS = 6
const TOTP_PERIOD_SEC = 30
const TOTP_ALGORITHM: 'SHA1' = 'SHA1' // industry default; Google Authenticator, Authy, 1Password all use it
// Accept ±1 time step (±30s) to tolerate small clock skew between the user's
// phone and their browser. This is the same window Google/AWS/GitHub use.
const TOTP_VALIDATION_WINDOW = 1
const SECRET_BYTES = 20 // 160 bits, the RFC 6238 minimum for SHA-1 TOTP
const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_GROUPS = 2   // XXXX-XXXX
const RECOVERY_CODE_GROUP_LEN = 4
// Base32 alphabet with visually-ambiguous characters removed (0/O, 1/I/L).
// Users type these by hand from a printout or password manager, so the small
// entropy cost (32^8 → 26^8) is worth the readability win.
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// ── TOTP secret + provisioning URL ───────────────────────────────────────────

export interface MfaEnrollment {
  /** Base32-encoded TOTP secret. Stored in users.mfa_secret. */
  secret: string
  /** otpauth:// URL — safe to encode into a QR without leaking beyond the device that scans it. */
  otpauthUrl: string
  /** Data-URL PNG of the QR code, ready for `<img src={qrDataUrl} />`. */
  qrDataUrl: string
}

/** Generate a fresh TOTP secret + QR code for a user account. */
export async function createMfaEnrollment(accountLabel: string): Promise<MfaEnrollment> {
  const secret = new OTPAuth.Secret({ size: SECRET_BYTES })
  const totp = new OTPAuth.TOTP({
    issuer: MFA_ISSUER,
    label: accountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SEC,
    secret,
  })
  const otpauthUrl = totp.toString()
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  return { secret: secret.base32, otpauthUrl, qrDataUrl }
}

/**
 * Verify a 6-digit code against the stored secret.
 * Returns true if the code is valid within the ±1 time-step window.
 * Codes are trimmed and spaces/dashes stripped so users can paste "123 456".
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const cleaned = (code ?? '').replace(/[\s-]/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  try {
    const totp = new OTPAuth.TOTP({
      issuer: MFA_ISSUER,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SEC,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    })
    const delta = totp.validate({ token: cleaned, window: TOTP_VALIDATION_WINDOW })
    return delta !== null
  } catch {
    return false
  }
}

// ── Recovery codes ───────────────────────────────────────────────────────────

/**
 * Generate a fresh batch of one-time recovery codes.
 * Returned as plaintext for one-time display to the user. Never store these
 * as-is — hash them with `hashRecoveryCode` before persisting.
 */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) codes.push(randomRecoveryCode())
  return codes
}

function randomRecoveryCode(): string {
  const totalChars = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LEN
  const bytes = new Uint8Array(totalChars)
  crypto.getRandomValues(bytes)
  const chars: string[] = []
  for (let i = 0; i < totalChars; i++) {
    chars.push(RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length])
  }
  const groups: string[] = []
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    groups.push(chars.slice(g * RECOVERY_CODE_GROUP_LEN, (g + 1) * RECOVERY_CODE_GROUP_LEN).join(''))
  }
  return groups.join('-')
}

/** SHA-256 hex digest. Recovery codes are matched against their hash. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code)
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(hashRecoveryCode))
}

/** Strip whitespace/dashes and uppercase for consistent hashing. */
function normalizeRecoveryCode(code: string): string {
  return (code ?? '').replace(/[\s-]/g, '').toUpperCase()
}

export interface RecoveryConsumption {
  ok: boolean
  /** Remaining hashed codes after consumption (unchanged on failure). */
  remaining: string[]
}

/**
 * Check `code` against `hashedCodes`. If it matches an entry, return
 * { ok: true, remaining: <hashedCodes without the used entry> }. If not,
 * { ok: false, remaining: <hashedCodes unchanged> }. The caller is
 * responsible for persisting `remaining` so the code cannot be reused.
 */
export async function consumeRecoveryCode(
  hashedCodes: readonly string[] | undefined | null,
  code: string,
): Promise<RecoveryConsumption> {
  const list = Array.isArray(hashedCodes) ? [...hashedCodes] : []
  const normalized = normalizeRecoveryCode(code)
  if (!/^[A-Z0-9]{8,12}$/.test(normalized)) return { ok: false, remaining: list }
  const inputHash = await hashRecoveryCode(normalized)
  const idx = list.findIndex(h => constantTimeEqual(h, inputHash))
  if (idx < 0) return { ok: false, remaining: list }
  list.splice(idx, 1)
  return { ok: true, remaining: list }
}

// Length-independent constant-time compare. Both inputs are hex strings of
// the same fixed length (64 chars for SHA-256), so a short-circuit on length
// mismatch is fine.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
