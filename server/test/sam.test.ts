import { describe, expect, it, vi } from 'vitest'
import type { Database, Queryable } from '../src/db.js'
import { buildApp, SENSITIVE_LOG_PATHS } from '../src/app.js'
import { loadEnvironment } from '../src/env.js'
import {
  parseSamReference,
  resolveSamGovCredential,
  sanitizeSecret,
} from '../src/sam.js'

function result(rows: Record<string, unknown>[] = []) {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }
}

function queryable(
  handler: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[],
): Queryable {
  return {
    async query(text, values) {
      return result(handler(text, values))
    },
  } as Queryable
}

const TOKEN = 's'.repeat(48)
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ROW = {
  session_id: '22222222-2222-4222-8222-222222222222',
  account_id: ACCOUNT_ID,
  session_created_at: new Date('2026-07-29T10:00:00.000Z'),
  expires_at: new Date('2026-07-30T10:00:00.000Z'),
  password_version: 1,
  current_password_version: 1,
  id: '33333333-3333-4333-8333-333333333333',
  auth_user_id: ACCOUNT_ID,
  name: 'Admin User',
  email: 'admin@example.test',
  username: 'admin',
  role: 'CAPTURE_MANAGER',
  avatar: null,
  status: 'active',
  first_login: false,
  mfa_enabled: false,
  created_at: new Date('2026-07-01T10:00:00.000Z'),
  team: null,
  manager_id: null,
}

interface HarnessOptions {
  admin?: boolean
  importAllowed?: boolean
  storedKey?: string | null
  environmentKey?: string
  fetch?: typeof globalThis.fetch
}

function harness(options: HarnessOptions = {}) {
  const queries: { text: string; values?: readonly unknown[] }[] = []
  let storedKey = options.storedKey ?? null
  const handleQuery = async (text: string, values?: readonly unknown[]) => {
    queries.push({ text, values })
    if (
      text === 'begin'
      || text === 'commit'
      || text === 'rollback'
      || text.includes("set_config('app.account_id'")
    ) return result()
    if (text.includes('from app_auth.sessions')) return result([SESSION_ROW])
    if (text.includes('private.effective_permission_for_auth_user')) {
      const allowed = text.includes("'opportunity:create'")
        ? options.importAllowed !== false
        : options.admin !== false
      return result([{ allowed }])
    }
    if (text.includes('select secret_value') && text.includes('private.integration_secrets')) {
      return result(storedKey ? [{ secret_value: storedKey }] : [])
    }
    if (text.includes('insert into private.integration_secrets')) {
      storedKey = String(values?.[1] ?? '')
      return result()
    }
    if (text.includes('delete from private.integration_secrets')) {
      storedKey = null
      return result()
    }
    throw new Error(`Unexpected query: ${text}`)
  }
  const client = {
    query: handleQuery,
    release: () => undefined,
  }
  const db = {
    query: handleQuery,
    connect: async () => client,
    end: async () => undefined,
  } as unknown as Database
  const dependencies = {
    env: loadEnvironment({
      DATABASE_URL: 'postgresql://example.invalid/app',
      ALLOWED_ORIGINS: 'https://crm.example.test',
      LOG_LEVEL: 'silent',
      SAM_GOV_API_KEY: options.environmentKey ?? '',
    }),
    db,
    fetch: options.fetch ?? globalThis.fetch,
    now: () => new Date('2026-07-29T12:00:00.000Z'),
  }
  return {
    dependencies,
    queries,
    storedKey: () => storedKey,
  }
}

