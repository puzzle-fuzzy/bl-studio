import { AdminRepositoryError } from './errors'

interface CursorPayload {
  createdAt: string
  id: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(token: string): CursorPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursor()
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('createdAt' in parsed) ||
    !('id' in parsed) ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.id !== 'string'
  ) {
    throw invalidCursor()
  }
  return { createdAt: parsed.createdAt, id: parsed.id }
}

function invalidCursor(): AdminRepositoryError {
  return new AdminRepositoryError(
    'ADMIN_INVALID_CURSOR',
    'Invalid admin pagination cursor',
  )
}
