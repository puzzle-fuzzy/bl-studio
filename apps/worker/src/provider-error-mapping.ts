import type { TaskError, TaskErrorCategory } from '@bailian-studio/task-engine'
import type { ProviderError, ProviderErrorClassification } from './providers'

const PROVIDER_ERROR_CATEGORIES = new Set<TaskErrorCategory>([
  'auth',
  'quota',
  'rate_limit',
  'validation',
  'cancelled',
  'provider',
  'network',
  'timeout',
  'system',
])

/** 只信任形状完整的结构化错误；伪造或损坏的 `.info` 回退到统一分类器。 */
export function classifyThrownProviderError(
  error: unknown,
  providerClassifier?: (error: unknown) => ProviderErrorClassification,
): ProviderErrorClassification {
  if (typeof error === 'object' && error !== null && 'info' in error) {
    const info = (error as { info: unknown }).info
    if (isProviderErrorInfo(info)) return info
  }
  return providerClassifier?.(error) ?? classifyUnknownProviderError(error)
}

export function providerErrorToTaskError(error: ProviderError | undefined): TaskError {
  if (error === undefined) {
    return {
      category: 'provider',
      message: 'Provider reported failure without details',
      retriable: false,
      code: 'PROVIDER_FAILURE_MISSING_ERROR',
    }
  }
  return {
    category: error.category,
    message: error.message,
    retriable: error.retryable,
    ...(error.code !== undefined ? { code: error.code } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  }
}

export function isProviderErrorInfo(value: unknown): value is ProviderErrorClassification {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const category = record['category']
  const code = record['code']
  const details = record['details']
  return typeof category === 'string'
    && PROVIDER_ERROR_CATEGORIES.has(category as TaskErrorCategory)
    && typeof record['retriable'] === 'boolean'
    && typeof record['message'] === 'string'
    && (code === undefined || typeof code === 'string')
    && (details === undefined
      || (typeof details === 'object' && details !== null && !Array.isArray(details)))
}

function classifyUnknownProviderError(error: unknown): ProviderErrorClassification {
  const status = readStatus(error)
  const code = error instanceof Error
    ? readCode(error)
    : undefined
  const message = error instanceof Error
    ? error.message
    : status === undefined
      ? String(error)
      : `Provider HTTP ${status}`
  const haystack = `${code ?? ''} ${message}`.toLowerCase()
  if (status === 401 || status === 403) return { category: 'auth', retriable: false, message }
  if (status === 429) return { category: 'rate_limit', retriable: true, message }
  if (status === 408) return { category: 'timeout', retriable: true, message }
  if (status !== undefined && status >= 500 && status <= 599) {
    return { category: 'provider', retriable: true, message }
  }
  if (haystack.includes('unauthorized') || haystack.includes('invalid api key') || haystack.includes('forbidden')) {
    return { category: 'auth', retriable: false, message }
  }
  if (haystack.includes('fetch failed')
    || haystack.includes('network')
    || haystack.includes('econnreset')
    || haystack.includes('econnrefused')
    || haystack.includes('enotfound')
    || haystack.includes('socket hang up')
  ) {
    return { category: 'network', retriable: true, message }
  }
  if (haystack.includes('timeout') || haystack.includes('etimedout')) {
    return { category: 'timeout', retriable: true, message }
  }
  return { category: 'system', retriable: false, message }
}

function readCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined
}
