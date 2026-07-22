export type ApiAuthEvent = 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'

export interface ApiSessionUser {
  id: string
  last_sign_in_at?: string
}

export interface ApiSession {
  access_token?: string
  expires_at?: string
  user: ApiSessionUser
}

export interface ApiErrorPayload {
  code: string
  message: string
  details?: unknown
  hint?: unknown
  status?: number
}

type RequestOptions = {
  auth?: boolean
  responseType?: 'json' | 'blob'
}

const TOKEN_STORAGE_KEY = 'ces-crm-api-token'
const SESSION_STORAGE_KEY = 'ces-crm-api-session'
const SESSION_FALLBACK_STORAGE_KEY = 'ces-crm-api-session-fallback'
const AUTH_BROADCAST_CHANNEL = 'ces-crm-auth'

interface StoredSessionFallback {
  token: string
  session: ApiSession
}

// Some privacy tools and full browser profiles make localStorage readable but
// reject writes. Keep the accepted server session usable in that tab, and use
// sessionStorage as a reload-safe fallback when the browser permits it.
let memoryToken: string | null = null
let memorySession: ApiSession | null = null
let preferMemorySession = false

function normalizeApiUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed) return '/api/v1'
  return trimmed.replace(/\/+$/g, '')
}

export const apiBaseUrl = normalizeApiUrl(import.meta.env.VITE_API_URL as string | undefined)

// A relative default keeps production and local reverse-proxy deployments on
// the same origin. Unlike the previous local-only mode, all durable writes go
// through this API even when VITE_API_URL is omitted.
export const isApiConnected = true

export const apiHost = (() => {
  try {
    if (typeof window !== 'undefined') return new URL(apiBaseUrl, window.location.origin).host
    return new URL(apiBaseUrl).host
  } catch {
    return apiBaseUrl
  }
})()

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window[kind]
  } catch {
    return null
  }
}

function safeStoredSession(raw: string | null): ApiSession | null {
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as ApiSession
    return session?.user?.id ? session : null
  } catch {
    return null
  }
}

function readSessionFallback(): StoredSessionFallback | null {
  const storage = browserStorage('sessionStorage')
  if (!storage) return null
  try {
    const raw = storage.getItem(SESSION_FALLBACK_STORAGE_KEY)
    if (!raw) return null
    const fallback = JSON.parse(raw) as StoredSessionFallback
    if (!fallback?.token || !fallback.session?.user?.id) return null
    return fallback
  } catch {
    return null
  }
}

function removeSessionFallback(): boolean {
  try {
    browserStorage('sessionStorage')?.removeItem(SESSION_FALLBACK_STORAGE_KEY)
    return true
  } catch {
    // Memory or localStorage remains the active session source.
    return false
  }
}

