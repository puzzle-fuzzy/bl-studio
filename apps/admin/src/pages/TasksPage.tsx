import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { AdminTaskItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TaskStatusFilter = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

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

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1 rounded-lg border bg-muted/20 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs' : 'break-words text-sm'}>{value}</dd>
    </div>
  )
}

function TaskDetailDialog({ task, onOpenChange }: { task: AdminTaskItem | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] max-w-3xl overflow-y-auto">
        {task !== null && (
          <>
            <DialogHeader>
              <DialogTitle>任务详情</DialogTitle>
              <DialogDescription>
                {task.type} · {STATUS_LABELS[task.status] ?? task.status} · 创建于 {formatTime(task.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-3 sm:grid-cols-2">
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

            {task.error !== undefined && (
              <section className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-destructive">错误信息</h3>
                  <Badge variant="destructive">{task.error.code ?? task.error.category}</Badge>
                  {task.error.retriable && <Badge variant="outline">可重试</Badge>}
                </div>
                <p className="break-words text-sm text-muted-foreground">{task.error.message}</p>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">诊断上下文</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5">
                {JSON.stringify({
                  traceId: task.traceId,
                  recordContext: task.recordContext,
                  type: task.type,
                  domain: task.domain,
                  status: task.status,
                }, null, 2)}
              </pre>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 管理后台任务中心：状态筛选、游标分页和只读任务详情。 */
export function TasksPage() {
  const [status, setStatus] = useState<TaskStatusFilter>('all')
  const [items, setItems] = useState<AdminTaskItem[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [selectedTask, setSelectedTask] = useState<AdminTaskItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestSeq = useRef(0)

  const loadPage = useCallback(async (targetPage: number, cursor?: string) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    setItems([])

    try {
      const page = await apiClient.adminListTasks({
        limit: PAGE_SIZE,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(status !== 'all' ? { status } : {}),
      })
      if (seq !== requestSeq.current) return

      setItems(page.items)
      setPageIndex(targetPage)
      setHasNextPage(page.nextCursor !== undefined)
      setPageCursors(current => {
        const next = current.slice(0, targetPage + 1)
        if (page.nextCursor !== undefined) next[targetPage + 1] = page.nextCursor
        return next
      })
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [status])

  useEffect(() => {
    setPageIndex(0)
    setPageCursors([undefined])
    setHasNextPage(false)
    setSelectedTask(null)
    void loadPage(0)
  }, [loadPage])

  const handleNextPage = () => {
    const nextCursor = pageCursors[pageIndex + 1]
    if (!hasNextPage || nextCursor === undefined || loading) return
    void loadPage(pageIndex + 1, nextCursor)
  }

  const handlePreviousPage = () => {
    if (pageIndex === 0 || loading) return
    void loadPage(pageIndex - 1, pageCursors[pageIndex - 1])
  }

  const openTask = (task: AdminTaskItem) => setSelectedTask(task)

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, task: AdminTaskItem) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openTask(task)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">任务中心</h1>
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

      <p className="text-xs text-muted-foreground">
        全量任务（含进行中与已完成），按创建时间倒序；点击任意行查看完整诊断信息。
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
              <Table className="min-w-[1320px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">任务 ID</TableHead>
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
                      aria-label={`查看任务 ${shortId(item.id)}`}
                      onClick={() => openTask(item)}
                      onKeyDown={event => handleRowKeyDown(event, item)}
                    >
                      <TableCell className="font-mono text-xs">{shortId(item.id)}</TableCell>
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

      <TaskDetailDialog task={selectedTask} onOpenChange={open => !open && setSelectedTask(null)} />
    </div>
  )
}
