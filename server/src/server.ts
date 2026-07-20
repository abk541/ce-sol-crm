import { mkdir } from 'node:fs/promises'
import { buildApp } from './app.js'
import { createPool } from './db.js'
import { loadEnvironment } from './env.js'

const env = loadEnvironment()
const db = createPool(env.databaseUrl)
const app = await buildApp({ env, db, fetch: globalThis.fetch, now: () => new Date() })

await mkdir(env.attachmentsDir, { recursive: true, mode: 0o700 })

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'graceful shutdown started')
  const forcedExit = setTimeout(() => process.exit(1), 15_000)
  forcedExit.unref()
  try {
    await app.close()
    await db.end()
    clearTimeout(forcedExit)
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'graceful shutdown failed')
    process.exit(1)
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

try {
  await app.listen({ host: env.host, port: env.port })
} catch (error) {
  app.log.fatal({ err: error }, 'API startup failed')
  await db.end().catch(() => undefined)
  process.exit(1)
}
