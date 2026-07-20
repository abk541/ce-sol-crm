import { EventEmitter } from 'node:events'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { requireCompleted } from './auth.js'
import type { Dependencies } from './types.js'

interface OutboxEvent {
  id: string
  topic: string
  entity_id: string | null
  created_at: Date
}

function eventFrame(event: OutboxEvent): string {
  return `id: ${event.id}\nevent: change\ndata: ${JSON.stringify({
    id: Number(event.id),
    topic: event.topic,
    entityId: event.entity_id,
    createdAt: new Date(event.created_at).toISOString(),
  })}\n\n`
}

/**
 * One LISTEN connection fans notifications out to every SSE response. A
 * connection per browser would exhaust a ten-slot query pool before all 16
 * current accounts connect. The hub reconnects with bounded backoff and the
 * per-subscriber outbox cursor makes missed notifications harmless.
 */
class EventHub extends EventEmitter {
  private client: PoolClient | null = null
  private connecting: Promise<void> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private stopped = false
  private retryMs = 1_000

  constructor(private readonly dependencies: Dependencies) {
    super()
    this.setMaxListeners(0)
  }

  async start(): Promise<void> {
    if (this.stopped || this.client) return
    if (this.connecting) return this.connecting
    this.connecting = this.connect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connect(): Promise<void> {
    try {
      const client = await this.dependencies.db.connect()
      if (this.stopped) {
        client.release()
        return
      }
      this.client = client
      const lost = (error?: Error) => this.connectionLost(client, error)
      client.on('notification', () => this.emit('change'))
      client.once('error', lost)
      client.once('end', () => lost())
      await client.query('listen app_events')
      this.retryMs = 1_000
      this.emit('change')
    } catch (error) {
      this.dependencies.db.emit('eventHubError', error)
      this.scheduleReconnect()
    }
  }

  private connectionLost(client: PoolClient, error?: Error): void {
    if (client !== this.client) return
    this.client = null
    client.release(error)
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.start()
    }, this.retryMs)
    this.reconnectTimer.unref()
    this.retryMs = Math.min(this.retryMs * 2, 30_000)
  }

  async close(): Promise<void> {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const client = this.client
    this.client = null
    if (client) {
      await client.query('unlisten app_events').catch(() => undefined)
      client.release()
    }
    this.removeAllListeners()
  }
}

export function registerEventRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  const hub = new EventHub(dependencies)
  app.addHook('onClose', async () => hub.close())

  app.get(
    '/api/v1/events',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request, reply) => {
      reply.hijack()
      const response = reply.raw
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      response.write(': connected\n\n')

      let lastId = Number(request.headers['last-event-id'] ?? 0)
      if (!Number.isSafeInteger(lastId) || lastId < 0) lastId = 0
      let closed = false
      let sending = false

      const sendAvailable = async () => {
        if (closed || sending) return
        sending = true
        try {
          const result = await dependencies.db.query<OutboxEvent>(
            `select id::text, topic, entity_id, created_at
               from app_events.outbox
              where id > $1
              order by id
              limit 500`,
            [lastId],
          )
          for (const event of result.rows) {
            if (closed) break
            response.write(eventFrame(event))
            lastId = Number(event.id)
          }
        } catch (error) {
          request.log.warn({ err: error }, 'SSE event delivery failed')
        } finally {
          sending = false
        }
      }

      const heartbeat = setInterval(() => {
        if (!closed) response.write(': keepalive\n\n')
      }, 20_000)
      heartbeat.unref()

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        hub.off('change', sendAvailable)
      }
      request.raw.once('close', close)
      response.once('close', close)
      hub.on('change', sendAvailable)
      await hub.start().catch((error) => request.log.warn({ err: error }, 'SSE listener unavailable'))
      await sendAvailable()
    },
  )
}

export const __test = { eventFrame }
