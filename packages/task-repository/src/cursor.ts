import { TaskRepositoryError } from './types'

export interface TaskCursor {
  createdAt: string
  id: string
}

export function encodeTaskCursor(cursor: TaskCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeTaskCursor(token: string): TaskCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('createdAt' in parsed)
      || !('id' in parsed)
      || typeof parsed.createdAt !== 'string'
      || typeof parsed.id !== 'string'
      || parsed.id.length === 0
      || !Number.isFinite(Date.parse(parsed.createdAt))
    ) {
      throw new Error('invalid cursor')
    }
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new TaskRepositoryError('INVALID_CURSOR', 'Invalid task pagination cursor')
  }
}

export function clampTaskLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20
  return Math.max(1, Math.min(100, Math.floor(limit)))
}
