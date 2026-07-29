import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const runtimeScript = readFileSync(
  new URL('../../ops/configure-native-runtime.sh', import.meta.url),
  'utf8',
)

describe('native runtime configuration', () => {
  it('preserves a valid installed MFA encryption key', () => {
    expect(runtimeScript).toContain("mapfile -t existing_mfa_keys")
    expect(runtimeScript).toContain('mfa_encryption_key="${existing_mfa_keys[0]}"')
    expect(runtimeScript).toContain('if [[ -z "${mfa_encryption_key}" ]]')
  })

  it('refuses duplicate or malformed installed keys instead of rotating them', () => {
    expect(runtimeScript).toContain('duplicate MFA_ENCRYPTION_KEY entries')
    expect(runtimeScript).toContain('refusing to rotate it')
    expect(runtimeScript).toContain('is_valid_mfa_encryption_key')
  })

  it('does not silently disable MFA enforcement when rerun', () => {
    expect(runtimeScript).toContain("mapfile -t existing_mfa_flags")
    expect(runtimeScript).toContain(
      "mfa_enforcement_enabled=\"${existing_mfa_flags[0]}\"",
    )
    expect(runtimeScript).toContain(
      "printf 'MFA_ENFORCEMENT_ENABLED=%s\\n' \"${mfa_enforcement_enabled}\"",
    )
  })

  it('preserves and validates installed MFA challenge limits when rerun', () => {
    expect(runtimeScript).toContain("mapfile -t existing_mfa_ttls")
    expect(runtimeScript).toContain(
      "mfa_challenge_ttl_seconds=\"${existing_mfa_ttls[0]}\"",
    )
    expect(runtimeScript).toContain('duplicate MFA_CHALLENGE_TTL_SECONDS entries')
    expect(runtimeScript).toContain('existing MFA_CHALLENGE_TTL_SECONDS value is invalid')
    expect(runtimeScript).toContain("mapfile -t existing_mfa_attempts")
    expect(runtimeScript).toContain(
      "mfa_max_attempts=\"${existing_mfa_attempts[0]}\"",
    )
    expect(runtimeScript).toContain('duplicate MFA_MAX_ATTEMPTS entries')
    expect(runtimeScript).toContain('it must be between 1 and 10')
    expect(runtimeScript).toContain('is_safe_positive_integer')
  })
})