export function getApiAccessToken(): string | null {
  if (preferMemorySession) return memoryToken
  const fallback = readSessionFallback()
  if (fallback) return fallback.token
  try {
    return browserStorage('localStorage')?.getItem(TOKEN_STORAGE_KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function getStoredApiSession(): ApiSession | null {
  if (preferMemorySession) return memorySession
  const fallback = readSessionFallback()
  if (fallback) return fallback.session
  try {
    return safeStoredSession(
      browserStorage('localStorage')?.getItem(SESSION_STORAGE_KEY) ?? null,
    ) ?? memorySession
  } catch {
    return memorySession
  }
}

type AuthListener = (event: ApiAuthEvent, session: ApiSession | null) => void
const authListeners = new Set<AuthListener>()

function notifyAuthListeners(event: ApiAuthEvent, session: ApiSession | null): void {
  authListeners.forEach(listener => listener(event, session))
}

function broadcastAuthEvent(event: ApiAuthEvent, session: ApiSession | null): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
    channel.postMessage({ event, session })
    channel.close()
  } catch {
    // The storage event remains the cross-tab fallback.
  }
}

export function storeApiSession(session: ApiSession, event?: Exclude<ApiAuthEvent, 'SIGNED_OUT'>): void {
  if (!session.user?.id) throw new Error('The API returned an invalid session.')
  const existingToken = getApiAccessToken()
  const token = session.access_token ?? existingToken
  if (!token) throw new Error('The API did not return a session token.')

  const storedSession: ApiSession = {
    ...session,
    access_token: undefined,
  }

  memoryToken = token
  memorySession = storedSession

  let persistedLocally = false
  const localStorage = browserStorage('localStorage')
  if (localStorage) {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession))
      persistedLocally = true
    } catch {
      // Avoid leaving a new token paired with an old session (or vice versa).
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        localStorage.removeItem(SESSION_STORAGE_KEY)
      } catch {
        // The in-memory preference below prevents a stale readable value from
        // replacing the session that the server just accepted in this tab.
      }
    }
  }

  if (persistedLocally) {
    preferMemorySession = !removeSessionFallback()
    if (preferMemorySession) {
      try {
        browserStorage('sessionStorage')?.setItem(
          SESSION_FALLBACK_STORAGE_KEY,
          JSON.stringify({ token, session: storedSession } satisfies StoredSessionFallback),
        )
        preferMemorySession = false
      } catch {
        // Keep the new session authoritative in memory if an old fallback
        // cannot be removed or replaced.
      }
    }
  } else {
    preferMemorySession = true
    const fallbackStorage = browserStorage('sessionStorage')
    if (fallbackStorage) {
      try {
        fallbackStorage.setItem(SESSION_FALLBACK_STORAGE_KEY, JSON.stringify({
          token,
          session: storedSession,
        } satisfies StoredSessionFallback))
      } catch {
        // The current tab can still use the in-memory session. A browser that
        // blocks all storage will require a new login after a page refresh.
      }
    }
  }

  if (event) {
    notifyAuthListeners(event, storedSession)
    broadcastAuthEvent(event, storedSession)
  }
}

export function clearApiSession(options: { broadcast?: boolean } = {}): void {
  memoryToken = null
  memorySession = null
  let localSessionRemoved = true
  const localStorage = browserStorage('localStorage')
  if (localStorage) {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      localSessionRemoved = false
      // In-memory state is still invalidated by the auth event below.
    }
  }
  const fallbackRemoved = removeSessionFallback()
  // If an extension blocks removals, this tab must not fall back to a stale
  // value that remains readable in browser storage.
  preferMemorySession = !localSessionRemoved || !fallbackRemoved
  notifyAuthListeners('SIGNED_OUT', null)
  if (options.broadcast !== false) broadcastAuthEvent('SIGNED_OUT', null)
}

export function subscribeToApiAuthEvents(listener: AuthListener): () => void {
  authListeners.add(listener)

  const onStorage = (event: StorageEvent) => {
    // storeApiSession writes token first and session second. Reacting to the
    // token event can pair a new token with the previous account's session and
    // make an older tab revoke the newly-created session. The session-key event
    // is the atomic hand-off and also covers logout.
    if (event.key !== SESSION_STORAGE_KEY) return
    let token: string | null = null
    let session: ApiSession | null = null
    if (event.newValue) {
      session = safeStoredSession(event.newValue)
      try {
        token = browserStorage('localStorage')?.getItem(TOKEN_STORAGE_KEY) ?? null
      } catch {
        token = null
      }
    }
    memoryToken = token
    memorySession = token && session ? session : null
    const fallbackRemoved = removeSessionFallback()
    preferMemorySession = !fallbackRemoved
    notifyAuthListeners(token && session ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', token ? session : null)
  }

  let channel: BroadcastChannel | null = null
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
      channel.onmessage = event => {
        const payload = event.data as { event?: ApiAuthEvent; session?: ApiSession | null } | null
        if (!payload || !payload.event) return
        notifyAuthListeners(payload.event, payload.session ?? null)
      }
    } catch {
      channel = null
    }
  }

  return () => {
    authListeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    channel?.close()
  }
}

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown
  readonly hint?: unknown

  constructor(payload: Partial<ApiErrorPayload> & { message: string }, status = 0) {
    super(payload.message)
    this.name = 'ApiRequestError'
    this.code = payload.code ?? 'request_failed'
    this.status = payload.status ?? status
    this.details = payload.details
    this.hint = payload.hint
  }
}

