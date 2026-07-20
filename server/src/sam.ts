import type { FastifyInstance } from 'fastify'
import { requireCompleted } from './auth.js'
import { ApiError, asRecord, assertAllowedKeys, requiredString } from './errors.js'
import type { Dependencies } from './types.js'

interface SamReference {
  noticeId?: string
  solicitationNumber?: string
}

function invalidUrl(): never {
  throw new ApiError(
    400,
    'invalid_sam_url',
    'Could not parse the SAM.gov URL. Paste the full URL from the opportunity page.',
  )
}

export function parseSamReference(value: unknown): SamReference {
  const rawUrl = requiredString(value, 'url', 2048)
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    invalidUrl()
  }
  const host = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || (host !== 'sam.gov' && !host.endsWith('.sam.gov'))) invalidUrl()

  const noticeId = parsed.pathname.match(/\/opp\/([a-f0-9]{32})(?:\/|$)/i)?.[1]
  if (noticeId) return { noticeId: noticeId.toLowerCase() }
  const segments = parsed.pathname.split('/').filter(Boolean)
  const tail = segments.at(-1)?.toLowerCase() === 'view' ? segments.at(-2) : segments.at(-1)
  const solicitationNumber = (parsed.searchParams.get('q') ?? tail ?? '').trim()
  if (
    solicitationNumber.length < 3
    || solicitationNumber.length > 128
    || !/\d/.test(solicitationNumber)
    || /[\u0000-\u001f\u007f]/.test(solicitationNumber)
  ) invalidUrl()
  return { solicitationNumber }
}

function formatDate(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`
}

function postedRange(now: Date): { postedFrom: string; postedTo: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const end = new Date(Date.UTC(value('year'), value('month') - 1, value('day'), 12))
  const start = new Date(end)
  start.setUTCFullYear(end.getUTCFullYear() - 1)
  start.setUTCDate(start.getUTCDate() + 1)
  return { postedFrom: formatDate(start), postedTo: formatDate(end) }
}

function upstreamUrl(reference: SamReference, key: string, now: Date): string {
  const params = new URLSearchParams({ limit: '1', offset: '0', api_key: key, ...postedRange(now) })
  if (reference.noticeId) params.set('noticeid', reference.noticeId)
  else params.set('solnum', reference.solicitationNumber as string)
  return `https://api.sam.gov/opportunities/v2/search?${params.toString()}`
}

export function sanitizeSecret(value: unknown, secret: string): unknown {
  if (typeof value === 'string') return secret ? value.replaceAll(secret, '[redacted]') : value
  if (Array.isArray(value)) return value.map((entry) => sanitizeSecret(entry, secret))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/^api[_-]?key$/i.test(key))
        .map(([key, entry]) => [key, sanitizeSecret(entry, secret)]),
    )
  }
  return value
}

async function requireImportPermission(dependencies: Dependencies, accountId: string): Promise<void> {
  const result = await dependencies.db.query<{ allowed: boolean }>(
    "select private.effective_permission_for_auth_user($1, 'opportunity:create') as allowed",
    [accountId],
  )
  if (result.rows[0]?.allowed !== true) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to import opportunities.')
  }
}

async function responseText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(502, 'upstream_response_too_large', 'SAM.gov returned an unexpectedly large response.')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new ApiError(502, 'upstream_response_too_large', 'SAM.gov returned an unexpectedly large response.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(combined)
}

async function importOpportunity(reference: SamReference, dependencies: Dependencies): Promise<Record<string, unknown>> {
  const key = dependencies.env.samGovApiKey
  if (!key) throw new ApiError(503, 'integration_not_configured', 'The SAM.gov integration is not configured.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), dependencies.env.samGovTimeoutMs)
  let response: Response
  try {
    response = await dependencies.fetch(upstreamUrl(reference, key, dependencies.now()), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(504, 'upstream_unavailable', 'SAM.gov did not respond in time. Try again.')
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 429) {
    throw new ApiError(429, 'rate_limited', 'SAM.gov rate limit reached. Wait a few minutes, then try again.')
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(502, 'integration_rejected', 'SAM.gov rejected the server integration credentials.')
  }
  if (!response.ok) throw new ApiError(502, 'upstream_error', 'SAM.gov could not complete the request. Try again.')
  const raw = await responseText(response, dependencies.env.samGovMaxResponseBytes)
  let payload: Record<string, unknown>
  try {
    payload = asRecord(JSON.parse(raw), 'SAM.gov response')
  } catch (error) {
    if (error instanceof ApiError && error.code === 'upstream_response_too_large') throw error
    throw new ApiError(502, 'invalid_upstream_response', 'SAM.gov returned an invalid response.')
  }
  const opportunities = payload.opportunitiesData
  const opportunity = Array.isArray(opportunities) ? opportunities[0] : null
  if (!opportunity || typeof opportunity !== 'object' || Array.isArray(opportunity)) {
    throw new ApiError(404, 'opportunity_not_found', 'Opportunity not found on SAM.gov. Check the URL.')
  }
  return sanitizeSecret(opportunity, key) as Record<string, unknown>
}

export function registerSamRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.get(
    '/api/v1/integrations/sam/status',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async () => ({ configured: dependencies.env.samGovApiKey.length > 0 }),
  )
  app.post(
    '/api/v1/integrations/sam/import',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const body = asRecord(request.body)
      assertAllowedKeys(body, ['url'])
      await requireImportPermission(dependencies, request.auth?.accountId as string)
      return { opportunity: await importOpportunity(parseSamReference(body.url), dependencies) }
    },
  )
}
