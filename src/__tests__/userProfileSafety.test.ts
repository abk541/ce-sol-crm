import { describe, expect, it } from 'vitest'
import type { User } from '../types'
import { toSafeUser } from '../lib/userProfile'

describe('safe user profile boundary', () => {
  it('removes retired MFA secrets from legacy browser snapshots', () => {
    const legacy = {
      id: 'profile-1',
      authUserId: 'auth-1',
      name: 'Legacy User',
      email: 'legacy@example.test',
      username: 'legacy',
      role: 'ASSOCIATE',
      avatar: 'LU',
      status: 'active',
      firstLogin: false,
      createdAt: '2026-07-29',
      mfaEnabled: true,
      password: 'must-not-survive',
      mfaSecret: 'retired-client-secret',
      mfaRecoveryCodes: ['retired-client-code'],
      mfa_secret: 'retired-row-secret',
      mfa_recovery_codes: ['retired-row-code'],
    } satisfies User & Record<string, unknown>

    expect(toSafeUser(legacy)).toEqual({
      id: 'profile-1',
      authUserId: 'auth-1',
      name: 'Legacy User',
      email: 'legacy@example.test',
      username: 'legacy',
      role: 'ASSOCIATE',
      avatar: 'LU',
      status: 'active',
      firstLogin: false,
      createdAt: '2026-07-29',
      mfaEnabled: true,
    })
  })
})
