import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2, Search } from 'lucide-react'
import type { AdminGalleryItem } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

type VisibilityFilter = 'all' | 'hidden'

const CATEGORY_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

/**
 * 社区画廊治理：admin 视角列出全部公开作品（含已下架），支持搜索与单条下架/恢复。
 * 下架走 hiddenAt 置位（画廊立即不可见），恢复即时生效；封禁用户会联动隐藏其公开作品。
 */
export function GalleryManagePage() {
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const [items, setItems] = useState<AdminGalleryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')

  const [confirmTarget, setConfirmTarget] = useState<{ item: AdminGalleryItem; action: 'hide' | 'unhide' } | null>(null)
  const [mutating, setMutating] = useState(false)

  const requestSeq = useRef(0)

  // 首载与翻页分离（同 web 端模式）：loadFirst 依赖过滤器；loadMore 闭包游标。
  const loadFirst = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    setItems([])
    setNextCursor(undefined)
    try {
      const page = await apiClient.adminListGallery({
        ...(q.trim().length > 0 ? { q: q.trim() } : {}),
        // admin 治理需要看到全部（含已下架）；「仅已下架」在客户端筛选（下架项很少）。
        includeHidden: true,
      })
      if (seq !== requestSeq.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [q, visibility])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (nextCursor === undefined) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = await apiClient.adminListGallery({
        cursor: nextCursor,
        ...(q.trim().length > 0 ? { q: q.trim() } : {}),
        includeHidden: true,
      })
      if (seq !== requestSeq.current) return
      setItems(current => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [nextCursor, q, visibility])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setQ(qInput.trim())
  }

  const visibleItems = items.filter(item => (visibility === 'hidden' ? item.hiddenAt !== undefined : true))

  const confirmHide = (item: AdminGalleryItem) => setConfirmTarget({ item, action: 'hide' })
  const confirmUnhide = (item: AdminGalleryItem) => setConfirmTarget({ item, action: 'unhide' })

  const executeConfirm = async () => {
    if (confirmTarget === null) return
    const { item, action } = confirmTarget
    setMutating(true)
    try {
      if (action === 'hide') await apiClient.adminHideGalleryItem(item.id)
      else await apiClient.adminUnhideGalleryItem(item.id)
      setItems(current => current.map(candidate => candidate.id === item.id
        ? {
            ...candidate,
            ...(action === 'hide'
              ? { hiddenAt: new Date().toISOString() }
              : { hiddenAt: undefined, hiddenBy: undefined }),
          }
        : candidate))
      setConfirmTarget(null)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setMutating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">社区画廊治理</h1>
        <Select value={visibility} onValueChange={value => setVisibility(value as VisibilityFilter)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部作品</SelectItem>
            <SelectItem value="hidden">仅已下架</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={event => setQInput(event.target.value)} placeholder="搜索提示词…" className="pl-8" />
        </div>
        <Button type="submit" variant="outline">搜索</Button>
      </form>

      <p className="text-xs text-muted-foreground">
        下架后作品从社区画廊消失但保留数据；恢复即时生效。封禁用户会自动隐藏其全部公开作品。
      </p>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : visibleItems.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">暂无公开作品</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">封面</TableHead>
                  <TableHead>模型 / 类型</TableHead>
                  <TableHead className="w-32">作者</TableHead>
                  <TableHead className="w-16">点赞</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-40">创建时间</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <CoverThumb item={item} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.modelId}</Badge>
                        <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.author.displayName ?? item.author.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{item.likeCount}</TableCell>
                    <TableCell>
                      {item.hiddenAt !== undefined
                        ? <Badge variant="destructive">已下架</Badge>
                        : <Badge variant="default">公开</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(item.createdAt)}</TableCell>
                    <TableCell>
                      {item.hiddenAt !== undefined
                        ? (
                          <Button size="sm" variant="outline" onClick={() => confirmUnhide(item)}>恢复</Button>
                        )
                        : (
                          <Button size="sm" variant="destructive" onClick={() => confirmHide(item)}>下架</Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {nextCursor !== undefined && visibleItems.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmTarget !== null} onOpenChange={open => { if (!open) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === 'hide' ? '确认下架该作品？' : '确认恢复该作品？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.action === 'hide'
                ? '下架后作品将从社区画廊消失，但数据保留；可随时恢复。此操作会写入审计日志。'
                : '恢复后作品将重新出现在社区画廊（若作者已被封禁则仍不可见）。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeConfirm()} disabled={mutating}>
              {mutating ? <Loader2 className="size-4 animate-spin" /> : null}
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CoverThumb({ item }: { item: AdminGalleryItem }) {
  const url = resolveApiUrl(item.cover?.thumbnailUrl ?? item.cover?.readUrl)
  if (url.length === 0 || item.category === 'text' || item.category === 'audio') {
    return (
      <div className="flex size-12 items-center justify-center rounded-md bg-muted">
        <ImageIcon data-icon className="size-4 text-muted-foreground" />
      </div>
    )
  }
  return <img src={url} alt="" className="size-12 rounded-md object-cover" loading="lazy" />
}
