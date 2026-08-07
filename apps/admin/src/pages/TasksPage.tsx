import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { AdminTaskItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TaskStatusFilter = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

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

/**
 * 管理后台 · 任务中心：全量 task_records（含进行中 + 已完成），keyset 分页 +
 * 状态过滤。只读排障视角：展示作者/记录上下文/错误摘要/耗时，不提供变更操作。
 */
export function TasksPage() {
  const [status, setStatus] = useState<TaskStatusFilter>('all')
  const [items, setItems] = useState<AdminTaskItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestSeq = useRef(0)

  const loadFirst = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    setItems([])
    setNextCursor(undefined)
    try {
      const page = await apiClient.adminListTasks({
        ...(status !== 'all' ? { status } : {}),
      })
      if (seq !== requestSeq.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (nextCursor === undefined) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = await apiClient.adminListTasks({
        cursor: nextCursor,
        ...(status !== 'all' ? { status } : {}),
      })
      if (seq !== requestSeq.current) return
      setItems(current => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [nextCursor, status])

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
        全量任务（含进行中与已完成），按创建时间倒序；error 列为失败时的安全摘要。
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">任务 ID</TableHead>
                    <TableHead>类型 / 域</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-24">重试</TableHead>
                    <TableHead className="w-32">作者</TableHead>
                    <TableHead className="w-32">关联记录</TableHead>
                    <TableHead className="w-40">开始时间</TableHead>
                    <TableHead className="w-40">结束时间</TableHead>
                    <TableHead className="w-28">耗时</TableHead>
                    <TableHead>错误</TableHead>
                    <TableHead className="w-40">创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{shortId(item.id)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{item.type}</span>
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
                      <TableCell className="text-xs text-muted-foreground">
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

      {nextCursor !== undefined && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  )
}
