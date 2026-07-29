import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApiSession } from '../lib/api'
import {
  clearStoredSamGovApiKey,
  configureSamGovApiKey,
  getSamGovImportStatus,
} from '../lib/samGov'

function response(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('SAM.gov admin settings client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearApiSession({ broadcast: false })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('accepts status metadata without retaining unexpected response fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      configured: true,
      source: 'stored',
      apiKey: 'must-not-be-exposed-by-client-code',
    }))

    await expect(getSamGovImportStatus()).resolves.toEqual({
      configured: true,
      source: 'stored',
    })
  })

  it('sends a one-time authenticated settings write and never persists the key in browser storage', async () => {
    const secret = 'manual-sam-key-123'
    const localWrite = vi.spyOn(window.localStorage, 'setItem')
    const sessionWrite = vi.spyOn(window.sessionStorage, 'setItem')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      configured: true,
      source: 'stored',
    }))

    await expect(configureSamGovApiKey(`  ${secret}  `)).resolves.toEqual({
      configured: true,
      source: 'stored',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/integrations/sam/settings')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      action: 'configure',
      apiKey: secret,
    })
    expect(localWrite.mock.calls.some((call) => call.some(value => String(value).includes(secret)))).toBe(false)
    expect(sessionWrite.mock.calls.some((call) => call.some(value => String(value).includes(secret)))).toBe(false)
  })

  it('clears only the stored override without sending a credential value', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      configured: true,
      source: 'environment',
    }))

    await expect(clearStoredSamGovApiKey()).resolves.toEqual({
      configured: true,
      source: 'environment',
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'clear' })
  })

  it('keeps the Admin form ephemeral and password-masked', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/AdminPage.tsx'), 'utf8')
    const start = source.indexOf('// Integrations tab.')
    const end = source.indexOf('const refreshRemoteCounts', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const integrationState = source.slice(start, end)

    expect(integrationState).toContain("useState('')")
    expect(integrationState).toContain("setSamGovApiKey('')")
    expect(integrationState).not.toContain('localStorage')
    expect(integrationState).not.toContain('sessionStorage')
    expect(source).toContain("type={samGovKeyVisible ? 'text' : 'password'}")
    expect(source).toContain('autoComplete="off"')
  })
})
