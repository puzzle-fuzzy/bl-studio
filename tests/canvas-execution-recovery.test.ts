import { describe, expect, it } from 'vitest'
import type { CanvasExecutionTaskSummary } from '../packages/api-client/src/schemas'
import { findResumableCanvasExecution } from '../apps/canvas/src/lib/execution-recovery'

function execution(
  id: string,
  documentRevision: number,
  status: CanvasExecutionTaskSummary['status'],
): CanvasExecutionTaskSummary {
  return {
    id,
    documentId: 'canvas-1',
    documentRevision,
    status,
    nodeStatuses: [],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
}

describe('Canvas execution recovery', () => {
  it('only resumes queued/running execution from the current revision', () => {
    const result = findResumableCanvasExecution([
      execution('old-running', 2, 'running'),
      execution('current-done', 3, 'succeeded'),
      execution('current-running', 3, 'running'),
    ], 3)

    expect(result?.id).toBe('current-running')
  })

  it('does not resume a terminal or old-revision execution', () => {
    const result = findResumableCanvasExecution([
      execution('old-running', 2, 'running'),
      execution('current-done', 3, 'failed'),
    ], 3)

    expect(result).toBeUndefined()
  })
})
