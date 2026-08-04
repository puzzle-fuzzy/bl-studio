/**
 * DashScope（百炼）provider 错误分类。
 *
 * DashScope 的错误有两个来源、形状不同：(1) 同步接口直接返回的 HTTP 状态码 +
 * 标准 JSON 错误体；(2) 异步任务轮询失败时把错误塞进 `output` 子对象（如
 * `{ output: { task_status: "FAILED", code/message: "..." } }`）。本模块把这些
 * 异构的形态统一抽取成 ProviderErrorInfo，并按"是否值得重试 / 属于哪一类"分类，
 * 供 worker 决定是重试任务、还是直接判失败。
 */

/**
 * provider 错误的内部分类。auth/quota/validation 这类不可重试（重试也必然失败），
 * rate_limit/timeout/provider/network/system 这类往往是临时问题、值得重试。
 */
export type ProviderErrorCategory =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'validation'
  | 'cancelled'
  | 'provider'
  | 'network'
  | 'timeout'
  | 'system'

/** provider 错误的归一化信息：分类、是否可重试、以及原始 code/message。 */
export interface ProviderErrorInfo {
  category: ProviderErrorCategory
  retriable: boolean
  code?: string
  message: string
  details?: Readonly<Record<string, unknown>>
}

/**
 * 把任意形态的 DashScope 错误归一化并分类。
 *
 * 分类策略分两层，先看 HTTP 状态码（最权威），状态码不可用时再用 message/code
 * 做关键词匹配兜底：
 *  - 401/403 → auth（不可重试，凭据/权限问题）；
 *  - 429 → rate_limit（可重试）；
 *  - 400 → validation（不可重试，请求参数本身错误）；
 *  - 408 → timeout（可重试）；
 *  - 5xx → provider（可重试，provider 侧临时故障）。
 *
 * 关键词兜底覆盖异步任务错误（没有 HTTP 状态码）：从 message/code 里识别
 * invalid_api_key/unauthorized（auth）、quota/insufficient（quota）、
 * throttl/rate（rate_limit）、invalid/required（validation）、timeout。
 * 兜底仍命中不了时归为 provider 可重试——宁可多重试一次，也不要误判可恢复错误为永久失败。
 */
export function classifyDashScopeError(error: unknown): ProviderErrorInfo {
  const code = extractCode(error)
  const status = extractStatus(error)
  const message = withStatusFallback(extractMessage(error), status)
  const haystack = `${code ?? ''} ${message}`.toLowerCase()
  const compactHaystack = haystack.replace(/[^a-z0-9]/g, '')

  // DashScope 的 Arrearage 使用 HTTP 400，但语义是余额/额度而不是参数错误。
  if (compactHaystack.includes('arrearage')) {
    return buildInfo('quota', false, message, code)
  }

  if (status === 401 || status === 403) {
    return buildInfo('auth', false, message, code)
  }
  if (status === 429) {
    return buildInfo('rate_limit', true, message, code)
  }
  if (status === 400) {
    return buildInfo('validation', false, message, code)
  }
  if (status === 408) {
    return buildInfo('timeout', true, message, code)
  }
  if (status !== undefined && status >= 500 && status <= 599) {
    return buildInfo('provider', true, message, code)
  }

  if (
    haystack.includes('invalidapikey')
    || haystack.includes('unauthorized')
    || haystack.includes('forbidden')
    || haystack.includes('permission denied')
    || compactHaystack.includes('accessdenied')
  ) {
    return buildInfo('auth', false, message, code)
  }
  if (haystack.includes('quota') || haystack.includes('insufficient')) {
    return buildInfo('quota', false, message, code)
  }
  if (haystack.includes('throttl') || haystack.includes('rate')) {
    return buildInfo('rate_limit', true, message, code)
  }
  if (haystack.includes('invalid') || haystack.includes('required')) {
    return buildInfo('validation', false, message, code)
  }
  if (haystack.includes('timeout')) {
    return buildInfo('timeout', true, message, code)
  }

  return buildInfo('provider', true, message, code)
}

/**
 * 从异构错误体里提取 message。优先级：Error.message → output.message
 * （异步任务错误形状）→ 顶层 message → 兜底 String(error)。
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error !== 'object' || error === null) {
    return typeof error === 'string' ? error : String(error)
  }

  const record = error as Record<string, unknown>

  // 异步任务轮询失败时，错误信息放在 output.message 里
  // （如 { output: { task_status: "FAILED", message: "..." } }），而非顶层 message。
  const output = record.output
  if (typeof output === 'object' && output !== null) {
    const outputRecord = output as Record<string, unknown>
    if (typeof outputRecord.message === 'string' && outputRecord.message.trim().length > 0) {
      return outputRecord.message
    }
  }

  if (typeof record.message === 'string') return record.message

  return String(error)
}

/**
 * 兜底生成 message：原始 message 为空或退化成 `[object Object]` 时，
 * 用 HTTP 状态码合成一个，保证日志里始终有可读线索。
 */
function withStatusFallback(message: string, status: number | undefined): string {
  if (message.trim().length > 0 && message !== '[object Object]') return message
  return status === undefined ? 'DashScope provider error' : `DashScope HTTP ${status}`
}

/**
 * 从异构错误体里提取 code：同样需要先看 output.code（异步任务形状），再退回顶层 code。
 */
function extractCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const record = error as Record<string, unknown>

  const output = record.output
  if (typeof output === 'object' && output !== null) {
    const outputRecord = output as Record<string, unknown>
    if (typeof outputRecord.code === 'string') return outputRecord.code
  }

  if (typeof record.code === 'string') return record.code
  return undefined
}

/** 提取 HTTP 状态码：兼容 status 与 statusCode 两种字段命名。 */
function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const record = error as Record<string, unknown>
  return normalizeStatus(record.status) ?? normalizeStatus(record.statusCode)
}

/**
 * 把可能是数字或字符串的状态码归一为整数；非整数值（如 429.5、"429 OK"）返回 undefined。
 */
function normalizeStatus(status: unknown): number | undefined {
  if (typeof status === 'number' && Number.isInteger(status)) return status
  if (typeof status === 'string' && status.trim() !== '') {
    const parsed = Number(status)
    if (Number.isInteger(parsed)) return parsed
  }
  return undefined
}

function buildInfo(
  category: ProviderErrorCategory,
  retriable: boolean,
  message: string,
  code?: string,
): ProviderErrorInfo {
  return {
    category,
    retriable,
    ...(code !== undefined ? { code } : {}),
    message,
  }
}
