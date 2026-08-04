import { getAllowedOrigins } from './middleware'

const DEFAULT_JSON_BODY_BYTES = 2 * 1024 * 1024
const DEFAULT_MULTIPART_BODY_BYTES = 120 * 1024 * 1024
const DEFAULT_OTHER_BODY_BYTES = 8 * 1024 * 1024

export interface RequestGuardConfig {
  maxJsonBodyBytes: number
  maxMultipartBodyBytes: number
  maxOtherBodyBytes: number
  csrfRequireOrigin: boolean
}

export interface RequestGuardRejection {
  status: 403 | 413
  code: 'CSRF_ORIGIN_INVALID' | 'REQUEST_TOO_LARGE'
  message: string
  details?: Record<string, number | string>
}

export class RequestBodyTooLargeError extends Error {
  readonly code = 'REQUEST_TOO_LARGE'
  readonly status = 413

  constructor(readonly limit: number, readonly bytesRead: number) {
    super('Request body exceeds the configured size limit')
    this.name = 'RequestBodyTooLargeError'
  }
}

export function readRequestGuardConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): RequestGuardConfig {
  return {
    maxJsonBodyBytes: positiveInteger(source['API_MAX_JSON_BODY_BYTES'], DEFAULT_JSON_BODY_BYTES, 'API_MAX_JSON_BODY_BYTES'),
    maxMultipartBodyBytes: positiveInteger(source['API_MAX_MULTIPART_BODY_BYTES'], DEFAULT_MULTIPART_BODY_BYTES, 'API_MAX_MULTIPART_BODY_BYTES'),
    maxOtherBodyBytes: positiveInteger(source['API_MAX_OTHER_BODY_BYTES'], DEFAULT_OTHER_BODY_BYTES, 'API_MAX_OTHER_BODY_BYTES'),
    csrfRequireOrigin: source['CSRF_REQUIRE_ORIGIN']?.trim().toLowerCase() === 'true',
  }
}

export function validateRequestGuards(
  request: Request,
  config: RequestGuardConfig,
  allowedOrigins: readonly string[] = getAllowedOrigins(),
): RequestGuardRejection | undefined {
  const bodyRejection = validateContentLength(request, config)
  if (bodyRejection !== undefined) return bodyRejection

  if (hasSessionCookie(request) && isUnsafeMethod(request.method)) {
    const csrfRejection = validateCsrfOrigin(request, allowedOrigins, config.csrfRequireOrigin)
    if (csrfRejection !== undefined) return csrfRejection
  }

  return undefined
}

export function validateContentLength(
  request: Request,
  config: RequestGuardConfig,
): RequestGuardRejection | undefined {
  const header = request.headers.get('content-length')
  if (header === null || header.trim().length === 0) return undefined
  const contentLength = Number(header)
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return {
      status: 413,
      code: 'REQUEST_TOO_LARGE',
      message: 'Request Content-Length is invalid or too large',
    }
  }

  const limit = bodyLimitFor(request, config)
  if (contentLength <= limit) return undefined
  return {
    status: 413,
    code: 'REQUEST_TOO_LARGE',
    message: 'Request body exceeds the configured size limit',
    details: { contentLength, limit },
  }
}

/**
 * Replace a request body with a counting stream so chunked requests are held
 * to the same limit as requests that provide Content-Length. The original
 * Request is returned when there is no body; callers can safely assign the
 * returned Request to the Elysia context before its parser runs.
 */
export function wrapRequestBodyWithLimit(request: Request, config: RequestGuardConfig): Request {
  if (request.body === null || request.method === 'GET' || request.method === 'HEAD') return request

  const limit = bodyLimitFor(request, config)
  let bytesRead = 0
  const limitedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength
      if (bytesRead > limit) {
        controller.error(new RequestBodyTooLargeError(limit, bytesRead))
        return
      }
      controller.enqueue(chunk)
    },
  }))

  return new Request(request, {
    body: limitedBody,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

export function validateCsrfOrigin(
  request: Request,
  allowedOrigins: readonly string[],
  requireOrigin: boolean,
): RequestGuardRejection | undefined {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const candidate = origin ?? referer

  if (candidate === null) {
    return requireOrigin ? csrfRejection('A trusted Origin or Referer header is required') : undefined
  }
  if (candidate === 'null' || !matchesAllowedOrigin(candidate, allowedOrigins)) {
    return csrfRejection('The request origin is not allowed')
  }
  return undefined
}

export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie')
  return cookie?.split(';').some(part => part.trim().startsWith('bailian_studio_session=')) === true
}

function bodyLimitFor(request: Request, config: RequestGuardConfig): number {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.startsWith('application/json')) return config.maxJsonBodyBytes
  if (contentType.startsWith('multipart/form-data')) return config.maxMultipartBodyBytes
  return config.maxOtherBodyBytes
}

function matchesAllowedOrigin(candidate: string, allowedOrigins: readonly string[]): boolean {
  try {
    const candidateOrigin = new URL(candidate).origin
    return allowedOrigins.some(allowed => {
      try {
        return new URL(allowed).origin === candidateOrigin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

function csrfRejection(message: string): RequestGuardRejection {
  return { status: 403, code: 'CSRF_ORIGIN_INVALID', message }
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const normalized = value?.trim()
  if (normalized === undefined || normalized.length === 0) return fallback
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer / ${name} 必须是正整数`)
  }
  return parsed
}

function isUnsafeMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}