describe('SAM.gov boundary', () => {
  it('accepts only an HTTPS SAM.gov host', () => {
    expect(parseSamReference('https://sam.gov/opp/0123456789abcdef0123456789abcdef/view')).toEqual({
      noticeId: '0123456789abcdef0123456789abcdef',
    })
    expect(() => parseSamReference('https://sam.gov.evil.example/opp/0123456789abcdef0123456789abcdef/view'))
      .toThrow(/SAM.gov URL/)
    expect(() => parseSamReference('http://sam.gov/opp/0123456789abcdef0123456789abcdef/view'))
      .toThrow(/SAM.gov URL/)
  })

  it('redacts the configured secret recursively', () => {
    expect(sanitizeSecret({ api_key: 'secret', message: 'bad secret', nested: ['secret'] }, 'secret')).toEqual({
      message: 'bad [redacted]',
      nested: ['[redacted]'],
    })
  })

  it('prefers the private stored credential and falls back to the environment', async () => {
    await expect(resolveSamGovCredential(
      queryable(() => [{ secret_value: 'stored-secret' }]),
      'environment-secret',
    )).resolves.toEqual({ secret: 'stored-secret', source: 'stored' })
    await expect(resolveSamGovCredential(
      queryable(() => []),
      'environment-secret',
    )).resolves.toEqual({ secret: 'environment-secret', source: 'environment' })
    await expect(resolveSamGovCredential(
      queryable(() => []),
      '',
    )).resolves.toEqual({ secret: '', source: null })
  })

  it('keeps the environment fallback available during a rolling migration', async () => {
    const missingStore = {
      async query() {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' })
      },
    } as Queryable
    await expect(resolveSamGovCredential(
      missingStore,
      'environment-secret',
    )).resolves.toEqual({ secret: 'environment-secret', source: 'environment' })
  })

  it('redacts SAM credential fields defensively from structured logs', () => {
    expect(SENSITIVE_LOG_PATHS).toEqual(expect.arrayContaining([
      'body.apiKey',
      'apiKey',
      '*.apiKey',
      'body.api_key',
      'api_key',
      '*.api_key',
    ]))
  })
})

describe('SAM.gov integration administration', () => {
  it('denies status to non-administrators before reading the private secret', async () => {
    const test = harness({ admin: false, storedKey: 'server-secret' })
    const app = await buildApp(test.dependencies)
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/sam/status',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('forbidden')
    expect(response.body).not.toContain('server-secret')
    expect(test.queries.some(({ text }) => text.includes('select secret_value'))).toBe(false)
    await app.close()
  })

  it('returns only safe status metadata to an administrator', async () => {
    const test = harness({ storedKey: 'server-secret' })
    const app = await buildApp(test.dependencies)
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/sam/status',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ configured: true, source: 'stored' })
    expect(response.body).not.toContain('server-secret')
    await app.close()
  })

  it('rejects a non-admin key write without touching the credential table', async () => {
    const test = harness({ admin: false, storedKey: 'original-secret' })
    const app = await buildApp(test.dependencies)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/sam/settings',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { action: 'configure', apiKey: 'attacker-secret' },
    })

    expect(response.statusCode).toBe(403)
    expect(test.storedKey()).toBe('original-secret')
    expect(test.queries.some(({ text }) => text.includes('insert into private.integration_secrets'))).toBe(false)
    expect(response.body).not.toContain('attacker-secret')
    await app.close()
  })

  it('saves a replacement without returning it and can clear back to the environment fallback', async () => {
    const test = harness({ environmentKey: 'environment-secret' })
    const app = await buildApp(test.dependencies)
    const saved = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/sam/settings',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { action: 'configure', apiKey: 'new-server-secret' },
    })

    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toEqual({ configured: true, source: 'stored' })
    expect(saved.body).not.toContain('new-server-secret')
    expect(test.storedKey()).toBe('new-server-secret')

    const cleared = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/sam/settings',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { action: 'clear' },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toEqual({ configured: true, source: 'environment' })
    expect(cleared.body).not.toContain('environment-secret')
    expect(test.storedKey()).toBeNull()
    await app.close()
  })

  it('uses the private stored key for imports and strips it from upstream data', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      opportunitiesData: [{
        title: 'Safe opportunity',
        api_key: 'stored-import-secret',
        description: 'must not echo stored-import-secret',
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const test = harness({
      storedKey: 'stored-import-secret',
      environmentKey: 'environment-secret',
      fetch: upstream as typeof globalThis.fetch,
    })
    const app = await buildApp(test.dependencies)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/sam/import',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { url: 'https://sam.gov/opp/0123456789abcdef0123456789abcdef/view' },
    })

    expect(response.statusCode).toBe(200)
    const calledUrl = new URL(String(upstream.mock.calls[0]?.[0]))
    expect(calledUrl.searchParams.get('api_key')).toBe('stored-import-secret')
    expect(response.body).not.toContain('stored-import-secret')
    expect(response.body).not.toContain('environment-secret')
    expect(response.json()).toEqual({
      opportunity: {
        title: 'Safe opportunity',
        description: 'must not echo [redacted]',
      },
    })
    await app.close()
  })
})
