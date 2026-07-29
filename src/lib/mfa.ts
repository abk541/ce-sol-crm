import QRCode from 'qrcode'

export interface MfaEnrollment {
  /** Server-generated key shown transiently during enrollment. */
  manualKey: string
  /** Server-generated provisioning URI rendered locally only as a QR image. */
  otpauthUrl: string
  qrDataUrl: string
}

/**
 * Rendering is the browser's only MFA cryptographic responsibility. Secret
 * generation, TOTP validation, recovery-code hashing, and replay protection
 * all remain on the native API.
 */
export async function renderMfaEnrollment(input: {
  manualKey: string
  otpauthUrl: string
}): Promise<MfaEnrollment> {
  const qrDataUrl = await QRCode.toDataURL(input.otpauthUrl, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  return { ...input, qrDataUrl }
}
