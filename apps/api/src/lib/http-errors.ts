/**
 * 领域错误到 HTTP 响应的集中映射。
 *
 * 路由内抛出的每个错误都会由全局 onError 插件汇聚到这里，路由因此无需重复
 * try/catch + 状态码簿记。
 */

import { GenerationRepositoryError, type GenerationRepositoryErrorCode } from '@bailian-studio/generation-repository'
import { AuthError, type AuthErrorCode } from '@bailian-studio/auth'
import { CreditLedgerError, type CreditLedgerErrorCode } from '@bailian-studio/credit-ledger'
import { ValidationError } from '@bailian-studio/shared'
import { ZodError } from 'zod'
import { getRequestTrace } from './middleware'
import { RequestBodyTooLargeError } from './request-guards'

export interface ErrorResponseBody {
  success: false
  error: { code: string; message: string; details?: unknown; cause?: string }
  /** 请求级关联 id；在 HTTP 之外构造错误时省略。 */
  traceId?: string
}

/**
 * 各 repository 错误码对应的 HTTP 状态码。使用覆盖完整联合类型的 Record，
 * 意味着新增错误码而未在此处提供映射时编译器会报错。
 */
const REPOSITORY_STATUS: Record<GenerationRepositoryErrorCode, number> = {
  MODEL_NOT_FOUND: 404,
  GENERATION_NOT_FOUND: 404,
  GENERATION_NOT_CANCELLABLE: 409,
  GENERATION_NOT_RETRYABLE: 409,
  GENERATION_DAILY_LIMIT_EXCEEDED: 429,
  ARTIFACT_NOT_FOUND: 404,
  ASSET_DERIVATIVE_NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,
  INVALID_GENERATION_PARAMS: 400,
  INVALID_CURSOR: 400,
  EVENT_CURSOR_EXPIRED: 410,
  IDEMPOTENCY_CONFLICT: 409,
  DATABASE_ERROR: 500,
  POINTS_INSUFFICIENT: 402,
  POINTS_ACCOUNT_NOT_FOUND: 404,
  POINTS_IDEMPOTENCY_CONFLICT: 409,
  POINTS_SETTLEMENT_ANOMALY: 500,
}

const AUTH_STATUS: Record<AuthErrorCode, number> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_EMAIL_TAKEN: 409,
  AUTH_EMAIL_UNVERIFIED: 403,
  AUTH_TOKEN_INVALID: 400,
  AUTH_TOKEN_EXPIRED: 410,
  AUTH_TOKEN_CONSUMED: 409,
  AUTH_PASSWORD_UNCHANGED: 409,
  AUTH_EMAIL_RATE_LIMITED: 429,
  EMAIL_DELIVERY_FAILED: 503,
  AUTH_UNAUTHORIZED: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_BANNED: 403,
  AUTH_PROVIDER_NOT_CONFIGURED: 503,
}

const CREDIT_LEDGER_STATUS: Record<CreditLedgerErrorCode, number> = {
  POINTS_INSUFFICIENT: 402,
  POINTS_ACCOUNT_NOT_FOUND: 404,
  POINTS_GRANT_INVALID: 400,
  POINTS_IDEMPOTENCY_CONFLICT: 409,
  POINTS_SETTLEMENT_ANOMALY: 500,
  POINTS_ADJUSTMENT_INVALID: 400,
  POINTS_INVALID_CURSOR: 400,
  POINTS_CONFIRMATION_REQUIRED: 409,
  POINTS_DATABASE_ERROR: 500,
}

export function httpStatusForError(error: unknown): number {
  if (requestBodyTooLargeError(error) !== undefined) {
    return 413
  }
  if (error instanceof GenerationRepositoryError) {
    return REPOSITORY_STATUS[error.code]
  }
  if (error instanceof CreditLedgerError) {
    return CREDIT_LEDGER_STATUS[error.code]
  }
  if (error instanceof AuthError) {
    return AUTH_STATUS[error.code]
  }
  if (error instanceof ValidationError) {
    return 400
  }
  if (error instanceof ZodError) {
    return 400
  }
  return 500
}

export function errorResponseBody(error: unknown, traceId?: string): ErrorResponseBody {
  const body = errorResponseBodyWithoutTrace(error)
  return traceId === undefined ? body : { ...body, traceId }
}

/**
 * 为那些有意将领域条件映射为不同公开 code/status 而非抛异常的路由分支，
 * 构建同一套错误响应结构。把这个辅助函数放在集中映射器旁边，可防止这些分支
 * 悄悄偏离传输契约。
 */
export function requestErrorResponseBody(
  request: Request,
  code: string,
  message: string,
  set: { headers: Record<string, string | number> },
  options: { details?: unknown; cause?: string } = {},
): ErrorResponseBody {
  const traceId = getRequestTrace(request)?.requestId
  if (traceId !== undefined) set.headers['x-trace-id'] = traceId
  return {
    success: false,
    error: {
      code,
      message,
      ...(options.details !== undefined ? { details: options.details } : {}),
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    },
    ...(traceId !== undefined ? { traceId } : {}),
  }
}

function errorResponseBodyWithoutTrace(error: unknown): ErrorResponseBody {
  const bodyTooLarge = requestBodyTooLargeError(error)
  if (bodyTooLarge !== undefined) {
    return {
      success: false,
      error: {
        code: bodyTooLarge.code,
        message: bodyTooLarge.message,
        details: { bytesRead: bodyTooLarge.bytesRead, limit: bodyTooLarge.limit },
      },
    }
  }

  if (error instanceof GenerationRepositoryError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    }
  }

  if (error instanceof CreditLedgerError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    }
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    }
  }

  if (error instanceof ValidationError) {
    const message = error.field !== undefined ? `${error.field}: ${error.message}` : error.message
    return { success: false, error: { code: 'VALIDATION_ERROR', message } }
  }

  if (error instanceof ZodError) {
    // 手动 zod 解析会走到这里：展示第一个 issue 及其 path，
    // 让客户端知道是哪个字段校验失败。
    const first = error.issues[0]
    const path = first?.path.join('.') ?? ''
    const message = first === undefined
      ? 'Validation error'
      : path.length > 0 ? `${path}: ${first.message}` : first.message
    return { success: false, error: { code: 'VALIDATION_ERROR', message } }
  }

  const message = error instanceof Error ? error.message : 'Internal server error'
  const cause = error instanceof Error && 'cause' in error && error.cause instanceof Error
    ? error.cause.message
    : undefined
  return { success: false, error: { code: 'INTERNAL_ERROR', message, ...(cause !== undefined ? { cause } : {}) } }
}

function requestBodyTooLargeError(error: unknown): RequestBodyTooLargeError | undefined {
  if (error instanceof RequestBodyTooLargeError) return error
  if (error instanceof Error && error.cause instanceof RequestBodyTooLargeError) return error.cause
  return undefined
}
