import type {
  CanvasExecutionNodeStatus,
  CanvasExecutionTaskSummary,
  GenerationDiagnostics,
} from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { CircleAlert, Eye, Loader2, RefreshCw, X } from 'lucide-react'
import { canvasExecutionNodeStatusLabel } from '@/lib/canvas-execution-diagnostics'

interface CanvasExecutionDiagnosticsPanelProps {
  execution: CanvasExecutionTaskSummary
  attentionNodes: readonly CanvasExecutionNodeStatus[]
  selectedNode: CanvasExecutionNodeStatus | undefined
  generationDiagnostics: GenerationDiagnostics | undefined
  diagnosticsLoading: boolean
  diagnosticsError: string | undefined
  canRetry: boolean
  onSelectNode: (nodeId: string) => void
  onRetryNode: (nodeId: string) => void
  onClose: () => void
}

/** Canvas 执行失败后的节点定位、链路诊断和恢复操作面板。 */
export function CanvasExecutionDiagnosticsPanel({
  execution,
  attentionNodes,
  selectedNode,
  generationDiagnostics,
  diagnosticsLoading,
  diagnosticsError,
  canRetry,
  onSelectNode,
  onRetryNode,
  onClose,
}: CanvasExecutionDiagnosticsPanelProps) {
  return (
    <section
      role="dialog"
      aria-label="Canvas 执行诊断"
      className="absolute bottom-4 left-4 z-30 w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-surface/95 p-2 shadow-lg backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />
          <span className="truncate text-xs font-medium">执行诊断</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{execution.id}</span>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose} aria-label="关闭执行诊断">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="flex max-h-[min(28rem,calc(100vh-8rem))] min-h-0 gap-2">
        <div className="w-36 shrink-0 space-y-1 overflow-y-auto pr-1">
          {attentionNodes.map(node => (
            <button
              key={node.nodeId}
              type="button"
              className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${selectedNode?.nodeId === node.nodeId ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent'}`}
              onClick={() => onSelectNode(node.nodeId)}
            >
              <span className="flex items-center gap-1 text-[11px] font-medium">
                <span className={node.status === 'failed' ? 'text-destructive' : 'text-warning-foreground'}>
                  {node.nodeId}
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {canvasExecutionNodeStatusLabel(node.status)}
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border bg-background/50 p-2">
          {selectedNode === undefined ? (
            <p className="py-6 text-center text-[10px] text-muted-foreground">没有可查看的节点诊断</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">节点 {selectedNode.nodeId}</p>
                  <p className="text-[10px] text-muted-foreground">{canvasExecutionNodeStatusLabel(selectedNode.status)}</p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canRetry}
                  onClick={() => onRetryNode(selectedNode.nodeId)}
                  title={canRetry ? '只重跑该节点及其下游节点' : '当前执行尚未结束，暂不能重跑'}
                >
                  <RefreshCw className="mr-1 size-3" aria-hidden />
                  重跑节点
                </Button>
              </div>

              {selectedNode.error !== undefined && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] leading-4 text-destructive">
                  {selectedNode.error}
                </div>
              )}

              <dl className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 text-[10px]">
                <dt className="text-muted-foreground">错误码</dt>
                <dd className="truncate font-mono">{selectedNode.errorCode ?? '—'}</dd>
                <dt className="text-muted-foreground">generation</dt>
                <dd className="truncate font-mono" title={selectedNode.generationId}>{selectedNode.generationId ?? '—'}</dd>
                <dt className="text-muted-foreground">耗时</dt>
                <dd>{selectedNode.durationMs === undefined ? '—' : formatDuration(selectedNode.durationMs)}</dd>
              </dl>

              {selectedNode.generationId !== undefined && (
                <div className="space-y-1.5 border-t pt-2">
                  <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Eye className="size-3" aria-hidden />
                    生成链路
                  </p>
                  {diagnosticsLoading && (
                    <p className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      加载中…
                    </p>
                  )}
                  {diagnosticsError !== undefined && (
                    <p className="text-[10px] leading-4 text-muted-foreground">{diagnosticsError}</p>
                  )}
                  {generationDiagnostics !== undefined && (
                    <div className="space-y-1.5 text-[10px]">
                      <dl className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1">
                        <dt className="text-muted-foreground">traceId</dt>
                        <dd className="truncate font-mono" title={generationDiagnostics.traceId}>{generationDiagnostics.traceId ?? '—'}</dd>
                        <dt className="text-muted-foreground">总耗时</dt>
                        <dd>{generationDiagnostics.generationDurationMs === undefined ? '—' : formatDuration(generationDiagnostics.generationDurationMs)}</dd>
                      </dl>
                      {generationDiagnostics.tasks.length > 0 && (
                        <div>
                          <p className="mb-0.5 text-muted-foreground">任务阶段</p>
                          <ul className="space-y-0.5">
                            {generationDiagnostics.tasks.map((task, index) => (
                              <li key={`${task.type}-${index}`} className="flex justify-between gap-2">
                                <span className="truncate">{task.type}</span>
                                <span className="shrink-0 text-muted-foreground">{task.status}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {generationDiagnostics.providerRequests.length > 0 && (
                        <div>
                          <p className="mb-0.5 text-muted-foreground">Provider 请求</p>
                          <ul className="space-y-0.5">
                            {generationDiagnostics.providerRequests.map((request, index) => (
                              <li key={`${request.operation}-${index}`} className="flex justify-between gap-2">
                                <span className="truncate">{request.operation}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {request.status}{request.latencyMs === undefined ? '' : ` · ${request.latencyMs}ms`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1_000)
  return seconds === 60 ? `${minutes + 1}m` : `${minutes}m ${seconds}s`
}
