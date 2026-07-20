import type { FastifyReply, FastifyRequest } from 'fastify'

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly hint: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ErrorEnvelope {
  data: null
  error: {
    code: string
    message: string
    details: unknown
    hint: string | null
    requestId: string
  }
}

export function errorEnvelope(request: FastifyRequest, error: ApiError): ErrorEnvelope {
  return {
    data: null,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      requestId: request.id,
    },
  }
}

export function installErrorHandler(
  setHandler: (handler: (error: Error, request: FastifyRequest, reply: FastifyReply) => void) => void,
): void {
  setHandler((error, request, reply) => {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError(500, 'internal_error', 'The server could not complete this request.')

    if (!(error instanceof ApiError)) {
      request.log.error({ err: error }, 'unhandled request error')
    }
    void reply.code(apiError.statusCode).send(errorEnvelope(request, apiError))
  })
}

export function asRecord(value: unknown, label = 'request'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', `${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label = 'request',
): void {
  const allowedSet = new Set(allowed)
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key))
  if (unexpected.length > 0) {
    throw new ApiError(
      400,
      'invalid_request',
      `${label} contains unsupported field(s): ${unexpected.join(', ')}.`,
    )
  }
}

export function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'invalid_request', `${label} is required.`)
  }
  const result = value.trim()
  if (result.length > maxLength) {
    throw new ApiError(400, 'invalid_request', `${label} is too long.`)
  }
  return result
}
