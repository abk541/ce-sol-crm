import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy,
} from '../lib/passwordPolicy'
import {
  PASSWORD_POLICY_MESSAGE as SERVER_PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy as serverPasswordMeetsPolicy,
} from '../../supabase/functions/manage-users/password-policy'

const edgeFunction = readFileSync(
  join(process.cwd(), 'supabase/functions/manage-users/index.ts'),
  'utf8',
)
const adminPage = readFileSync(
  join(process.cwd(), 'src/pages/AdminPage.tsx'),
  'utf8',
)

function functionBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('shared password policy', () => {
  it('matches the exact first-login UI requirements', () => {
    const cases = [
      ['Password1!', true],
      ['ABCDEFG1!', true], // lowercase is not required
      ['Password1 ', true], // UI treats non-alphanumeric as special
      ['Pass1!', false],
      ['password1!', false],
      ['Password!', false],
      ['Password1', false],
    ] as const

    for (const [password, expected] of cases) {
      expect(passwordMeetsPolicy(password)).toBe(expected)
      expect(serverPasswordMeetsPolicy(password)).toBe(expected)
    }
    expect(PASSWORD_POLICY_MESSAGE).toContain('one uppercase letter')
    expect(SERVER_PASSWORD_POLICY_MESSAGE).toBe(PASSWORD_POLICY_MESSAGE)
  })

  it('is enforced before create, reset, and first-login completion', () => {
    expect(edgeFunction).toContain('passwordMeetsPolicy(value)')
    expect(edgeFunction).toContain('from "./password-policy.ts"')
    expect(edgeFunction).not.toContain('../../../src/')
    expect(edgeFunction).not.toContain('requiredString(value, "password"')
    expect(edgeFunction.match(/const password = parsePassword\(/g)).toHaveLength(3)
  })
})

describe('manage-users fail-closed contracts', () => {
  it('does not offer an opt-out from first-login setup when creating a user', () => {
    expect(adminPage).toContain('firstLogin: true')
    expect(adminPage).not.toContain('firstLogin: form.forceFirstLogin')
    expect(adminPage).toContain('{isEdit ? (')
    expect(adminPage).toContain('Every new user must replace the temporary password')
  })

  it('gates the profile before changing Auth during an admin password reset', () => {
    const reset = functionBlock(
      edgeFunction,
      'async function resetPassword(',
      'async function deleteUser(',
    )
    const gateIndex = reset.indexOf('.update({ first_login: true })')
    const authIndex = reset.indexOf('admin.auth.admin.updateUserById')
    const compensationIndex = reset.indexOf('.update({ first_login: false })')

    expect(gateIndex).toBeGreaterThanOrEqual(0)
    expect(authIndex).toBeGreaterThan(gateIndex)
    expect(compensationIndex).toBeGreaterThan(authIndex)
    expect(reset).toContain('if (target.first_login === false)')
    expect(reset).toContain('password_reset_compensation_failed')
    expect(reset).toContain('account remains gated')
  })
})
