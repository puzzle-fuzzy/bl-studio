import { useCallback, useEffect, useRef, useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import type { ContentReport } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
  const [items, setItems] = useState<ContentReport[]>([])
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
      const page = await apiClient.adminListContentReports({
        ...(status !== 'all' ? { status: status as 'open' | 'reviewing' | 'resolved' | 'dismissed' } : {}),
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
      const page = await apiClient.adminListContentReports({
        cursor: nextCursor,
        ...(status !== 'all' ? { status: status as 'open' | 'reviewing' | 'resolved' | 'dismissed' } : {}),
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

  const updateReport = async (item: ContentReport, nextStatus: string, hideTarget: boolean) => {
    if (hideTarget && !window.confirm('确认下架这条公开作品？下架后普通用户将无法继续查看。')) return
    try {
      const updated = await apiClient.adminUpdateContentReport(item.id, {
        status: nextStatus as 'open' | 'reviewing' | 'resolved' | 'dismissed',
        ...(hideTarget ? { hideTarget: true } : {}),
      })
      setItems(current => current.map(candidate => candidate.id === item.id ? updated : candidate))
    } catch (err) {
      setError(userErrorMessage(err))
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
