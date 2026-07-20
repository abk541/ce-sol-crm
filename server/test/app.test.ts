import { describe, expect, it } from 'vitest'
import type { Database } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/env.js'

function dependencies(query: () => Promise<unknown>) {
  return {
    env: loadEnvironment({
      DATABASE_URL: 'postgresql://example.invalid/app',
      ALLOWED_ORIGINS: 'https://crm.example.test',
      LOG_LEVEL: 'silent',
    }),
    db: { query, end: async () => undefined } as unknown as Database,
    fetch: globalThis.fetch,
    now: () => new Date('2026-07-20T12:00:00.000Z'),
  }
}

describe('HTTP shell', () => {
  it('exposes separate live and database readiness checks', async () => {
    const app = await buildApp(dependencies(async () => ({ rows: [{ '?column?': 1 }] })))
    const live = await app.inject({ method: 'GET', url: '/health/live' })
    const ready = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(live.statusCode).toBe(200)
    expect(ready.json()).toEqual({ status: 'ok', database: 'reachable' })
    await app.close()
  })

  it('returns structured errors without leaking internals', async () => {
    const app = await buildApp(dependencies(async () => { throw new Error('database secret') }))
    const ready = await app.inject({ method: 'GET', url: '/health/ready' })
    const body = ready.json()
    expect(ready.statusCode).toBe(503)
    expect(body.error.code).toBe('database_unavailable')
    expect(JSON.stringify(body)).not.toContain('database secret')
    await app.close()
  })

  it('denies browser origins outside the exact allowlist', async () => {
    const app = await buildApp(dependencies(async () => ({ rows: [] })))
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { origin: 'https://crm.example.test.evil.invalid' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('origin_denied')
    await app.close()
  })
})
