import type { TaskError, TaskErrorCategory } from '@bailian-studio/task-engine'

const TASK_ERROR_CATEGORIES = new Set<TaskErrorCategory>([
  'validation',
  'auth',
  'quota',
  'rate_limit',
  'provider',
  'network',
  'timeout',
  'storage',
  'cancelled',
  'system',
])

export function isTaskError(value: unknown): value is TaskError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const category = record['category']
  const code = record['code']
  const details = record['details']
  return typeof category === 'string'
    && TASK_ERROR_CATEGORIES.has(category as TaskErrorCategory)
    && typeof record['message'] === 'string'
    && typeof record['retriable'] === 'boolean'
    && (code === undefined || typeof code === 'string')
    && (details === undefined
      || (typeof details === 'object' && details !== null && !Array.isArray(details)))
}

export function taskErrorCarrier(error: TaskError): Error & { taskError: TaskError } {
  const carrier = new Error(error.message) as Error & { taskError: TaskError }
  carrier.taskError = error
  return carrier
}

export function readCarriedTaskError(error: unknown): TaskError | undefined {
  if (typeof error !== 'object' || error === null || !('taskError' in error)) return undefined
  return isTaskError(error.taskError) ? error.taskError : undefined
}
