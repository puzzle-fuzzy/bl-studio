import { describe, expect, it } from 'vitest'
import type { CanvasExecutionTaskSummary } from '../packages/canvas-contracts/src/index'
import {
  canvasExecutionNodeStatusLabel,
  getCanvasExecutionAttentionNodes,
} from '../apps/canvas/src/lib/canvas-execution-diagnostics'

function execution(
  status: CanvasExecutionTaskSummary['status'],
  nodeStatuses: CanvasExecutionTaskSummary['nodeStatuses'],
): CanvasExecutionTaskSummary {
  return {
    id: 'canvas-execution-1',
    documentId: 'canvas-1',
    documentRevision: 1,
    status,
    nodeStatuses,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
}

describe('Canvas execution diagnostics', () => {
  it('returns failed nodes from a failed execution', () => {
    const result = getCanvasExecutionAttentionNodes(execution('failed', [
      { nodeId: 'done', status: 'succeeded' },
      { nodeId: 'failed', status: 'failed', error: 'provider failed', errorCode: 'PROVIDER_ERROR' },
    ]))

    expect(result.map(node => node.nodeId)).toEqual(['failed'])
  })

  it('returns unfinished nodes from a cancelled execution', () => {
    const result = getCanvasExecutionAttentionNodes(execution('cancelled', [
      { nodeId: 'done', status: 'succeeded' },
      { nodeId: 'queued', status: 'queued' },
      { nodeId: 'failed', status: 'failed' },
    ]))

    expect(result.map(node => node.nodeId)).toEqual(['queued', 'failed'])
  })

  it('does not surface attention nodes for a successful execution', () => {
    expect(getCanvasExecutionAttentionNodes(execution('succeeded', [
      { nodeId: 'done', status: 'succeeded' },
    ]))).toEqual([])
    expect(canvasExecutionNodeStatusLabel('generating')).toBe('生成中')
  })
})
