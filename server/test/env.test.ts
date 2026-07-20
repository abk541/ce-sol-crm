import { describe, expect, it } from 'vitest'
import { loadEnvironment } from '../src/env.js'

describe('environment validation', () => {
  it('normalizes an exact origin allowlist', () => {
    const env = loadEnvironment({
      DATABASE_URL: 'postgresql://example.invalid/app',
      ALLOWED_ORIGINS: 'https://crm.example.test,https://backup.example.test/path',
    })
    expect([...env.allowedOrigins]).toEqual([
      'https://crm.example.test',
      'https://backup.example.test',
    ])
  })

  it('requires a database URL and rejects invalid numbers', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/)
    expect(() => loadEnvironment({ DATABASE_URL: 'postgresql://x/y', PORT: '0' })).toThrow(/PORT/)
  })
})
