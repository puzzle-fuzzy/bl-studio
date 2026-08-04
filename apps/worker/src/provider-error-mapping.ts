import {
  classifyDashScopeError,
  type ProviderErrorCategory,
  type ProviderErrorInfo,
} from '@bailian-studio/provider-dashscope'
import type { TaskError } from '@bailian-studio/task-engine'
import type { ProviderError } from './providers'

const PROVIDER_ERROR_CATEGORIES = new Set<ProviderErrorCategory>([
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
export function classifyThrownProviderError(error: unknown): ProviderErrorInfo {
  if (typeof error === 'object' && error !== null && 'info' in error) {
    const info = (error as { info: unknown }).info
    if (isProviderErrorInfo(info)) return info
  }
  return classifyDashScopeError(error)
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

export function isProviderErrorInfo(value: unknown): value is ProviderErrorInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const category = record['category']
  const code = record['code']
  const details = record['details']
  return typeof category === 'string'
    && PROVIDER_ERROR_CATEGORIES.has(category as ProviderErrorCategory)
    && typeof record['retriable'] === 'boolean'
    && typeof record['message'] === 'string'
    && (code === undefined || typeof code === 'string')
    && (details === undefined
      || (typeof details === 'object' && details !== null && !Array.isArray(details)))
}
