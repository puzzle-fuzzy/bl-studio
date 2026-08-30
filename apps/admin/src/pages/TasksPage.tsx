import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FileArchive, FileText, Film, Image as ImageIcon, Loader2, Music } from 'lucide-react'
import type { AdminCanvasTaskAsset, AdminCanvasTaskContext, AdminTaskItem, AdminTaskRequestContext } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import { Badge } from '@bailian-studio/ui'
import { Button } from '@bailian-studio/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@bailian-studio/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'

type TaskStatusFilter = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
type TaskDomainFilter = 'all' | 'generation' | 'artifact' | 'media' | 'director' | 'canvas' | 'system'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
}

const DOMAIN_LABELS: Record<string, string> = {
  generation: '生成',
  artifact: '产物',
  media: '媒体',
  director: '导演',
  canvas: '画布',
  system: '系统',
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded': return 'default'
    case 'running': return 'secondary'
    case 'failed': return 'destructive'
    default: return 'outline'
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function shortId(id: string | undefined, len = 8): string {
  if (id === undefined) return '—'
  return id.length <= len ? id : id.slice(0, len)
}

function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

function CanvasTaskOutputAssets({
  assets,
  nodes,
}: {
  assets: AdminCanvasTaskAsset[]
  nodes: AdminCanvasTaskContext['nodes']
}) {
  if (assets.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-medium">输出资产回溯</h4>
        <p className="mt-1 text-sm text-muted-foreground">从节点输出 ID 回溯到资产元数据；预览地址为短期签名 URL。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map(asset => {
          const previewUrl = asset.thumbnailUrl ?? (asset.kind === 'image' ? asset.url : undefined)
          const usedBy = nodes
            .filter(node => node.assetIds?.includes(asset.id))
            .map(node => node.nodeId)
          const KindIcon = assetKindIcon(asset.kind)
          const preview = previewUrl !== undefined ? (
            <img
              src={resolveApiUrl(previewUrl)}
              alt={asset.fileName ?? asset.id}
              className="aspect-video w-full object-cover"
            />
          ) : asset.kind === 'text' && asset.text !== undefined ? (
            <pre className="line-clamp-5 min-h-24 whitespace-pre-wrap bg-muted p-3 text-xs">{asset.text}</pre>
          ) : (
            <div className="flex min-h-24 items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
              <KindIcon className="size-5" />
              {asset.kind}
            </div>
          )

          return (
            <div key={asset.id} className="overflow-hidden rounded-lg border">
              {asset.url !== undefined ? (
                <a
                  href={resolveApiUrl(asset.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  aria-label={`打开输出资产 ${asset.fileName ?? asset.id}`}
                >
                  {preview}
                </a>
              ) : preview}
              <div className="flex flex-col gap-1 p-3">
                <span className="truncate text-xs font-medium" title={asset.fileName ?? asset.id}>
                  {asset.fileName ?? shortId(asset.id, 18)}
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground" title={asset.id}>{asset.id}</span>
                <span className="text-xs text-muted-foreground">
                  节点：{usedBy.length > 0 ? usedBy.join('、') : '未关联'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function assetKindIcon(kind: string) {
  return kind === 'video' ? Film
    : kind === 'audio' ? Music
      : kind === 'text' ? FileText
        : kind === 'archive' ? FileArchive
          : ImageIcon
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className={mono
        ? 'min-w-0 flex-1 break-all text-left font-mono text-xs sm:text-right'
        : 'min-w-0 flex-1 break-words text-left text-sm sm:text-right'}>{value}</dd>
    </div>
  )
}

function CanvasTaskContextSection({ context }: { context: AdminCanvasTaskContext }) {
  const cacheHitCount = context.nodes.filter(node => node.cacheHit === true).length
  const accountedCents = context.nodes.reduce((total, node) => total + node.accountedCents, 0)

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Canvas 执行详情</h3>
        <p className="mt-1 text-sm text-muted-foreground">编排版本、节点状态和本次执行实际核算费用。</p>
      </div>

      <dl className="flex flex-col gap-4">
        <DetailField label="画布" value={context.documentId} mono />
        <DetailField label="文档版本" value={String(context.documentRevision)} />
        <DetailField label="缓存策略" value={context.cachePolicy ?? '—'} />
        <DetailField label="节点统计" value={`${context.nodes.length} 个节点 · ${cacheHitCount} 次缓存复用`} />
        <DetailField label="本次费用" value={`${centsToYuan(accountedCents)} 元`} />
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>节点</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>generation</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead className="text-right">费用</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {context.nodes.map(node => (
              <TableRow key={node.nodeId}>
                <TableCell className="font-mono text-xs">{node.nodeId}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{node.modelId}</span>
                    <span className="text-xs text-muted-foreground">{node.kind}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={statusVariant(node.status)}>{STATUS_LABELS[node.status] ?? node.status}</Badge>
                    {node.cacheHit === true && <Badge variant="outline">缓存</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{shortId(node.generationId, 12)}</TableCell>
                <TableCell>{node.durationMs !== undefined ? `${(node.durationMs / 1000).toFixed(1)} 秒` : '—'}</TableCell>
                <TableCell className="text-right">
                  {node.cacheHit === true ? '0.00 元' : `${centsToYuan(node.accountedCents)} 元`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CanvasTaskOutputAssets assets={context.assets ?? []} nodes={context.nodes} />

      {context.nodes.some(node => node.error !== undefined) && (
        <div className="flex flex-col gap-2 rounded-lg bg-destructive/5 p-3">
          <h4 className="text-sm font-medium text-destructive">节点错误</h4>
          {context.nodes.filter(node => node.error !== undefined).map(node => (
            <p key={node.nodeId} className="break-words text-sm text-muted-foreground">
              {node.nodeId}：{node.errorCode !== undefined ? `${node.errorCode} · ` : ''}{node.error}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

function TaskRequestContextSection({
  context,
  loading,
  error,
}: {
  context: AdminTaskRequestContext | null
  loading: boolean
  error: string | null
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  if (context?.kind === 'canvas') return <CanvasTaskContextSection context={context} />

  const inputEntries = context === null ? [] : Object.entries(context.inputParams)
  const promptEntries = inputEntries.filter(([key, value]) => (
    typeof value === 'string' && /prompt|text|description/i.test(key)
  ))
  const otherParams = Object.fromEntries(inputEntries.filter(([key]) => (
    !promptEntries.some(([promptKey]) => promptKey === key)
  )))
  const previewItems: LightboxMedia[] = (context?.inputAssets ?? []).map(inputAsset => ({
    key: `${inputAsset.parameterName}:${inputAsset.position}:${inputAsset.asset.id}`,
    kind: isLightboxKind(inputAsset.asset.kind) ? inputAsset.asset.kind : 'text',
    url: inputAsset.asset.url,
    thumbnailUrl: inputAsset.asset.thumbnailUrl ?? inputAsset.asset.url,
    fileName: inputAsset.asset.fileName ?? inputAsset.parameterName,
    text: inputAsset.asset.kind === 'text'
      ? `文本参考素材：${inputAsset.asset.fileName ?? inputAsset.parameterName}`
      : inputAsset.asset.kind === 'archive'
        ? `归档文件：${inputAsset.asset.fileName ?? inputAsset.parameterName}`
        : undefined,
  }))

  return (
    <>
      <section className="mt-8 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">请求内容</h3>
        <p className="mt-1 text-sm text-muted-foreground">本次任务提交给模型的参数和参考素材。</p>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error !== null && <p className="text-sm text-destructive">{error}</p>}

      {!loading && error === null && context === null && (
        <p className="text-sm text-muted-foreground">该任务没有关联可读取的生成请求。</p>
      )}

      {!loading && error === null && context !== null && (
        <>
          <dl className="flex flex-col gap-4">
            <DetailField label="生成记录" value={context.recordId} mono />
            <DetailField label="模型" value={context.modelId} mono />
            <DetailField label="类型" value={context.category} />
          </dl>

          {promptEntries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">{key}</h4>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5">
                {String(value)}
              </pre>
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">其他请求参数</h4>
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5">
              {JSON.stringify(otherParams, null, 2)}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">参考素材</h4>
            {context.inputAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">本次请求未使用参考素材。</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {context.inputAssets.map((inputAsset, index) => {
                  const previewUrl = inputAsset.asset.thumbnailUrl ?? (inputAsset.asset.kind === 'image' ? inputAsset.asset.url : undefined)
                  const KindIcon = assetKindIcon(inputAsset.asset.kind)
                  const content = previewUrl !== undefined ? (
                    <img
                      src={resolveApiUrl(previewUrl)}
                      alt={`${inputAsset.parameterName} ${inputAsset.position + 1}`}
                      className="aspect-square w-36 object-cover"
                    />
                  ) : inputAsset.asset.kind === 'text' ? (
                    <div className="flex aspect-square w-36 items-center justify-center overflow-hidden bg-muted p-3 text-left text-xs text-muted-foreground">
                      <span className="line-clamp-6 whitespace-pre-wrap">文本参考素材</span>
                    </div>
                  ) : (
                    <div className="flex aspect-square w-36 flex-col items-center justify-center gap-2 bg-muted p-3 text-center text-xs text-muted-foreground">
                      <KindIcon className="size-6" />
                      {inputAsset.asset.kind}
                    </div>
                  )
                  return (
                    <figure key={`${inputAsset.parameterName}:${inputAsset.position}:${inputAsset.asset.id}`} className="flex w-36 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        className="overflow-hidden rounded-lg text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`预览参考素材 ${inputAsset.asset.fileName ?? inputAsset.parameterName}`}
                      >
                        {content}
                      </button>
                      <figcaption className="truncate text-xs text-muted-foreground" title={inputAsset.asset.fileName ?? inputAsset.parameterName}>
                        {inputAsset.parameterName}{context.inputAssets.filter(item => item.parameterName === inputAsset.parameterName).length > 1 ? ` #${inputAsset.position + 1}` : ''}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
      </section>
      {previewIndex !== null && previewItems.length > 0 && (
        <MediaLightbox
          items={previewItems}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          downloadUrl={previewItems[previewIndex]?.url !== undefined
            ? resolveApiUrl(previewItems[previewIndex]?.url ?? '')
            : undefined}
        />
      )}
    </>
  )
}

function TaskDetailDialog({
  task,
  context,
  requestLoading,
  requestError,
  onOpenChange,
}: {
  task: AdminTaskItem | null
  context: AdminTaskRequestContext | null
  requestLoading: boolean
  requestError: string | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[min(96vw,1440px)]">
        {task !== null && (
          <>
            <DialogHeader>
              <DialogTitle>任务详情</DialogTitle>
              <DialogDescription>
                {task.type} · {STATUS_LABELS[task.status] ?? task.status} · 创建于 {formatTime(task.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">任务属性</CardTitle>
                <CardDescription>完整展示任务标识、执行状态和调度信息。</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <DetailField label="任务 ID" value={task.id} mono />
                  <DetailField label="任务域" value={DOMAIN_LABELS[task.domain] ?? task.domain} />
                  <DetailField label="作者" value={task.author?.displayName ?? (task.userId !== undefined ? task.userId : '—')} />
                  <DetailField label="关联记录" value={task.recordId ?? '—'} mono />
                  <DetailField label="尝试次数" value={`${task.attempts} / ${task.maxAttempts}`} />
                  <DetailField label="优先级" value={String(task.priority)} />
                  <DetailField label="开始时间" value={task.startedAt !== undefined ? formatTime(task.startedAt) : '—'} />
                  <DetailField label="结束时间" value={task.completedAt !== undefined ? formatTime(task.completedAt) : '—'} />
                  <DetailField label="创建时间" value={formatTime(task.createdAt)} />
                  <DetailField label="更新时间" value={formatTime(task.updatedAt)} />
                  <DetailField label="下次调度" value={formatTime(task.nextRunAt)} />
                  <DetailField label="耗时" value={task.durationMs !== undefined ? `${(task.durationMs / 1000).toFixed(1)} 秒` : '—'} />
                </dl>

                <TaskRequestContextSection
                  context={context}
                  loading={requestLoading}
                  error={requestError}
                />

                {task.error !== undefined && (
                  <section className="mt-6 rounded-lg bg-destructive/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-destructive">错误信息</h3>
                      <Badge variant="destructive">{task.error.code ?? task.error.category}</Badge>
                      {task.error.retriable && <Badge variant="outline">可重试</Badge>}
                    </div>
                    <p className="mt-2 break-words text-sm text-muted-foreground">{task.error.message}</p>
                  </section>
                )}

                <section className="mt-6">
                  <h3 className="text-sm font-medium">诊断上下文</h3>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5">
                    {JSON.stringify({
                      traceId: task.traceId,
                      recordContext: task.recordContext,
                      type: task.type,
                      domain: task.domain,
                      status: task.status,
                    }, null, 2)}
                  </pre>
                </section>
              </CardContent>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 管理后台任务中心：域/状态筛选、游标分页和只读任务详情。 */
export function TasksPage() {
  const [status, setStatus] = useState<TaskStatusFilter>('all')
  const [domain, setDomain] = useState<TaskDomainFilter>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined])
  const [selectedTask, setSelectedTask] = useState<AdminTaskItem | null>(null)
  const [taskRequestContext, setTaskRequestContext] = useState<AdminTaskRequestContext | null>(null)
  const [taskRequestLoading, setTaskRequestLoading] = useState(false)
  const [taskRequestError, setTaskRequestError] = useState<string | null>(null)

  const taskRequestSeq = useRef(0)

  // Batch 0c：游标栈保留为导航状态，取数交给 useQuery（键含 域+状态+页码+游标），
  // requestSeq 手写守卫作废。
  const cursor = pageCursors[pageIndex]
  const { data, isPending, error: queryError } = useQuery({
    queryKey: ['admin', 'tasks', domain, status, pageIndex, cursor],
    queryFn: () => apiClient.adminListTasks({
      limit: PAGE_SIZE,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(domain !== 'all' ? { domain } : {}),
    }),
  })
  const items = data?.items ?? []
  const hasNextPage = data?.nextCursor !== undefined
  const loading = isPending
  const error = queryError !== null ? userErrorMessage(queryError) : null

  // 把本页的 nextCursor 记录进游标栈，供"下一页"使用。
  useEffect(() => {
    const nextCursor = data?.nextCursor
    if (nextCursor === undefined) return
    setPageCursors(current => {
      const next = current.slice(0, pageIndex + 1)
      next[pageIndex + 1] = nextCursor
      return next
    })
  }, [data, pageIndex])

  useEffect(() => {
    setPageIndex(0)
    setPageCursors([undefined])
    taskRequestSeq.current += 1
    setSelectedTask(null)
    setTaskRequestContext(null)
    setTaskRequestLoading(false)
    setTaskRequestError(null)
    setPageIndex(0)
    setPageCursors([undefined])
  }, [domain, status])

  const handleNextPage = () => {
    const nextCursor = pageCursors[pageIndex + 1]
    if (!hasNextPage || nextCursor === undefined || loading) return
    setPageIndex(pageIndex + 1)
  }

  const handlePreviousPage = () => {
    if (pageIndex === 0 || loading) return
    setPageIndex(pageIndex - 1)
  }

  const openTask = (task: AdminTaskItem) => {
    const seq = ++taskRequestSeq.current
    setSelectedTask(task)
    setTaskRequestContext(null)
    setTaskRequestError(null)
    setTaskRequestLoading(true)

    void apiClient.adminGetTaskRequestContext(task.id)
      .then(context => {
        if (seq !== taskRequestSeq.current) return
        setTaskRequestContext(context)
      })
      .catch(err => {
        if (seq !== taskRequestSeq.current) return
        setTaskRequestError(userErrorMessage(err))
      })
      .finally(() => {
        if (seq === taskRequestSeq.current) setTaskRequestLoading(false)
      })
  }

  const handleTaskDetailOpenChange = (open: boolean) => {
    if (open) return
    taskRequestSeq.current += 1
    setSelectedTask(null)
    setTaskRequestContext(null)
    setTaskRequestLoading(false)
    setTaskRequestError(null)
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, task: AdminTaskItem) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openTask(task)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">任务中心</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={domain} onValueChange={value => setDomain(value as TaskDomainFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部域</SelectItem>
              <SelectItem value="generation">生成</SelectItem>
              <SelectItem value="artifact">产物</SelectItem>
              <SelectItem value="media">媒体</SelectItem>
              <SelectItem value="director">导演</SelectItem>
              <SelectItem value="canvas">画布</SelectItem>
              <SelectItem value="system">系统</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={value => setStatus(value as TaskStatusFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="queued">排队中</SelectItem>
              <SelectItem value="running">执行中</SelectItem>
              <SelectItem value="succeeded">成功</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        按业务域和状态筛选，结果按创建时间倒序；点击任意行查看完整诊断信息。
      </p>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">暂无任务</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1480px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-80">任务 ID</TableHead>
                    <TableHead className="w-44">类型 / 域</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-20">重试</TableHead>
                    <TableHead className="w-36">作者</TableHead>
                    <TableHead className="w-36">关联记录</TableHead>
                    <TableHead className="w-44">开始时间</TableHead>
                    <TableHead className="w-44">结束时间</TableHead>
                    <TableHead className="w-24">耗时</TableHead>
                    <TableHead className="w-64">错误</TableHead>
                    <TableHead className="w-56">创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer focus-visible:bg-muted/60"
                      tabIndex={0}
                      role="button"
                      aria-label={`查看任务 ${item.id}`}
                      onClick={() => openTask(item)}
                      onKeyDown={event => handleRowKeyDown(event, item)}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs">{item.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs">{item.type}</span>
                          <Badge variant="outline">{DOMAIN_LABELS[item.domain] ?? item.domain}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(item.status)}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.attempts}<span className="text-muted-foreground">/{item.maxAttempts}</span>
                      </TableCell>
                      <TableCell className="truncate text-xs text-muted-foreground">
                        {item.author?.displayName ?? (item.userId !== undefined ? shortId(item.userId) : '—')}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.recordId !== undefined ? shortId(item.recordId) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.startedAt !== undefined ? formatTime(item.startedAt) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.completedAt !== undefined ? formatTime(item.completedAt) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.durationMs !== undefined ? `${(item.durationMs / 1000).toFixed(1)}s` : '—'}
                      </TableCell>
                      <TableCell>
                        {item.error !== undefined ? (
                          <span className="line-clamp-2 max-w-56 text-xs text-destructive" title={item.error.message}>
                            <span className="font-mono">{item.error.code ?? item.error.category}</span> · {item.error.message}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTime(item.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && items.length > 0 && (pageIndex > 0 || hasNextPage) && (
        <div className="flex items-center justify-center gap-3 border-t pt-4">
          <Button variant="outline" size="sm" disabled={loading || pageIndex === 0} onClick={handlePreviousPage}>
            <ChevronLeft className="size-4" />
            上一页
          </Button>
          <span className="min-w-16 text-center text-sm text-muted-foreground">第 {pageIndex + 1} 页</span>
          <Button variant="outline" size="sm" disabled={loading || !hasNextPage} onClick={handleNextPage}>
            下一页
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      )}

      <TaskDetailDialog
        task={selectedTask}
        context={taskRequestContext}
        requestLoading={taskRequestLoading}
        requestError={taskRequestError}
        onOpenChange={handleTaskDetailOpenChange}
      />
    </div>
  )
}
