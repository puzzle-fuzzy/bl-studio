import type {
  AuditAction,
  AuditEventMetadata,
  AuditOutcome,
  GenerationRepository,
} from '@bailian-studio/generation-repository'
import { createLogger } from '@bailian-studio/shared'
import { getRequestTrace } from './middleware'

type AuditRepository = Pick<GenerationRepository, 'recordAuditEvent'>

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
 * Best-effort audit persistence for HTTP actions.
 *
 * Audit failure is observable but never changes the business response: a
 * temporary audit-table/database problem must not turn a successful login or
 * artifact download into a user-visible failure.
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
      // Only persist the pathname. Query parameters may contain opaque keys,
      // signed URLs, or other user-controlled data that does not belong in an
      // audit record.
      path: new URL(request.url).pathname,
      ...(input.metadata !== undefined ? { metadata: sanitizeMetadata(input.metadata) } : {}),
    })
  }
  catch (error) {
    // Do not log the exception object or message: database errors can include
    // connection details. The action/outcome are sufficient for an alert.
    logger.warn('audit.write_failed', {
      action: input.action,
      outcome: input.outcome,
      errorName: error instanceof Error ? error.name : 'unknown',
    })
  }
}

/** Keep audit metadata primitive-only, bounded, and intentionally boring. */
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

/** Return a stable, non-sensitive error code for failed audit metadata. */
export function auditErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 64)
  }
  return 'UNKNOWN_ERROR'
}
