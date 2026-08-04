/**
 * 横切 HTTP 中间件辅助：安全响应头与 CORS。
 *
 * 完整的认证/授权推迟到存在用户模型之后再实现；
 * 这里是不依赖用户模型的线上必备前置能力。
 */

/**
 * 应用到每个响应的安全响应头。
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

/**
 * 允许的 CORS 来源，取自 CORS_ALLOWED_ORIGINS（逗号分隔）；
 * 本地 web 应用开发默认使用 localhost。
 */
export function getAllowedOrigins(source: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const raw = source['CORS_ALLOWED_ORIGINS']
  const defaults = ['http://localhost:5002']
  if (raw === undefined || raw.length === 0) return defaults
  return raw.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
}

// ---------------------------------------------------------------------------
// 请求身份 + 访问日志。
//
// 每个请求都会获得一个 requestId（调用方传入 x-request-id 时原样回显，
// 否则生成新的 UUID）和一个开始时间戳。二者通过以 Request 对象为键的 WeakMap
// 在 onRequest 与 onAfterResponse 之间传递，这避免了 Elysia .state 的类型问题，
// 且对 GC 友好。
// ---------------------------------------------------------------------------

export interface RequestTrace {
  requestId: string
  startedAt: number
}

const requestTraces = new WeakMap<Request, RequestTrace>()

const REQUEST_ID_HEADER = 'x-request-id'

/** 解析请求的 requestId：优先用调用方传入的，否则生成一个新的。 */
export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get(REQUEST_ID_HEADER)
  const normalized = inbound?.trim()
  if (normalized !== undefined && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) return normalized
  return crypto.randomUUID()
}

/** 为请求记录 trace，使 onAfterResponse 能计算耗时。 */
export function beginRequestTrace(request: Request): RequestTrace {
  const trace: RequestTrace = { requestId: resolveRequestId(request), startedAt: Date.now() }
  requestTraces.set(request, trace)
  return trace
}

export function getRequestTrace(request: Request): RequestTrace | undefined {
  return requestTraces.get(request)
}

/** 当早期 hook 包装请求体时，保留请求 id 与开始时间。 */
export function copyRequestTrace(from: Request, to: Request): void {
  const trace = requestTraces.get(from)
  if (trace !== undefined) requestTraces.set(to, trace)
}
