import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { ImageIcon, Loader2, Search } from 'lucide-react'
import type { AdminGalleryItem } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import { Button } from '@bailian-studio/ui'
import { Badge } from '@bailian-studio/ui'
import { Card, CardContent } from '@bailian-studio/ui'
import { Checkbox } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@bailian-studio/ui'

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
  // 操作反馈（批量治理结果/失败）；查询错误来自 useInfiniteQuery。
  const [notice, setNotice] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')

  const [confirmTarget, setConfirmTarget] = useState<{ item: AdminGalleryItem; action: 'hide' | 'unhide' } | null>(null)
  const [mutating, setMutating] = useState(false)

  const [preview, setPreview] = useState<{ items: LightboxMedia[]; index: number } | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  // Batch 0c：useInfiniteQuery 承载 首载+追加（键含 q），requestSeq 守卫作废。
  const {
    data,
    isPending: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
  } = useInfiniteQuery({
    queryKey: ['admin', 'gallery', q],
    queryFn: ({ pageParam }) => apiClient.adminListGallery({
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(q.trim().length > 0 ? { q: q.trim() } : {}),
      // admin 治理需要看到全部（含已下架）；「仅已下架」在客户端筛选（下架项很少）。
      includeHidden: true,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
  })
  const items = data?.pages.flatMap(page => page.items) ?? []
  const error = notice ?? (queryError !== null ? userErrorMessage(queryError) : null)

  const invalidateGallery = () => queryClient.invalidateQueries({ queryKey: ['admin', 'gallery'] })

  const loadMore = () => {
    if (!hasNextPage || loadingMore) return
    void fetchNextPage()
  }

  // 搜索词变化清空勾选（原先在 loadFirst 里做）。
  useEffect(() => {
    setSelected(new Set())
  }, [q])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setQ(qInput.trim())
  }

  const visibleItems = items.filter(item => (visibility === 'hidden' ? item.hiddenAt !== undefined : true))

  // 多选批量治理（覆盖当前页可见项；loadFirst 时重置选择）。
  const selectableRows = visibleItems
  const allSelected = selectableRows.length > 0 && selectableRows.every(item => selected.has(item.id))
  const someSelected = selectableRows.some(item => selected.has(item.id))
  const selectedCount = selected.size

  const toggleSelect = (id: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(current => {
      const next = new Set(current)
      if (allSelected) {
        for (const item of selectableRows) next.delete(item.id)
      } else {
        for (const item of selectableRows) next.add(item.id)
      }
      return next
    })
  }

  const runBatch = async (op: () => Promise<unknown>, okMessage: string) => {
    if (selectedCount === 0) return
    setBatchBusy(true)
    setNotice(null)
    try {
      const result = await op()
      const affected = typeof result === 'object' && result !== null && 'affected' in result
        ? String((result as { affected: number }).affected)
        : String(selectedCount)
      setNotice(`${okMessage}：${affected} 个作品`)
      void invalidateGallery()
    } catch (err) {
      setNotice(userErrorMessage(err))
    } finally {
      setBatchBusy(false)
    }
  }

  const handleBatchHide = () => {
    void runBatch(
      () => apiClient.adminBatchHideGallery({ ids: [...selected] }),
      '已下架',
    )
  }

  const handleBatchUnhide = () => {
    void runBatch(
      () => apiClient.adminBatchUnhideGallery({ ids: [...selected] }),
      '已恢复',
    )
  }

  const handleBatchDelete = () => {
    setBatchDeleteOpen(false)
    void runBatch(
      () => apiClient.adminBatchDeleteGallery({ ids: [...selected] }),
      '已删除',
    )
  }

  const confirmHide = (item: AdminGalleryItem) => setConfirmTarget({ item, action: 'hide' })
  const confirmUnhide = (item: AdminGalleryItem) => setConfirmTarget({ item, action: 'unhide' })

  /** 拉取该记录的全部产物 → 映射 LightboxMedia → 打开全屏预览弹窗（遮罩 + 下载）。 */
  const openPreview = async (item: AdminGalleryItem) => {
    setPreviewLoadingId(item.id)
    setNotice(null)
    try {
      const { items } = await apiClient.adminListGalleryArtifacts(item.id)
      const media: LightboxMedia[] = items.map(artifact => ({
        key: artifact.id,
        kind: isLightboxKind(artifact.kind) ? artifact.kind : 'image',
        url: artifact.readUrl,
        thumbnailUrl: artifact.thumbnailUrl,
        fileName: '作品预览',
        text: artifact.text,
      }))
      setPreview({ items: media, index: 0 })
    } catch (err) {
      setNotice(userErrorMessage(err))
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const executeConfirm = async () => {
    if (confirmTarget === null) return
    const { item, action } = confirmTarget
    setMutating(true)
    try {
      if (action === 'hide') await apiClient.adminHideGalleryItem(item.id)
      else await apiClient.adminUnhideGalleryItem(item.id)
      void invalidateGallery()
      setConfirmTarget(null)
    } catch (err) {
      setNotice(userErrorMessage(err))
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

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">已选 {selectedCount} 个作品</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={batchBusy} onClick={handleBatchUnhide}>
              {batchBusy ? <Loader2 className="size-4 animate-spin" /> : '批量恢复'}
            </Button>
            <Button size="sm" variant="destructive" disabled={batchBusy} onClick={handleBatchHide}>
              {batchBusy ? <Loader2 className="size-4 animate-spin" /> : '批量下架'}
            </Button>
            <Button size="sm" variant="destructive" disabled={batchBusy} onClick={() => setBatchDeleteOpen(true)}>
              {batchBusy ? <Loader2 className="size-4 animate-spin" /> : '批量删除'}
            </Button>
          </div>
        </div>
      )}

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
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="全选当前页"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableRows.length === 0}
                    />
                  </TableHead>
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
                      <Checkbox
                        aria-label={`选择作品 ${item.id}`}
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => void openPreview(item)}
                        title="点击预览"
                        aria-label={`预览作品 ${item.id}`}
                        className="cursor-pointer rounded-md ring-offset-2 transition-shadow hover:ring-2 hover:ring-ring"
                      >
                        {previewLoadingId === item.id
                          ? <div className="flex size-12 items-center justify-center rounded-md bg-muted"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
                          : <CoverThumb item={item} />}
                      </button>
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

      {hasNextPage && visibleItems.length > 0 && (
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

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除？</AlertDialogTitle>
            <AlertDialogDescription>
              将软删除选中的 {selectedCount} 个作品：从社区画廊消失，数据保留可恢复（管理员可重新公开/恢复）。此操作会写入审计日志。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchBusy}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} disabled={batchBusy}>
              {batchBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {preview !== null && preview.items.length > 0 && (
        <MediaLightbox
          items={preview.items}
          index={preview.index}
          onIndexChange={index => setPreview(current => (current === null ? null : { ...current, index }))}
          onClose={() => setPreview(null)}
          downloadUrl={
            preview.items[preview.index]?.url !== undefined
              ? resolveApiUrl(preview.items[preview.index]?.url)
              : undefined
          }
        />
      )}
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
