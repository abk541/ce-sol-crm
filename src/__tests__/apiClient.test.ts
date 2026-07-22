import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  apiRequest,
  clearApiSession,
  getApiAccessToken,
  getStoredApiSession,
  storeApiSession,
  subscribeToApiAuthEvents,
  subscribeToApiEvents,
} from '../lib/api'

describe('private data API compatibility client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearApiSession({ broadcast: false })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  function mockSuccess(data: unknown = []) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ data, error: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
  }

  it('defaults upserts to the id conflict key used by application tables', async () => {
    const fetchMock = mockSuccess()

    await api.from('opportunities').upsert({ id: 'opp-1', solicitation: 'Test' })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body))).toMatchObject({
      table: 'opportunities',
      rows: { id: 'opp-1', solicitation: 'Test' },
      onConflict: 'id',
    })
  })

  it('preserves an explicit non-id upsert key', async () => {
    const fetchMock = mockSuccess()

    await api.from('app_settings').upsert(
      { key: 'non_sub_grace_hours', value: '4' },
      { onConflict: 'key' },
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body)).onConflict).toBe('key')
  })

  it('converts the one legacy OR expression to a validated filter AST', async () => {
    const fetchMock = mockSuccess()

    await api
      .from('opportunities')
      .select('id')
      .ilike('solicitation_id', 'SOL-1')
      .or('is_deleted.is.null,is_deleted.eq.false')

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body)).orGroups).toEqual([[
      { column: 'is_deleted', operator: 'is', value: null },
      { column: 'is_deleted', operator: 'eq', value: false },
    ]])
  })

  it('keeps returning-row selects on the original mutation endpoint', async () => {
    const fetchMock = mockSuccess([{ id: 'employee-1' }])

    const result = await api
      .from('employees')
      .upsert({ id: 'employee-1', name: 'Employee' })
      .select()

    expect(String(fetchMock.mock.calls[0][0])).toContain('/data/upsert')
    expect(result.data).toEqual([{ id: 'employee-1' }])
  })

  it('waits for the session storage hand-off before notifying another tab', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToApiAuthEvents(listener)
    window.localStorage.setItem('ces-crm-api-token', 'old-token')
    window.localStorage.setItem('ces-crm-api-session', JSON.stringify({ user: { id: 'old-user' } }))

    window.localStorage.setItem('ces-crm-api-token', 'new-token')
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'ces-crm-api-token',
      newValue: 'new-token',
    }))
    expect(listener).not.toHaveBeenCalled()

    const newSession = { user: { id: 'new-user' } }
    window.localStorage.setItem('ces-crm-api-session', JSON.stringify(newSession))
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'ces-crm-api-session',
      newValue: JSON.stringify(newSession),
    }))

    expect(listener).toHaveBeenCalledWith('TOKEN_REFRESHED', newSession)
    unsubscribe()
  })

  it('keeps a valid login usable when localStorage rejects writes', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const session = {
      access_token: 'fallback-token',
      user: { id: 'fallback-user' },
    }

    expect(() => storeApiSession(session)).not.toThrow()
    expect(getApiAccessToken()).toBe('fallback-token')
    expect(getStoredApiSession()).toEqual({ user: { id: 'fallback-user' } })
    expect(window.sessionStorage.getItem('ces-crm-api-session-fallback')).toContain('fallback-token')
    setItem.mockRestore()
  })

  it('uses an in-memory session when the browser blocks all storage writes', () => {
    const localSetItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const sessionSetItem = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })

    expect(() => storeApiSession({
      access_token: 'memory-token',
      user: { id: 'memory-user' },
    })).not.toThrow()
    expect(getApiAccessToken()).toBe('memory-token')
    expect(getStoredApiSession()).toEqual({ user: { id: 'memory-user' } })

    localSetItem.mockRestore()
    sessionSetItem.mockRestore()
  })

  it('does not let a stale 401 response erase a newer login', async () => {
    storeApiSession({ access_token: 'token-a', user: { id: 'user-a' } })
    let resolveRequest!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(resolve => {
      resolveRequest = resolve
    }))

    const staleRequest = apiRequest('/auth/session')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-a')

    storeApiSession({ access_token: 'token-b', user: { id: 'user-b' } })
    resolveRequest(new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))

    await expect(staleRequest).rejects.toMatchObject({ status: 401 })
    expect(getApiAccessToken()).toBe('token-b')
    expect(getStoredApiSession()?.user.id).toBe('user-b')
  })

  it('still clears the session when its own token receives a 401', async () => {
    storeApiSession({ access_token: 'expired-token', user: { id: 'expired-user' } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))

    await expect(apiRequest('/auth/session')).rejects.toMatchObject({ status: 401 })
    expect(getApiAccessToken()).toBeNull()
    expect(getStoredApiSession()).toBeNull()
  })

  it('does not let a stale event-stream 401 erase a newer login', async () => {
    storeApiSession({ access_token: 'stream-token-a', user: { id: 'stream-user-a' } })
    let resolveStream!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(resolve => {
      resolveStream = resolve
    }))

    const unsubscribe = subscribeToApiEvents(vi.fn())
    storeApiSession({ access_token: 'stream-token-b', user: { id: 'stream-user-b' } })
    resolveStream(new Response(null, { status: 401 }))

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getApiAccessToken()).toBe('stream-token-b')
    expect(getStoredApiSession()?.user.id).toBe('stream-user-b')
    unsubscribe()
  })

  it('reconnects the event stream after a clean EOF', async () => {
    vi.useFakeTimers()
    try {
      window.localStorage.setItem('ces-crm-api-token', 'test-token')
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
        new ReadableStream({ start(controller) { controller.close() } }),
        { status: 200 },
      ))

      const unsubscribe = subscribeToApiEvents(vi.fn())
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(3_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })
})
