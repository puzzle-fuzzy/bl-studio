import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type FinalConnectionState,
  type Node,
  type NodeTypes,
  type XYPosition,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CanvasExecutionTaskSummary, GenerationDiagnostics } from '@bailian-studio/api-client'
import type { CanvasPreflightIssue } from '@bailian-studio/canvas-validation'
import { apiClient } from '@bailian-studio/lib-client'
import { CircleAlert, FilePlus2, History, ImagePlus, List, Loader2, Play, RefreshCw, Video, X } from 'lucide-react'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { MediaNode } from '../components/canvas/MediaNode'
import { CanvasExecutionDiagnosticsPanel } from '../components/canvas/CanvasExecutionDiagnosticsPanel'
import { useCanvasStore } from '../stores/canvas-store'
import { useCanvasPersistence } from '../hooks/use-canvas-persistence'
import { useCanvasExecution } from '../hooks/use-canvas-execution'
import { useModelCatalog } from '../hooks/use-model-catalog'
import { preflightCanvasState } from '../lib/canvas-preflight'
import {
  getCanvasExecutionAttentionNodes,
} from '../lib/canvas-execution-diagnostics'
import {
  normalizeMediaNodeData,
  type MediaKind,
  type MediaNodeData,
} from '../lib/media-node-data'

const nodeTypes: NodeTypes = { mediaNode: MediaNode }

let nextNodeId = 1

interface CanvasMenu {
  x: number
  y: number
  flow: XYPosition
  /** 从右桩拉线到空白区弹出菜单时，记录来源节点，创建后自动连线。 */
  connectFrom?: string
}

