import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { UserFeedback } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@bailian-studio/ui'
import { Badge } from '@bailian-studio/ui'
import { Card, CardContent } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'

const KIND_LABELS: Record<string, string> = {
  feedback: '意见反馈',
  bug: '问题反馈',
  suggestion: '功能建议',
  complaint: '投诉',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'destructive',
  reviewing: 'secondary',
  resolved: 'default',
  closed: 'outline',
}

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

/** 反馈管理：查看用户提交的意见，并流转状态。 */
export function FeedbackPage() {
  const [status, setStatus] = useState<string>('all')
  // 变更操作（行内状态流转）的错误反馈；查询错误来自 useInfiniteQuery。
  const [mutationError, setMutationError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  /** 请求序号：首载/翻页共用，防止状态切换时旧响应覆盖新数据。 */
// Batch 0c：useInfiniteQuery 承载 首载+追加（键含 status），requestSeq 守卫作废。
  const { data, isPending, error: queryError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'feedback', status],
    queryFn: ({ pageParam }) => apiClient.adminListFeedback({
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(status !== 'all' ? { status: status as 'open' | 'reviewing' | 'resolved' | 'closed' } : {}),
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

  const updateStatus = async (item: UserFeedback, next: string) => {
    try {
      await apiClient.adminUpdateFeedbackStatus(item.id, next as 'open' | 'reviewing' | 'resolved' | 'closed')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
    } catch (err) {
      setMutationError(userErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">反馈管理</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="open">待处理</SelectItem>
            <SelectItem value="reviewing">处理中</SelectItem>
            <SelectItem value="resolved">已解决</SelectItem>
            <SelectItem value="closed">已关闭</SelectItem>
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
            <p className="p-6 text-center text-sm text-muted-foreground">暂无反馈</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">提交时间</TableHead>
                  <TableHead className="w-24">类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-40">用户</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead className="w-32">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{formatTime(item.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[item.status] ?? 'secondary'}>{STATUS_LABELS[item.status] ?? item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.userId?.slice(0, 12) ?? '（已删除用户）'}</TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap text-sm">{item.content}</TableCell>
                    <TableCell>
                      <Select value={item.status} onValueChange={next => void updateStatus(item, next)}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">待处理</SelectItem>
                          <SelectItem value="reviewing">处理中</SelectItem>
                          <SelectItem value="resolved">已解决</SelectItem>
                          <SelectItem value="closed">已关闭</SelectItem>
                        </SelectContent>
                      </Select>
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
