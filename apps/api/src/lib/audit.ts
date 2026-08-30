import type {
	AuditAction,
	AuditEventMetadata,
	AuditOutcome,
	AuditRepository,
} from '@bailian-studio/generation-repository'
import { createLogger } from '@bailian-studio/shared'
import { getRequestTrace } from './middleware'

export interface RecordApiAuditEventInput {
  userId?: string
  action: AuditAction
  outcome: AuditOutcome
  targetType?: string
  targetId?: string
  metadata?: AuditEventMetadata
}

const logger = createLogger('audit')
const SAFE_METADATA_KEY = /^[a-zA-Z0-9_.-]{1,64}$/
const SENSITIVE_METADATA_KEY = /(?:prompt|input(?:Params)?|params|raw|body|response|authorization|api[-_]?key|password|secret|token|signed[-_]?url|source[-_]?url|read[-_]?url)/i
const MAX_METADATA_ENTRIES = 12
const MAX_STRING_VALUE_LENGTH = 256
const MAX_TRACE_VALUE_LENGTH = 256

/**
 * 对 HTTP 动作的尽力而为（best-effort）审计持久化。
 *
 * 审计失败可观测但绝不改变业务响应：审计表/数据库的临时故障不能让一次成功的
 * 登录或产物下载变成用户可见的失败。
 */
export async function recordApiAuditEvent(
  repositoryOrFactory: AuditRepository | (() => AuditRepository),
  request: Request,
  input: RecordApiAuditEventInput,
): Promise<void> {
  const trace = getRequestTrace(request)
  const requestId = boundedString(trace?.requestId)
  const traceId = boundedString(request.headers.get('x-trace-id') ?? undefined)

  try {
    const repository = typeof repositoryOrFactory === 'function' ? repositoryOrFactory() : repositoryOrFactory
    await repository.recordAuditEvent({
      ...input,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(traceId !== undefined ? { traceId } : {}),
      method: request.method,
      // 只持久化 pathname。查询参数可能包含不透明密钥、签名 URL 或其他
      // 用户可控数据，不应落入审计记录。
      path: new URL(request.url).pathname,
      ...(input.metadata !== undefined ? { metadata: sanitizeMetadata(input.metadata) } : {}),
    })
  }
  catch (error) {
    // 不记录异常对象或消息：数据库错误可能包含连接信息。action/outcome 足以用于告警。
    logger.warn('audit.write_failed', {
      action: input.action,
      outcome: input.outcome,
      errorName: error instanceof Error ? error.name : 'unknown',
    })
  }
}

/** 审计元数据只保留原始类型、有界且刻意无敏感信息。 */
function sanitizeMetadata(metadata: AuditEventMetadata): AuditEventMetadata {
  const safe: Record<string, string | number | boolean | null> = {}
  let count = 0

  for (const [key, value] of Object.entries(metadata)) {
    if (count >= MAX_METADATA_ENTRIES || !SAFE_METADATA_KEY.test(key) || SENSITIVE_METADATA_KEY.test(key)) continue

    if (typeof value === 'string') {
      safe[key] = value.slice(0, MAX_STRING_VALUE_LENGTH)
    }
    else if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value
    }
    else if (typeof value === 'boolean' || value === null) {
      safe[key] = value
    }
    else {
      continue
    }
    count += 1
  }

  return safe
}

function boundedString(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value.length === 0) return undefined
  return value.slice(0, MAX_TRACE_VALUE_LENGTH)
}

/** 为失败的审计元数据返回稳定、不含敏感信息的错误码。 */
export function auditErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 64)
  }
  return 'UNKNOWN_ERROR'
}