/** 画布页面：全屏 React Flow 画布 + 工具栏。 */
export function CanvasPage() {
  const {
    createDocument,
    documentError,
    documentLoading,
    documents,
    isDirty,
    openDocument,
    saveStatus,
    versions,
    refreshDocument,
    refreshVersions,
    restoreVersion,
  } = useCanvasPersistence()
  const {
    execute,
    cancel,
    retryNode,
    loadExecution,
    status: executionStatus,
    execution,
    error: executionError,
  } = useCanvasExecution()
  const { data: models } = useModelCatalog()
  const nodes = useCanvasStore(state => state.nodes)
  const edges = useCanvasStore(state => state.edges)
  const hasNodeGenerationInFlight = nodes.some(node => (
    normalizeMediaNodeData(node.data).status === 'generating'
  ))
  const selectedNodeId = nodes.find(node => node.selected)?.id
  const documentId = useCanvasStore(state => state.documentId)
  const onNodesChange = useCanvasStore(state => state.onNodesChange)
  const onEdgesChange = useCanvasStore(state => state.onEdgesChange)
  const onConnect = useCanvasStore(state => state.onConnect)
  const selectNode = useCanvasStore(state => state.selectNode)
  const { screenToFlowPosition, getNode, setCenter } = useReactFlow()
  const [menu, setMenu] = useState<CanvasMenu | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [showExecutions, setShowExecutions] = useState(false)
  const [executions, setExecutions] = useState<CanvasExecutionTaskSummary[]>([])
  const [executionCursor, setExecutionCursor] = useState<string | undefined>()
  const [executionHistoryLoading, setExecutionHistoryLoading] = useState(false)
  const [executionHistoryError, setExecutionHistoryError] = useState<string | undefined>()
  const executionHistoryRequestRef = useRef(0)
  const [restoringVersion, setRestoringVersion] = useState<string | undefined>()
  const [refreshingDocument, setRefreshingDocument] = useState(false)
  const [showPreflightIssues, setShowPreflightIssues] = useState(false)
  const [showExecutionDiagnostics, setShowExecutionDiagnostics] = useState(false)
  const [diagnosticNodeId, setDiagnosticNodeId] = useState<string | undefined>()
  const [generationDiagnostics, setGenerationDiagnostics] = useState<GenerationDiagnostics | undefined>()
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | undefined>()

  const preflight = useMemo(
    () => models === undefined
      ? { valid: false, issues: [] as CanvasPreflightIssue[] }
      : preflightCanvasState(nodes, edges, models),
    [edges, models, nodes],
  )
  const attentionNodes = useMemo(
    () => getCanvasExecutionAttentionNodes(execution),
    [execution],
  )
  const diagnosticNode = attentionNodes.find(node => node.nodeId === diagnosticNodeId) ?? attentionNodes[0]

  const focusCanvasNode = useCallback((nodeId: string) => {
    selectNode(nodeId)
    const node = getNode(nodeId)
    if (node === undefined) return
    void setCenter(node.position.x + 128, node.position.y + 96, { duration: 280, zoom: 1 })
  }, [getNode, selectNode, setCenter])

  const openNodeDiagnostics = useCallback((nodeId: string) => {
    setDiagnosticNodeId(nodeId)
    setShowExecutionDiagnostics(true)
    focusCanvasNode(nodeId)
  }, [focusCanvasNode])

  const handleExecute = useCallback(() => {
    if (models === undefined) return
    if (!preflight.valid) {
      setShowPreflightIssues(true)
      return
    }
    setShowPreflightIssues(false)
    void execute()
  }, [execute, models, preflight.valid])

  const documentActionsLocked = documentLoading
    || hasNodeGenerationInFlight
    || executionStatus === 'submitting'
    || executionStatus === 'running'
    || executionStatus === 'cancelling'

  const confirmDocumentChange = useCallback(() => {
    if (!isDirty) return true
    return window.confirm('当前画布还有未保存修改，切换后将放弃这些修改。继续吗？')
  }, [isDirty])

  const handleDocumentChange = useCallback((nextDocumentId: string) => {
    if (nextDocumentId === documentId || !confirmDocumentChange()) return
    void openDocument(nextDocumentId)
  }, [confirmDocumentChange, documentId, openDocument])

  const handleCreateDocument = useCallback(() => {
    if (!confirmDocumentChange()) return
    void createDocument()
  }, [confirmDocumentChange, createDocument])

  useEffect(() => {
    if (preflight.valid) setShowPreflightIssues(false)
  }, [preflight.valid])

  useEffect(() => {
    if (attentionNodes.length === 0) {
      setDiagnosticNodeId(undefined)
      setGenerationDiagnostics(undefined)
      return
    }
    setDiagnosticNodeId(current => (
      current !== undefined && attentionNodes.some(node => node.nodeId === current)
        ? current
        : attentionNodes[0]?.nodeId
    ))
    if (execution?.status === 'failed' || execution?.status === 'cancelled') {
      setShowExecutionDiagnostics(true)
    }
  }, [attentionNodes, execution?.status])

  useEffect(() => {
    setGenerationDiagnostics(undefined)
    setDiagnosticsError(undefined)
    setDiagnosticsLoading(false)
    const generationId = diagnosticNode?.generationId
    if (!showExecutionDiagnostics || generationId === undefined) return
    let disposed = false
    setDiagnosticsLoading(true)
    void apiClient.getGenerationDiagnostics(generationId)
      .then(next => {
        if (!disposed) setGenerationDiagnostics(next)
      })
      .catch(() => {
        if (!disposed) setDiagnosticsError('链路诊断暂时不可用，请稍后重试')
      })
      .finally(() => {
        if (!disposed) setDiagnosticsLoading(false)
      })
    return () => { disposed = true }
  }, [diagnosticNode?.generationId, showExecutionDiagnostics])

  useEffect(() => {
    if (showVersions) void refreshVersions()
  }, [refreshVersions, showVersions])

  const loadExecutionHistory = useCallback(async (cursor?: string, append = false) => {
    if (documentId === undefined) return
    const requestId = executionHistoryRequestRef.current + 1
    executionHistoryRequestRef.current = requestId
    setExecutionHistoryLoading(true)
    setExecutionHistoryError(undefined)
    try {
      const page = await apiClient.listCanvasExecutions(documentId, {
        limit: 20,
        ...(cursor === undefined ? {} : { cursor }),
      })
      if (requestId !== executionHistoryRequestRef.current || useCanvasStore.getState().documentId !== documentId) return
      setExecutions(current => append ? [...current, ...page.items] : page.items)
      setExecutionCursor(page.nextCursor)
    } catch (error) {
      if (requestId !== executionHistoryRequestRef.current || useCanvasStore.getState().documentId !== documentId) return
      setExecutionHistoryError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === executionHistoryRequestRef.current) setExecutionHistoryLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    executionHistoryRequestRef.current += 1
    setExecutions([])
    setExecutionCursor(undefined)
    setExecutionHistoryError(undefined)
  }, [documentId])

  useEffect(() => {
    if (showExecutions) void loadExecutionHistory()
  }, [executionStatus, loadExecutionHistory, showExecutions])

  const saveLabel =
    saveStatus === 'loading'
      ? '加载中…'
      : saveStatus === 'saving'
        ? '保存中…'
        : saveStatus === 'conflict'
          ? '版本冲突'
          : saveStatus === 'error'
            ? '离线保存'
            : '已保存'
  const executionLabel =
    executionStatus === 'submitting'
      ? '提交中…'
      : executionStatus === 'running'
        ? '执行中…'
        : executionStatus === 'cancelling'
          ? '取消中…'
          : executionStatus === 'succeeded'
            ? '执行完成'
            : executionStatus === 'failed'
              ? '执行失败'
              : executionStatus === 'cancelled'
                ? '已取消'
                : '运行画布'

  const reloadServerDocument = useCallback(async () => {
    if (!window.confirm('当前本地修改无法覆盖服务器的新版本。放弃本地修改并重新载入服务器版本吗？')) return
    setRefreshingDocument(true)
    try {
      await refreshDocument()
    } catch {
      // refreshDocument 已将保存状态切换为 error，保留当前页面供用户稍后重试。
    } finally {
      setRefreshingDocument(false)
    }
  }, [refreshDocument])

  // 点击菜单外部或按 Esc 关闭右键菜单。
  useEffect(() => {
    if (menu === null) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-canvas-menu]') !== null) return
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const addMediaNode = useCallback((kind: MediaKind, position?: XYPosition) => {
    const id = `media_${Date.now()}_${nextNodeId++}`
    const newNode: Node<MediaNodeData> = {
      id,
      type: 'mediaNode',
      position: position ?? {
        x: 100 + Math.random() * 300,
        y: 100 + Math.random() * 200,
      },
      data: {
        kind,
        status: 'empty',
        prompt: '',
        modelId: '',
        referenceUrls: [],
        referenceAssetIds: [],
        aspectRatio: '1:1',
      },
    }
    useCanvasStore.getState().addNode(newNode)
  }, [])

  /** 右键画布/拉线落空：在落点创建空白媒体节点（有来源时自动连线）。 */
  const addEmptyNode = useCallback(
    (kind: MediaKind) => {
      if (menu === null) return
      const nodeId = `media_${Date.now()}_${nextNodeId++}`
      const newNode: Node<MediaNodeData> = {
        id: nodeId,
        type: 'mediaNode',
        position: menu.flow,
        data: {
          kind,
          status: 'empty',
          prompt: '',
          modelId: '',
          referenceUrls: [],
          referenceAssetIds: [],
          aspectRatio: '1:1',
        },
      }
      useCanvasStore.getState().addNode(newNode)
      if (menu.connectFrom !== undefined) {
        useCanvasStore.getState().onConnect({
          source: menu.connectFrom,
          target: nodeId,
          sourceHandle: null,
          targetHandle: null,
        })
      }
      setMenu(null)
    },
    [menu],
  )

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 140),
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      })
    },
    [screenToFlowPosition],
  )

  /** 从右桩拉线松手在空白区域：弹出与右键相同的菜单，创建后自动连线。 */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || state.fromNode?.id === undefined) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (point === undefined) return
      setMenu({
        x: Math.min(point.clientX, window.innerWidth - 190),
        y: Math.min(point.clientY, window.innerHeight - 140),
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        connectFrom: state.fromNode.id,
      })
    },
    [screenToFlowPosition],
  )

  return (
    <div className="relative h-full min-h-0">
      {/* 工具栏：添加不同类型的节点 */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 rounded-xl border bg-surface/95 p-1 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1 border-r pr-1">
          <Select
            value={documentId ?? ''}
            onValueChange={handleDocumentChange}
            disabled={documentActionsLocked || documents.length === 0}
          >
            <SelectTrigger className="h-7 w-40 border-0 bg-transparent px-2 text-xs shadow-none">
              <SelectValue placeholder={documentLoading ? '加载画布…' : '选择画布'} />
            </SelectTrigger>
            <SelectContent>
              {documents.map(document => (
                <SelectItem key={document.id} value={document.id}>
                  {document.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            disabled={documentActionsLocked}
            onClick={handleCreateDocument}
            title="新建空白画布"
          >
            <FilePlus2 className="size-3.5" aria-hidden />
            <span className="sr-only">新建画布</span>
          </Button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => addMediaNode('image')}>
          <ImagePlus className="mr-1 size-3.5" aria-hidden />
          图片
        </Button>
        <Button size="sm" variant="secondary" onClick={() => addMediaNode('video')}>
          <Video className="mr-1 size-3.5" aria-hidden />
          视频
        </Button>
      </div>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-xl border bg-surface/95 p-1 shadow-sm backdrop-blur">
        <span
          className={`px-2 text-[10px] ${saveStatus === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {saveStatus === 'saving' || saveStatus === 'loading' ? (
            <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden />
          ) : null}
          {saveLabel}
        </span>
        {documentError !== undefined && (
          <span className="max-w-32 truncate text-[10px] text-destructive" title={documentError}>
            文档加载失败
          </span>
        )}
        {saveStatus === 'conflict' && (
          <Button
            size="sm"
            variant="outline"
            disabled={refreshingDocument}
            onClick={() => void reloadServerDocument()}
            title="放弃本地修改并重新载入服务器版本"
          >
            {refreshingDocument ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="mr-1 size-3.5" aria-hidden />}
            {refreshingDocument ? '载入中…' : '重载服务器版本'}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={
            saveStatus !== 'saved' ||
            models === undefined ||
            hasNodeGenerationInFlight ||
            executionStatus === 'submitting' ||
            executionStatus === 'running' ||
            executionStatus === 'cancelling'
          }
          onClick={handleExecute}
          title={hasNodeGenerationInFlight
            ? '请等待节点生成完成后再运行画布'
            : models === undefined
              ? '正在加载模型目录'
              : preflight.valid
                ? executionError
                : '请先修正提交前检查中的问题'}
        >
          {executionStatus === 'submitting' || executionStatus === 'running' ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="mr-1 size-3.5" aria-hidden />
          )}
          {executionLabel}
        </Button>
        {(executionStatus === 'submitting' || executionStatus === 'running') && (
          <Button size="sm" variant="ghost" onClick={() => void cancel()} title="取消当前画布执行">
            <X className="mr-1 size-3.5" aria-hidden />
            取消
          </Button>
        )}
        {selectedNodeId !== undefined
          && (executionStatus === 'succeeded' || executionStatus === 'failed' || executionStatus === 'cancelled') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void retryNode(selectedNodeId)}
              title="只重跑选中节点及其下游节点"
            >
              <RefreshCw className="mr-1 size-3.5" aria-hidden />
              重跑节点
            </Button>
          )}
        {attentionNodes.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const nodeId = diagnosticNode?.nodeId ?? attentionNodes[0]?.nodeId
              if (nodeId !== undefined) openNodeDiagnostics(nodeId)
            }}
            aria-expanded={showExecutionDiagnostics}
            title="查看失败或未完成节点的诊断"
          >
            <CircleAlert className="mr-1 size-3.5 text-destructive" aria-hidden />
            诊断（{attentionNodes.length}）
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowVersions(open => !open)} aria-expanded={showVersions}>
          <History className="mr-1 size-3.5" aria-hidden />
          版本
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowExecutions(open => !open)} aria-expanded={showExecutions}>
          <List className="mr-1 size-3.5" aria-hidden />
          运行记录
        </Button>
      </div>

      {showPreflightIssues && !preflight.valid && preflight.issues.length > 0 && (
        <div role="alert" className="absolute top-14 right-3 z-30 w-80 rounded-xl border border-destructive/40 bg-surface/95 p-2 shadow-lg backdrop-blur">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-destructive">提交前检查（{preflight.issues.length}）</span>
            <Button size="xs" variant="ghost" onClick={() => setShowPreflightIssues(false)} aria-label="关闭提交前检查">
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto px-1 text-[10px] leading-4 text-destructive">
            {preflight.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.nodeId ?? 'canvas'}-${issue.field ?? 'node'}-${index}`}>
                {formatPreflightIssue(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {executionError !== undefined && executionStatus === 'failed' && !showPreflightIssues && (
        <div role="alert" className="absolute top-14 right-3 z-30 max-w-80 rounded-xl border border-destructive/40 bg-surface/95 px-3 py-2 text-[10px] leading-4 text-destructive shadow-lg backdrop-blur">
          {executionError}
        </div>
      )}

      {showExecutionDiagnostics && execution !== undefined && attentionNodes.length > 0 && (
        <CanvasExecutionDiagnosticsPanel
          execution={execution}
          attentionNodes={attentionNodes}
          selectedNode={diagnosticNode}
          generationDiagnostics={generationDiagnostics}
          diagnosticsLoading={diagnosticsLoading}
          diagnosticsError={diagnosticsError}
          canRetry={executionStatus === 'succeeded' || executionStatus === 'failed' || executionStatus === 'cancelled'}
          onSelectNode={openNodeDiagnostics}
          onRetryNode={nodeId => {
            focusCanvasNode(nodeId)
            void retryNode(nodeId)
          }}
          onClose={() => setShowExecutionDiagnostics(false)}
        />
      )}

      {showVersions && (
        <div className="absolute top-14 right-3 z-20 w-64 rounded-xl border bg-surface/95 p-2 shadow-lg backdrop-blur">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium">版本历史</span>
            <span className="text-[10px] text-muted-foreground">恢复会创建新版本</span>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {versions.length === 0 ? (
              <p className="px-1 py-3 text-center text-[10px] text-muted-foreground">暂无版本</p>
            ) : (
              versions.map(version => (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent"
                >
                  <div>
                    <div className="text-xs">版本 {version.version}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={restoringVersion !== undefined}
                    onClick={() => {
                      setRestoringVersion(version.id)
                      void restoreVersion(version.id)
                        .catch(() => undefined)
                        .finally(() => setRestoringVersion(undefined))
                    }}
                  >
                    {restoringVersion === version.id ? '恢复中' : '恢复'}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showExecutions && (
        <div className="absolute top-14 right-44 z-20 w-72 rounded-xl border bg-surface/95 p-2 shadow-lg backdrop-blur">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium">运行记录</span>
            <span className="text-[10px] text-muted-foreground">点击可恢复节点结果</span>
          </div>
          {executionHistoryError !== undefined ? (
            <p className="px-1 py-3 text-center text-[10px] text-destructive">{executionHistoryError}</p>
          ) : executions.length === 0 && !executionHistoryLoading ? (
            <p className="px-1 py-3 text-center text-[10px] text-muted-foreground">暂无运行记录</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {executions.map(execution => (
                <button
                  key={execution.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => void loadExecution(execution.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs">
                      {execution.rerun === undefined ? '画布执行' : `节点重跑 · ${execution.rerun.nodeId}`}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      版本 {execution.documentRevision} · {new Date(execution.createdAt).toLocaleString()}
                      {execution.nodeStatuses.some(node => node.cacheHit === true) ? ' · 命中缓存' : ''}
                      {execution.durationMs === undefined ? '' : ` · 总耗时 ${formatDuration(execution.durationMs)}`}
                      {failedNodeCount(execution) === 0 ? '' : ` · ${failedNodeCount(execution)} 个节点失败`}
                      {execution.errorCode === undefined ? '' : ` · ${execution.errorCode}`}
                    </span>
                  </span>
                  <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{executionStatusLabel(execution.status)}</span>
                </button>
              ))}
              {executionHistoryLoading && (
                <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">加载中…</p>
              )}
              {executionCursor !== undefined && !executionHistoryLoading && (
                <Button
                  size="xs"
                  variant="outline"
                  className="w-full"
                  onClick={() => void loadExecutionHistory(executionCursor, true)}
                >
                  加载更多
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onPaneContextMenu={onPaneContextMenu}
        fitView
        minZoom={0.2}
        maxZoom={3}
        className="bg-canvas"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--border)" />
        <Controls
          className="!bottom-4 !left-4 flex gap-1 rounded-lg border bg-surface p-1 [&>button]:!border-0 [&>button]:!bg-transparent [&>button]:!text-muted-foreground [&>button:hover]:!bg-accent"
          showInteractive={false}
        />
        <MiniMap
          pannable
          zoomable
          className="!right-4 !bottom-4 !m-0 rounded-lg border !bg-surface/90"
          nodeColor="var(--primary)"
        />
      </ReactFlow>

      {menu !== null && (
        <div
          data-canvas-menu
          role="menu"
          className="fixed z-50 min-w-36 rounded-xl border bg-surface p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            onClick={() => addEmptyNode('image')}
          >
            <ImagePlus className="size-4 text-muted-foreground" aria-hidden />
            图片节点
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            onClick={() => addEmptyNode('video')}
          >
            <Video className="size-4 text-muted-foreground" aria-hidden />
            视频节点
          </button>
        </div>
      )}
    </div>
  )
}

function executionStatusLabel(status: CanvasExecutionTaskSummary['status']): string {
  return {
    queued: '排队中',
    running: '执行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status]
}

function failedNodeCount(execution: CanvasExecutionTaskSummary): number {
  return execution.nodeStatuses.filter(node => node.status === 'failed').length
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1_000)
  return seconds === 60 ? `${minutes + 1}m` : `${minutes}m ${seconds}s`
}

function formatPreflightIssue(issue: CanvasPreflightIssue): string {
  const target = issue.nodeId === undefined
    ? '画布'
    : `节点 ${issue.nodeId}${issue.field === undefined ? '' : ` · ${issue.field}`}`
  return `${target}：${issue.message}`
}
