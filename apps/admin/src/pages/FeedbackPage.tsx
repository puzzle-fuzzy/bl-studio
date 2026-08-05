import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { UserFeedback } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
  const [items, setItems] = useState<UserFeedback[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true)
      setItems([])
      setNextCursor(undefined)
    } else {
      setLoadingMore(true)
    }
    setError(null)
    try {
      const page = await apiClient.adminListFeedback({
        ...(reset ? {} : nextCursor !== undefined ? { cursor: nextCursor } : {}),
        ...(status !== 'all' ? { status: status as 'open' | 'reviewing' | 'resolved' | 'closed' } : {}),
      })
      setItems(current => reset ? page.items : [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [status, nextCursor])

  useEffect(() => {
    void load(true)
  }, [load])

  const updateStatus = async (item: UserFeedback, next: string) => {
    try {
      const updated = await apiClient.adminUpdateFeedbackStatus(item.id, next as 'open' | 'reviewing' | 'resolved' | 'closed')
      setItems(current => current.map(candidate => candidate.id === item.id ? updated : candidate))
    } catch (err) {
      setError(userErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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

      {nextCursor !== undefined && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void load(false)}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  )
}
