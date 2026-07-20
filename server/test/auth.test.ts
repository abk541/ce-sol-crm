import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { hashToken, passwordMeetsPolicy } from '../src/auth.js'

describe('password migration compatibility', () => {
  it('verifies imported GoTrue $2a$ bcrypt hashes', async () => {
    const hash = await bcrypt.hash('Valid1!Password', 4)
    const gotrueStyle = `$2a$${hash.slice(4)}`
    await expect(bcrypt.compare('Valid1!Password', gotrueStyle)).resolves.toBe(true)
    await expect(bcrypt.compare('wrong', gotrueStyle)).resolves.toBe(false)
  })

  it('keeps the application password policy and bcrypt byte boundary', () => {
    expect(passwordMeetsPolicy('Valid1!Password')).toBe(true)
    expect(passwordMeetsPolicy('no-uppercase1!')).toBe(false)
    expect(passwordMeetsPolicy('A1!')).toBe(false)
    expect(passwordMeetsPolicy(`A1!${'é'.repeat(40)}`)).toBe(false)
  })
})

describe('opaque token hashing', () => {
  it('uses a deterministic SHA-256 digest without preserving the token', () => {
    const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_1234'
    const digest = hashToken(token)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toContain(token)
    expect(hashToken(token)).toBe(digest)
  })
})