function errorPayload(value: unknown, status: number): ApiRequestError {
  const envelope = value && typeof value === 'object' ? value as Record<string, unknown> : null
  const nested = envelope?.error
  const record = nested && typeof nested === 'object'
    ? nested as Record<string, unknown>
    : envelope
  const message = typeof record?.message === 'string' && record.message.trim()
    ? record.message.trim()
    : `Request failed (${status || 'network error'}).`
  return new ApiRequestError({
    code: typeof record?.code === 'string' ? record.code : status === 401 ? 'unauthorized' : 'request_failed',
    message,
    details: record?.details,
    hint: record?.hint,
  }, status)
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  const auth = options.auth !== false
  const requestToken = auth ? getApiAccessToken() : null
  if (auth) {
    if (requestToken) headers.set('Authorization', `Bearer ${requestToken}`)
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', options.responseType === 'blob' ? '*/*' : 'application/json')

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The API could not be reached.'
    throw new ApiRequestError({ code: 'network_error', message }, 0)
  }

  if (options.responseType === 'blob' && response.ok) return await response.blob() as T

  let payload: unknown = null
  const contentType = response.headers.get('content-type') ?? ''
  try {
    payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()
  } catch {
    payload = null
  }

  if (!response.ok) {
    // A request from an older tab/session must never erase a newer token that
    // was stored while that request was in flight.
    if (
      response.status === 401
      && auth
      && requestToken
      && getApiAccessToken() === requestToken
    ) clearApiSession()
    throw errorPayload(payload, response.status)
  }
  return payload as T
}

export function envelopeData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

type FilterOperator = 'eq' | 'neq' | 'ilike' | 'is' | 'in' | 'not.is'

interface DataFilter {
  column: string
  operator: FilterOperator
  value: unknown
}

interface DataOrder {
  column: string
  ascending: boolean
}

interface QueryPayload {
  table: string
  columns?: string
  filters?: DataFilter[]
  orGroups?: DataFilter[][]
  order?: DataOrder[]
  limit?: number
  single?: boolean
  maybeSingle?: boolean
  count?: 'exact'
  head?: boolean
  rows?: Record<string, unknown> | Record<string, unknown>[]
  values?: Record<string, unknown>
  onConflict?: string | string[]
  ignoreDuplicates?: boolean
}

export interface DataResult<T = Record<string, any>[]> {
  data: T | null
  error: ApiErrorPayload | null
  count?: number | null
}

type DataOperation = 'query' | 'insert' | 'upsert' | 'update' | 'delete'

function scalarFromFilter(value: string): unknown {
  if (value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}

function parseOrExpression(expression: string): DataFilter[] {
  return expression.split(',').map(part => {
    const [column, operator, ...valueParts] = part.split('.')
    if (!column || !operator || valueParts.length === 0) {
      throw new Error('Unsupported OR filter expression.')
    }
    if (!['eq', 'neq', 'ilike', 'is', 'in'].includes(operator)) {
      throw new Error(`Unsupported OR filter operator: ${operator}`)
    }
    return {
      column,
      operator: operator as FilterOperator,
      value: scalarFromFilter(valueParts.join('.')),
    }
  })
}

class DataQueryBuilder implements PromiseLike<DataResult> {
  private operation: DataOperation = 'query'
  private payload: QueryPayload

  constructor(table: string) {
    this.payload = { table, filters: [], orGroups: [], order: [] }
  }

  select(columns = '*', options: { count?: 'exact'; head?: boolean } = {}): this {
    this.payload.columns = columns
    this.payload.count = options.count
    this.payload.head = options.head
    return this
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = 'insert'
    this.payload.rows = rows
    return this
  }

  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ): this {
    this.operation = 'upsert'
    this.payload.rows = rows
    this.payload.onConflict = options.onConflict ?? 'id'
    this.payload.ignoreDuplicates = options.ignoreDuplicates
    return this
  }

  update(values: Record<string, unknown>): this {
    this.operation = 'update'
    this.payload.values = values
    return this
  }

  delete(): this {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.payload.filters!.push({ column, operator: 'eq', value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.payload.filters!.push({ column, operator: 'neq', value })
    return this
  }

  ilike(column: string, value: unknown): this {
    this.payload.filters!.push({ column, operator: 'ilike', value })
    return this
  }

  is(column: string, value: unknown): this {
    this.payload.filters!.push({ column, operator: 'is', value })
    return this
  }

  in(column: string, value: unknown[]): this {
    this.payload.filters!.push({ column, operator: 'in', value })
    return this
  }

  not(column: string, operator: 'is', value: unknown): this {
    if (operator !== 'is') throw new Error(`Unsupported NOT filter operator: ${operator}`)
    this.payload.filters!.push({ column, operator: 'not.is', value })
    return this
  }

  or(expression: string): this {
    this.payload.orGroups!.push(parseOrExpression(expression))
    return this
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.payload.order!.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(limit: number): this {
    this.payload.limit = limit
    return this
  }

  single(): this {
    this.payload.single = true
    return this
  }

  maybeSingle(): this {
    this.payload.maybeSingle = true
    return this
  }

  private async execute(): Promise<DataResult> {
    try {
      const result = await apiRequest<DataResult>(`/data/${this.operation}`, {
        method: 'POST',
        body: JSON.stringify(this.payload),
      })
      return {
        data: result?.data ?? null,
        error: result?.error ?? null,
        count: result?.count ?? null,
      }
    } catch (error) {
      const requestError = error instanceof ApiRequestError
        ? error
        : new ApiRequestError({
          code: 'request_failed',
          message: error instanceof Error ? error.message : 'The data request failed.',
        })
      return {
        data: null,
        error: {
          code: requestError.code,
          message: requestError.message,
          details: requestError.details,
          hint: requestError.hint,
          status: requestError.status,
        },
        count: null,
      }
    }
  }

  then<TResult1 = DataResult, TResult2 = never>(
    onfulfilled?: ((value: DataResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

export const api = {
  from(table: string): DataQueryBuilder {
    return new DataQueryBuilder(table)
  },
}

/**
 * Authenticated SSE over fetch so the bearer token never appears in the URL.
 * Reconnects with a small backoff; the application's poll remains the fallback.
 */
export function subscribeToApiEvents(onEvent: () => void): () => void {
  if (typeof window === 'undefined' || typeof ReadableStream === 'undefined') return () => undefined

  let stopped = false
  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let lastEventId = ''

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, 3_000)
  }

  const connect = async () => {
    if (stopped || !getApiAccessToken()) return
    controller = new AbortController()
    try {
      const headers = new Headers({ Accept: 'text/event-stream' })
      const token = getApiAccessToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (lastEventId) headers.set('Last-Event-ID', lastEventId)
      const response = await fetch(`${apiBaseUrl}/events`, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status === 401) {
        if (token && getApiAccessToken() === token) {
          clearApiSession()
        } else {
          // The session changed while this stream was opening. Reconnect with
          // the newer token instead of waiting for the polling fallback.
          scheduleReconnect()
        }
        return
      }
      if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status}).`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const idLine = block.split('\n').find(line => line.startsWith('id:'))
          if (idLine) lastEventId = idLine.slice(3).trim()
          if (block.split('\n').some(line => line.startsWith('data:'))) onEvent()
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) {
        scheduleReconnect()
      }
      return
    }
    // Proxies and server restarts can end an SSE response cleanly. A clean EOF
    // needs the same reconnect behavior as a network exception.
    scheduleReconnect()
  }

  void connect()
  return () => {
    stopped = true
    controller?.abort()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  }
}
