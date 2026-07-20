import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  subscribeToApiAuthEvents,
  subscribeToApiEvents,
} from '../lib/api'

describe('private data API compatibility client', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
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
