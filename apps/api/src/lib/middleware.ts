/**
 * Cross-cutting HTTP middleware helpers: security response headers and CORS.
 *
 * Full authentication/authorization is deferred until there is a user model;
 * these are the production prerequisites that don't depend on one.
 */

/**
 * Security headers applied to every response.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

/**
 * Allowed CORS origins, from CORS_ALLOWED_ORIGINS (comma-separated) with a
 * localhost default for local web-app development.
 */
export function getAllowedOrigins(source: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const raw = source['CORS_ALLOWED_ORIGINS']
  const defaults = ['http://localhost:5002']
  if (raw === undefined || raw.length === 0) return defaults
  return raw.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
}

// ---------------------------------------------------------------------------
// Request identity + access logging.
//
// Each request gets a requestId (echoing an inbound x-request-id when the
// caller supplies one, otherwise a fresh UUID) and a start timestamp. These
// are carried between onRequest and onAfterResponse via a WeakMap keyed by the
// Request object, which avoids Elysia .state typing and is GC-friendly.
// ---------------------------------------------------------------------------

export interface RequestTrace {
  requestId: string
  startedAt: number
}

const requestTraces = new WeakMap<Request, RequestTrace>()

const REQUEST_ID_HEADER = 'x-request-id'

/** Resolve the requestId for a request: prefer the caller's, else generate one. */
export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get(REQUEST_ID_HEADER)
  const normalized = inbound?.trim()
  if (normalized !== undefined && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) return normalized
  return crypto.randomUUID()
}

/** Record a trace for a request so onAfterResponse can compute duration. */
export function beginRequestTrace(request: Request): RequestTrace {
  const trace: RequestTrace = { requestId: resolveRequestId(request), startedAt: Date.now() }
  requestTraces.set(request, trace)
  return trace
}

export function getRequestTrace(request: Request): RequestTrace | undefined {
  return requestTraces.get(request)
}

/** Preserve the request id and start time when an early hook wraps a body. */
export function copyRequestTrace(from: Request, to: Request): void {
  const trace = requestTraces.get(from)
  if (trace !== undefined) requestTraces.set(to, trace)
}
