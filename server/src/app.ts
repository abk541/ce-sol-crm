import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { initializeMfaEnforcement, registerAuthRoutes } from './auth.js'
import { registerAdminUserRoutes } from './admin-users.js'
import { registerDataRoutes } from './data.js'
import { registerEventRoutes } from './events.js'
import { installErrorHandler, ApiError } from './errors.js'
import { registerFileRoutes } from './files.js'
import { registerSamRoutes } from './sam.js'
import { registerOpportunityWorkflowRoutes } from './opportunity-workflows.js'
import { registerNotificationRoutes } from './notifications.js'
import { registerDeletionReviewRoutes } from './deletion-reviews.js'
import { registerMfaRoutes } from './mfa-routes.js'
import type { Dependencies } from './types.js'

export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'request.headers.authorization',
  'headers.authorization',
  'body.password',
  'password',
  '*.password',
  'body.apiKey',
  'apiKey',
  '*.apiKey',
  'body.api_key',
  'api_key',
  '*.api_key',
  '*.access_token',
  'access_token',
  'body.code',
  'code',
  '*.code',
  'body.recoveryCode',
  'recoveryCode',
  '*.recoveryCode',
  'body.mfaSecret',
  'mfaSecret',
  '*.mfaSecret',
  'body.secret',
  'secret',
  '*.secret',
  'body.manualKey',
  'manualKey',
  '*.manualKey',
  'body.otpauthUrl',
  'otpauthUrl',
  '*.otpauthUrl',
  'body.challengeToken',
  'challengeToken',
  '*.challengeToken',
  'body.recoveryCodes',
  'recoveryCodes',
  '*.recoveryCodes',
] as const

export async function buildApp(dependencies: Dependencies): Promise<FastifyInstance> {
  await initializeMfaEnforcement(dependencies)
  const app = Fastify({
    logger: {
      level: dependencies.env.logLevel,
      redact: {
        paths: [...SENSITIVE_LOG_PATHS],
        censor: '[redacted]',
      },
    },
    trustProxy: dependencies.env.trustProxy,
    bodyLimit: 1024 * 1024,
    // Cached clients still use /files/:encodedPath. Match the file handler's
    // decoded 1,024-character limit while retaining the router's length guard.
    routerOptions: {
      maxParamLength: 1024,
    },
    requestIdHeader: false,
  })

  app.decorateRequest('auth', null)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }
      let normalized: string
      try {
        normalized = new URL(origin).origin
      } catch {
        callback(new ApiError(403, 'origin_denied', 'This request origin is not allowed.'), false)
        return
      }
      callback(
        normalized === origin && dependencies.env.allowedOrigins.has(normalized)
          ? null
          : new ApiError(403, 'origin_denied', 'This request origin is not allowed.'),
        normalized === origin && dependencies.env.allowedOrigins.has(normalized),
      )
    },
    credentials: false,
    allowedHeaders: ['authorization', 'content-type', 'last-event-id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  })
  await app.register(rateLimit, { global: false })
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 3,
      parts: 4,
      fileSize: dependencies.env.maxUploadBytes,
    },
  })

  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async () => {
    try {
      await dependencies.db.query('select 1')
      return { status: 'ok', database: 'reachable' }
    } catch {
      throw new ApiError(503, 'database_unavailable', 'The database is not reachable.')
    }
  })
  app.get('/api/v1/health', async () => {
    try {
      await dependencies.db.query('select 1')
      return { status: 'ok', database: 'reachable' }
    } catch {
      throw new ApiError(503, 'database_unavailable', 'The database is not reachable.')
    }
  })

  registerAuthRoutes(app, dependencies)
  registerMfaRoutes(app, dependencies)
  registerDataRoutes(app, dependencies)
  registerOpportunityWorkflowRoutes(app, dependencies)
  registerNotificationRoutes(app, dependencies)
  registerDeletionReviewRoutes(app, dependencies)
  registerAdminUserRoutes(app, dependencies)
  registerFileRoutes(app, dependencies)
  registerSamRoutes(app, dependencies)
  registerEventRoutes(app, dependencies)

  app.setNotFoundHandler((request) => {
    throw new ApiError(404, 'not_found', `No API route matches ${request.method} ${request.url}.`)
  })
  installErrorHandler((handler) => app.setErrorHandler(handler))
  return app
}
