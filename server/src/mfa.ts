import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const MFA_ISSUER = 'CE Solution Plus CRM'
export const MFA_KEY_VERSION = 1
export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1
export const RECOVERY_CODE_COUNT = 10
export type MfaStage = 'first_login' | 'mfa_enroll' | 'mfa_verify' | 'mfa_recovery'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_CODE_CHARACTERS = 16

export interface EncryptedValue {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
  keyVersion: number
}

export interface StoredEncryptedValue {
  ciphertext: Uint8Array
  iv: Uint8Array
  authTag: Uint8Array
  keyVersion: number
}

function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    masterKey,
    Buffer.from('ce-sol-crm-native-mfa-v1', 'utf8'),
    Buffer.from(purpose, 'utf8'),
    32,
  ))
}

export function encryptMfaValue(masterKey: Buffer, plaintext: string, aad: string): EncryptedValue {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey, 'totp-encryption'), iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
    keyVersion: MFA_KEY_VERSION,
  }
}

export function decryptMfaValue(masterKey: Buffer, value: StoredEncryptedValue, aad: string): string {
  if (value.keyVersion !== MFA_KEY_VERSION) {
    throw new Error('Unsupported MFA encryption key version.')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(masterKey, 'totp-encryption'),
    Buffer.from(value.iv),
  )
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(value.authTag))
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext)),
    decipher.final(),
  ]).toString('utf8')
}

export function base32Encode(value: Uint8Array): string {
  let bits = 0
  let accumulator = 0
  let output = ''
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31]
  return output
}

export function base32Decode(value: string): Buffer {
  const normalized = value.trim().replace(/=+$/g, '').toUpperCase()
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('Invalid base32 value.')
  let bits = 0
  let accumulator = 0
  const output: number[] = []
  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function provisioningUri(accountLabel: string, secret: string): string {
  const label = `${MFA_ISSUER}:${accountLabel.trim().toLowerCase()}`
  const parameters = new URLSearchParams({
    secret,
    issuer: MFA_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`
}

function tokenForCounter(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0')
}

function equalToken(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'ascii')
  const right = Buffer.from(actual, 'ascii')
  return left.length === right.length && timingSafeEqual(left, right)
}

export function normalizeTotpCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(normalized) ? normalized : null
}

export function verifyTotpCode(
  secretBase32: string,
  code: string,
  now: Date,
  lastUsedTimestep: number | null,
  window = TOTP_WINDOW,
): number | null {
  const secret = base32Decode(secretBase32)
  const current = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS)
  for (let delta = -window; delta <= window; delta += 1) {
    const timestep = current + delta
    if (timestep < 0 || (lastUsedTimestep !== null && timestep <= lastUsedTimestep)) continue
    if (equalToken(tokenForCounter(secret, timestep), code)) return timestep
  }
  return null
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(RECOVERY_CODE_CHARACTERS)
    const characters = [...bytes].map((byte) => RECOVERY_ALPHABET[byte & 31])
    return [
      characters.slice(0, 4).join(''),
      characters.slice(4, 8).join(''),
      characters.slice(8, 12).join(''),
      characters.slice(12, 16).join(''),
    ].join('-')
  })
}

export function normalizeRecoveryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[\s-]/g, '').toUpperCase()
  return new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_CODE_CHARACTERS}}$`).test(normalized)
    ? normalized
    : null
}

export function hashRecoveryCode(masterKey: Buffer, normalizedCode: string): string {
  return createHmac('sha256', deriveKey(masterKey, 'recovery-code-hash'))
    .update(normalizedCode, 'ascii')
    .digest('hex')
}

export const __test = {
  tokenForCounter,
}
