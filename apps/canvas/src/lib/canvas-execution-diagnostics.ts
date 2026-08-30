import type { CanvasExecutionNodeStatus, CanvasExecutionTaskSummary } from '@bailian-studio/api-client'

/**
 * 返回当前执行中需要用户处理的节点。
 *
 * 失败执行只展示明确失败的节点；取消执行则把尚未成功的节点也列出，
 * 这样用户能看清哪些结果没有完成，并决定是否从这些节点重新开始。
 */
export function getCanvasExecutionAttentionNodes(
  execution: CanvasExecutionTaskSummary | undefined,
): CanvasExecutionNodeStatus[] {
  if (execution === undefined) return []
  return execution.nodeStatuses.filter(node => (
    node.status === 'failed'
    || (execution.status === 'cancelled' && node.status !== 'succeeded')
  ))
}

export function canvasExecutionNodeStatusLabel(
  status: CanvasExecutionNodeStatus['status'],
): string {
  return {
    queued: '等待执行',
    generating: '生成中',
    succeeded: '已完成',
    failed: '失败',
  }[status]
}
