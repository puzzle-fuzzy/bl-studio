import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Flag, Loader2 } from 'lucide-react'
import type { ContentReport } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@bailian-studio/ui'
import { Badge } from '@bailian-studio/ui'
import { Card, CardContent } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'

const REASON_LABELS: Record<string, string> = {
  unsafe: '不安全或违法',
  copyright: '版权问题',
  privacy: '隐私问题',
  spam: '垃圾内容',
  other: '其他',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'destructive',
  reviewing: 'secondary',
  resolved: 'default',
  dismissed: 'outline',
}

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  reviewing: '审核中',
  resolved: '已处理',
  dismissed: '已驳回',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

/** 内容举报管理：状态流转与可审计的目标作品下架。 */
export function ReportsPage() {
  const [status, setStatus] = useState<string>('all')
  // 变更操作（行内状态流转）的错误反馈；查询错误来自 useInfiniteQuery。
  const [mutationError, setMutationError] = useState<string | null>(null)
  const queryClient = useQueryClient()
// Batch 0c：useInfiniteQuery 承载 首载+追加（键含 status），requestSeq 守卫作废。
  const { data, isPending, error: queryError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ pageParam }) => apiClient.adminListContentReports({
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(status !== 'all' ? { status: status as 'open' | 'reviewing' | 'resolved' | 'dismissed' } : {}),
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
  })
  const items = data?.pages.flatMap(page => page.items) ?? []
  const loading = isPending
  const loadingMore = isFetchingNextPage
  const error = mutationError ?? (queryError !== null ? userErrorMessage(queryError) : null)

  const loadMore = () => {
    if (!hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }

  const updateReport = async (item: ContentReport, nextStatus: string, hideTarget: boolean) => {
    if (hideTarget && !window.confirm('确认下架这条公开作品？下架后普通用户将无法继续查看。')) return
    try {
      await apiClient.adminUpdateContentReport(item.id, {
        status: nextStatus as 'open' | 'reviewing' | 'resolved' | 'dismissed',
        ...(hideTarget ? { hideTarget: true } : {}),
      })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
    } catch (err) {
      setMutationError(userErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Flag data-icon />内容举报</h1>
          <p className="text-sm text-muted-foreground">人工审核用户举报；状态处理与作品下架都会记录审计日志。</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="open">待处理</SelectItem>
            <SelectItem value="reviewing">审核中</SelectItem>
            <SelectItem value="resolved">已处理</SelectItem>
            <SelectItem value="dismissed">已驳回</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">暂无举报</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">提交时间</TableHead>
                  <TableHead className="w-28">原因</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-44">举报人 / 作品</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="w-52">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="align-top text-muted-foreground">{formatTime(item.createdAt)}</TableCell>
                    <TableCell className="align-top"><Badge variant="outline">{REASON_LABELS[item.reason] ?? item.reason}</Badge></TableCell>
                    <TableCell className="align-top"><Badge variant={STATUS_VARIANTS[item.status] ?? 'secondary'}>{STATUS_LABELS[item.status] ?? item.status}</Badge></TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      <div>举报人：{item.reporterId.slice(0, 12)}</div>
                      <div>作品：{item.generationId.slice(0, 12)}</div>
                    </TableCell>
                    <TableCell className="max-w-md align-top whitespace-pre-wrap text-sm">{item.details ?? '（未补充说明）'}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-2">
                        <Select value={item.status} onValueChange={next => void updateReport(item, next, false)}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">待处理</SelectItem>
                            <SelectItem value="reviewing">审核中</SelectItem>
                            <SelectItem value="resolved">已处理</SelectItem>
                            <SelectItem value="dismissed">已驳回</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="destructive" onClick={() => void updateReport(item, 'resolved', true)}>
                          下架并标记已处理
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasNextPage && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  )
}
