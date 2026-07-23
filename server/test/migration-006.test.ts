import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/006_pipeline_activation_setting.sql', import.meta.url),
  'utf8',
)

describe('pipeline activation setting migration', () => {
  it('extends the browser-safe constraint and preserves an existing choice', () => {
    expect(migration).toContain('app_settings_known_non_secret_key')
    expect(migration).toContain("'require_associate_for_active_pipeline'")
    expect(migration).toContain("values ('require_associate_for_active_pipeline', 'true')")
    expect(migration).toContain('on conflict (key) do nothing')
    expect(migration).not.toContain('do update')
  })
})
