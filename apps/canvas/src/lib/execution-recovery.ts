import type { CanvasExecutionTaskSummary } from '@bailian-studio/api-client'

/**
 * 只恢复当前编辑 revision 的未结束任务。
 *
 * 旧 revision 的任务仍可从运行记录查看，但不能自动把结果写回当前画布，
 * 避免用户在刷新后看到过期执行覆盖新编辑内容。
 */
export function findResumableCanvasExecution(
  executions: ReadonlyArray<CanvasExecutionTaskSummary>,
  documentRevision: number,
): CanvasExecutionTaskSummary | undefined {
  return executions.find(execution => (
    execution.documentRevision === documentRevision
    && (execution.status === 'queued' || execution.status === 'running')
  ))
}
