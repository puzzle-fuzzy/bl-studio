import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Bookmark, BookmarkCheck, Check, Copy, FileText, Flag, Heart, Image as ImageIcon, Loader2, Music, Search, Sparkles, X } from 'lucide-react'
import type { GalleryDetail, GalleryItem } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Badge } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Textarea } from '@bailian-studio/ui'
import { useModelCatalog } from '@/hooks/use-model-catalog'
import { useAuthStore } from '@bailian-studio/app-shell'
import { UserAvatar } from '@/components/ui/user-avatar'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { notifyError } from '@/lib/toast'
import { modelNameZh } from '@/lib/model-modes'
import { encodeDeepLinkParams } from '@/lib/deeplink-params'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import { showMessage } from '@/lib/message'

type GalleryTab = 'community' | 'favorites'
type GalleryCategory = 'image' | 'video' | 'audio' | 'text'
type GallerySort = 'latest' | 'hot'

/**
 * 社区画廊：展示所有同事公开到社区的作品（默认私有，用户主动公开）。
 *
 * 发现能力：分类/模型/排序（最新·最热）/提示词搜索/按作者过滤（URL 同步可分享）。
 * 复用：作者本人走 `?reuse=`（完整还原参考图），他人走文本深链（隐私边界）。
 * 分页：首载与翻页分离 + 请求序号防乱序（修复 nextCursor 引发的无限刷新循环）。
 * 可访问性：操作按钮常显（触屏/键盘可达），媒体按钮与操作按钮平级（无嵌套 <button>）。
 */
export function GalleryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { models } = useModelCatalog()
    const currentUserId = useAuthStore(state => state.user?.id)

  // 发现状态（URL 同步，可分享）。
  const [tab, setTab] = useState<GalleryTab>(searchParams.get('tab') === 'favorites' ? 'favorites' : 'community')
  const [category, setCategory] = useState<string>(searchParams.get('category') ?? 'all')
  const [modelId, setModelId] = useState<string>(searchParams.get('model') ?? 'all')
  const [sort, setSort] = useState<GallerySort>(searchParams.get('sort') === 'hot' ? 'hot' : 'latest')
  const [authorId, setAuthorId] = useState<string>(searchParams.get('author') ?? '')
  const [authorName, setAuthorName] = useState<string>(searchParams.get('authorName') ?? '')
  const [q, setQ] = useState<string>(searchParams.get('q') ?? '')
  const [qInput, setQInput] = useState<string>(searchParams.get('q') ?? '')

  const [items, setItems] = useState<GalleryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GalleryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reportTarget, setReportTarget] = useState<string | null>(null)

  /** 点赞/收藏防抖：请求在途的 recordId，防止连点重复请求。 */
  const mutating = useRef(new Set<string>())
  /** 请求序号：首载/翻页共用，防止快速切换过滤器时旧响应覆盖新数据。 */
  const requestSeq = useRef(0)

  useEffect(() => {
  })

  /** 更新单个 URL 查询参数（删除空值），保持过滤器可分享。 */
  const updateUrlParam = useCallback((key: string, value: string | undefined) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === undefined || value.length === 0) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }, [setSearchParams])

  /** 首载：依赖仅过滤器；由 effect 驱动，与翻页互不耦合。 */
  const loadFirst = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setItems([])
    setNextCursor(undefined)
    try {
      const page = tab === 'favorites'
        ? await apiClient.listMyFavorites({})
        : await apiClient.listGallery(galleryParams({ category, modelId, authorId, q, sort }))
      if (seq !== requestSeq.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) notifyError(err)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [tab, category, modelId, authorId, q, sort])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  /** 翻页：只在「加载更多」按钮触发，闭包 nextCursor。 */
  const loadMore = useCallback(async () => {
    if (nextCursor === undefined) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = tab === 'favorites'
        ? await apiClient.listMyFavorites({ cursor: nextCursor })
        : await apiClient.listGallery({ ...galleryParams({ category, modelId, authorId, q, sort }), cursor: nextCursor })
      if (seq !== requestSeq.current) return
      setItems(current => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) notifyError(err)
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [nextCursor, tab, category, modelId, authorId, q, sort])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const term = qInput.trim()
    setQ(term)
    updateUrlParam('q', term.length > 0 ? term : undefined)
  }

  const clearSearch = () => {
    setQInput('')
    setQ('')
    updateUrlParam('q', undefined)
  }

  const changeTab = (value: GalleryTab) => {
    setTab(value)
    updateUrlParam('tab', value === 'favorites' ? 'favorites' : undefined)
  }

  const changeCategory = (value: string) => {
    setCategory(value)
    updateUrlParam('category', value === 'all' ? undefined : value)
  }

  const changeModel = (value: string) => {
    setModelId(value)
    updateUrlParam('model', value === 'all' ? undefined : value)
  }

  const changeSort = (value: GallerySort) => {
    setSort(value)
    updateUrlParam('sort', value === 'hot' ? 'hot' : undefined)
  }

  const filterByAuthor = (item: GalleryItem) => {
    setAuthorId(item.author.id)
    setAuthorName(item.author.displayName ?? item.author.id.slice(0, 8))
    updateUrlParam('author', item.author.id)
    updateUrlParam('authorName', item.author.displayName ?? undefined)
    if (tab !== 'community') changeTab('community')
  }

  const clearAuthor = () => {
    setAuthorId('')
    setAuthorName('')
    updateUrlParam('author', undefined)
    updateUrlParam('authorName', undefined)
  }

  const handleLike = async (item: GalleryItem) => {
    if (mutating.current.has(item.id)) return
    mutating.current.add(item.id)
    try {
      const result = item.likedByViewer
        ? await apiClient.unlikeGeneration(item.id)
        : await apiClient.likeGeneration(item.id)
      setItems(current => current.map(candidate => candidate.id === item.id
        ? { ...candidate, likedByViewer: result.liked, likeCount: result.likeCount }
        : candidate))
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      mutating.current.delete(item.id)
    }
  }

  const handleFavorite = async (item: GalleryItem) => {
    if (mutating.current.has(item.id)) return
    mutating.current.add(item.id)
    try {
      const favorited = !item.favoritedByViewer
      if (favorited) await apiClient.favoriteGeneration(item.id)
      else await apiClient.unfavoriteGeneration(item.id)
      setItems(current => current.map(candidate => candidate.id === item.id
        ? { ...candidate, favoritedByViewer: favorited }
        : candidate))
      if (tab === 'favorites' && !favorited) {
        setItems(current => current.filter(candidate => candidate.id !== item.id))
      }
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      mutating.current.delete(item.id)
    }
  }

  /** 复用：作者本人完整还原参考图（?reuse= owner 链路），他人仅文本参数（隐私边界）。 */
  const handleReuse = (item: GalleryItem) => {
    if (currentUserId !== undefined && currentUserId === item.author.id) {
      navigate(`/create?reuse=${encodeURIComponent(item.id)}`)
    } else {
      navigate(`/create?select=${encodeURIComponent(item.modelId)}&params=${encodeDeepLinkParams(item.inputParams)}`)
    }
  }

  const openDetail = async (item: GalleryItem) => {
    setDetailId(item.id)
    setDetailLoading(true)
    setDetail(null)
    try {
      setDetail(await apiClient.getGalleryGeneration(item.id))
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDetailLike = async () => {
    if (detail === null || mutating.current.has(detail.record.id)) return
    mutating.current.add(detail.record.id)
    try {
      const result = detail.likedByViewer
        ? await apiClient.unlikeGeneration(detail.record.id)
        : await apiClient.likeGeneration(detail.record.id)
      setDetail({ ...detail, likedByViewer: result.liked, likeCount: result.likeCount })
      setItems(current => current.map(candidate => candidate.id === detail.record.id
        ? { ...candidate, likedByViewer: result.liked, likeCount: result.likeCount }
        : candidate))
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      mutating.current.delete(detail.record.id)
    }
  }

  const handleDetailFavorite = async () => {
    if (detail === null || mutating.current.has(detail.record.id)) return
    mutating.current.add(detail.record.id)
    try {
      const favorited = !detail.favoritedByViewer
      if (favorited) await apiClient.favoriteGeneration(detail.record.id)
      else await apiClient.unfavoriteGeneration(detail.record.id)
      setDetail({ ...detail, favoritedByViewer: favorited })
      setItems(current => current.map(candidate => candidate.id === detail.record.id
        ? { ...candidate, favoritedByViewer: favorited }
        : candidate))
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      mutating.current.delete(detail.record.id)
    }
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">画廊</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <div>
            <Select value={tab} onValueChange={value => changeTab(value as GalleryTab)}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="community">全部作品</SelectItem>
                <SelectItem value="favorites">我的收藏</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={category} onValueChange={changeCategory} disabled={tab === 'favorites'}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
                <SelectItem value="audio">音频</SelectItem>
                <SelectItem value="text">文本</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Select value={modelId} onValueChange={changeModel} disabled={tab === 'favorites'}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="全部模型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模型</SelectItem>
                {models.map(model => (
                  <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={sort} onValueChange={value => changeSort(value as GallerySort)} disabled={tab === 'favorites'}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">最新发布</SelectItem>
                <SelectItem value="hot">最热</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex w-full max-w-sm items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={event => setQInput(event.target.value)}
              placeholder="搜索提示词…"
              className="pl-8 pr-8"
              disabled={tab === 'favorites'}
            />
            {qInput.length > 0 && (
              <button
                type="button"
                onClick={() => setQInput('')}
                aria-label="清空搜索"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X data-icon className="size-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="outline" disabled={tab === 'favorites'}>搜索</Button>
          {q.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>清除</Button>
          )}
        </form>

        {authorId.length > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
            <span className="text-muted-foreground">只看 TA 的作品：</span>
            <span className="font-medium">{authorName || authorId.slice(0, 8)}</span>
            <button type="button" onClick={clearAuthor} aria-label="清除作者过滤" className="text-muted-foreground hover:text-foreground">
              <X data-icon className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {tab === 'favorites'
          ? '我的收藏：收藏自己或同事公开到社区的作品。'
          : '同事公开到社区的作品；点击卡片查看详情，可点赞/收藏/用同参数生成。'}
      </p>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {tab === 'favorites'
            ? '还没有收藏任何作品'
            : authorId.length > 0
              ? '该作者还没有公开的作品'
              : '还没有公开的作品，去创作页把你的作品公开到社区吧'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(item => (
            <GalleryCard
              key={item.id}
              item={item}
              modelLabel={modelLabel(models, item.modelId)}
              isAuthor={currentUserId !== undefined && currentUserId === item.author.id}
              onOpen={() => void openDetail(item)}
              onLike={() => void handleLike(item)}
              onFavorite={() => void handleFavorite(item)}
              onReuse={() => handleReuse(item)}
              onAuthorClick={() => filterByAuthor(item)}
            />
          ))}
        </div>
      )}

      {nextCursor !== undefined && items.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
          </Button>
        </div>
      )}

      <Dialog open={detailId !== null} onOpenChange={open => { if (!open) setDetailId(null) }}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
          {detailLoading && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              加载中…
            </div>
          )}
          {detail !== null && (
            <GalleryDetailView
              detail={detail}
              isAuthor={currentUserId !== undefined && currentUserId === detail.author.id}
              onLike={() => void handleDetailLike()}
              onFavorite={() => void handleDetailFavorite()}
              onReuse={() => handleReuse({
                id: detail.record.id,
                modelId: detail.record.modelId,
                category: detail.record.category,
                author: detail.author,
                inputParams: detail.record.inputParams,
                likeCount: detail.likeCount,
                likedByViewer: detail.likedByViewer,
                favoritedByViewer: detail.favoritedByViewer,
                createdAt: detail.record.createdAt,
              })}
              onReport={() => setReportTarget(detail.record.id)}
            />
          )}
        </DialogContent>
      </Dialog>
      <ReportDialog
        generationId={reportTarget ?? ''}
        open={reportTarget !== null}
        onOpenChange={open => { if (!open) setReportTarget(null) }}
        onSubmitted={() => showMessage({ title: '举报已提交，管理员会人工审核', tone: 'success' })}
      />
    </div>
  )
}

/** 组装画廊列表参数（favorites 标签不使用搜索/排序）。 */
function galleryParams(params: {
  category: string
  modelId: string
  authorId: string
  q: string
  sort: GallerySort
}): Parameters<typeof apiClient.listGallery>[0] {
  return {
    ...(params.category !== 'all' ? { category: params.category as GalleryCategory } : {}),
    ...(params.modelId !== 'all' ? { modelId: params.modelId } : {}),
    ...(params.authorId.length > 0 ? { authorId: params.authorId } : {}),
    ...(params.q.trim().length > 0 ? { q: params.q.trim() } : {}),
    ...(params.sort !== 'latest' ? { sort: params.sort } : {}),
  }
}

function GalleryCard({
  item,
  modelLabel,
  isAuthor,
  onOpen,
  onLike,
  onFavorite,
  onReuse,
  onAuthorClick,
}: {
  item: GalleryItem
  modelLabel: string
  isAuthor: boolean
  onOpen: () => void
  onLike: () => void
  onFavorite: () => void
  onReuse: () => void
  onAuthorClick: () => void
}) {
  // 封面：优先用已生成的首帧缩略图（<img>，轻量）；视频无缩略图时退化为 <video preload="metadata">。
  const thumbUrl = resolveApiUrl(item.cover?.thumbnailUrl)
  const videoUrl = item.category === 'video' ? resolveApiUrl(item.cover?.readUrl) : ''
  const coverUrl = resolveApiUrl(item.cover?.readUrl ?? item.cover?.thumbnailUrl)
  const prompt = typeof item.inputParams.prompt === 'string' ? item.inputParams.prompt : ''

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="relative">
        {/* 媒体区：独立按钮（打开详情），与操作按钮平级，避免嵌套 <button>。 */}
        <button type="button" onClick={onOpen} aria-label="查看详情" className="relative block aspect-square w-full overflow-hidden bg-muted">
          {renderCardMedia(item, thumbUrl, videoUrl, coverUrl, prompt)}
        </button>
        {/* 操作按钮组：兄弟节点 + pointer-events 隔离；毛玻璃背景不遮挡效果图。 */}
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1 bg-linear-to-t from-black/30 via-transparent to-transparent p-2">
          <Button size="sm" variant="glass" className="pointer-events-auto" onClick={onReuse}>
            <Sparkles data-icon />
            {isAuthor ? '同参数·含参考图' : '同参数'}
          </Button>
          <Button size="icon-sm" variant="glass" className="pointer-events-auto" onClick={onFavorite} aria-label={item.favoritedByViewer ? '取消收藏' : '收藏'}>
            {item.favoritedByViewer ? <BookmarkCheck data-icon className="text-primary" /> : <Bookmark data-icon />}
          </Button>
          <Button size="icon-sm" variant="glass" className="pointer-events-auto" onClick={onLike} aria-label={item.likedByViewer ? '取消点赞' : '点赞'}>
            <Heart data-icon className={item.likedByViewer ? 'fill-current text-destructive' : undefined} />
          </Button>
        </div>
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="max-w-[60%] truncate">{modelLabel}</Badge>
          <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
            <Heart data-icon className="size-3" />
            {item.likeCount}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar userId={item.author.id} name={item.author.displayName} size="sm" className="shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <button type="button" onClick={onAuthorClick} className="transition-colors hover:text-foreground hover:underline">
              {item.author.displayName ?? item.author.id.slice(0, 8)}
            </button>
            {' · '}{formatTime(item.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

/** 卡片媒体区：图片/视频封面、text 占位、audio 占位，绝不用 readUrl 当 <img>（text 会破图）。 */
function renderCardMedia(
  item: GalleryItem,
  thumbUrl: string,
  videoUrl: string,
  coverUrl: string,
  prompt: string,
): React.ReactNode {
  if (thumbUrl.length > 0) {
    return <img src={thumbUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
  }
  if (item.category === 'video' && videoUrl.length > 0) {
    return <video src={videoUrl} muted playsInline preload="metadata" className="size-full object-cover transition-transform group-hover:scale-105" />
  }
  if (item.category === 'text') {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Sparkles data-icon className="size-5 text-muted-foreground" />
        <span className="line-clamp-3 text-xs text-muted-foreground">{prompt.length > 0 ? prompt : '文本作品'}</span>
      </div>
    )
  }
  if (item.category !== 'audio' && coverUrl.length > 0) {
    return <img src={coverUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
  }
  return <span className="flex size-full items-center justify-center text-xs text-muted-foreground">{item.category}</span>
}

function GalleryDetailView({
  detail,
  isAuthor,
  onLike,
  onFavorite,
  onReuse,
  onReport,
}: {
  detail: GalleryDetail
  isAuthor: boolean
  onLike: () => void
  onFavorite: () => void
  onReuse: () => void
  onReport: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const prompt = typeof detail.record.inputParams.prompt === 'string' ? detail.record.inputParams.prompt : ''
  const lightboxItems: LightboxMedia[] = detail.artifacts.map(artifact => ({
    key: artifact.id,
    kind: isLightboxKind(artifact.kind) ? artifact.kind : 'text',
    url: artifact.readUrl,
    thumbnailUrl: artifact.thumbnailUrl ?? artifact.readUrl,
    fileName: `${artifact.kind}作品`,
    text: artifact.text ?? (artifact.kind === 'archive' ? '归档文件暂不支持网页内展开预览。' : undefined),
  }))

  const handleCopyPrompt = async () => {
    await navigator.clipboard?.writeText(prompt).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary">{detail.record.modelId}</Badge>
            <UserAvatar userId={detail.author.id} name={detail.author.displayName} size="sm" />
            <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">{detail.author.displayName ?? detail.author.id.slice(0, 8)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <button
              type="button"
              onClick={onReuse}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              <Sparkles data-icon className="size-3.5" />
              {isAuthor ? '同参数·含参考图' : '同参数生成'}
            </button>
            <button
              type="button"
              onClick={onFavorite}
              aria-label={detail.favoritedByViewer ? '取消收藏' : '收藏'}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              {detail.favoritedByViewer ? <BookmarkCheck data-icon className="size-3.5 text-primary" /> : <Bookmark data-icon className="size-3.5" />}
              收藏
            </button>
            <button
              type="button"
              onClick={onLike}
              aria-label={detail.likedByViewer ? '取消点赞' : '点赞'}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              <Heart data-icon className={detail.likedByViewer ? 'size-3.5 fill-current text-destructive' : 'size-3.5'} />
              {detail.likeCount}
            </button>
            <button
              type="button"
              onClick={onReport}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Flag data-icon className="size-3.5" />
              举报
            </button>
          </div>
        </DialogTitle>
        {prompt.length > 0 && (
          <div className="flex items-start gap-2">
            <DialogDescription className="flex-1 line-clamp-4 text-left whitespace-pre-wrap">
              {prompt}
            </DialogDescription>
            <Button size="icon-sm" variant="ghost" onClick={() => void handleCopyPrompt()} aria-label="复制提示词" className="mt-0.5 shrink-0">
              {copied ? <Check data-icon className="text-primary" /> : <Copy data-icon />}
            </Button>
          </div>
        )}
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {detail.artifacts.map((artifact, index) => {
          const url = artifact.readUrl ?? artifact.thumbnailUrl
          return (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setPreviewIndex(index)}
              aria-label={`预览${artifact.kind}作品`}
              className="group relative flex min-h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-muted text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {artifact.kind === 'video' && url !== undefined ? (
                <video src={resolveApiUrl(url)} muted playsInline preload="metadata" className="aspect-video w-full object-contain" />
              ) : artifact.kind === 'audio' ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Music className="size-8" />
                  <span className="text-xs">点击播放音频</span>
                </div>
              ) : artifact.kind === 'text' ? (
                <div className="flex w-full items-start gap-2 p-4 text-sm">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-8 whitespace-pre-wrap">{artifact.text ?? '文本作品'}</span>
                </div>
              ) : url !== undefined ? (
                <img src={resolveApiUrl(url)} alt="" className="max-h-72 w-full object-contain" loading="lazy" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <ImageIcon className="size-8" />
                  <span className="text-xs">暂无预览</span>
                </div>
              )}
              <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/65 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                点击预览
              </span>
            </button>
          )
        })}
      </div>
      {previewIndex !== null && lightboxItems.length > 0 && (
        <MediaLightbox
          items={lightboxItems}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          downloadUrl={lightboxItems[previewIndex]?.url !== undefined
            ? resolveApiUrl(lightboxItems[previewIndex]?.url ?? '')
            : undefined}
        />
      )}
    </>
  )
}

function ReportDialog({
  generationId,
  open,
  onOpenChange,
  onSubmitted,
}: {
  generationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}) {
  const [reason, setReason] = useState<'unsafe' | 'copyright' | 'privacy' | 'spam' | 'other'>('unsafe')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await apiClient.submitContentReport({
        generationId,
        reason,
        ...(details.trim().length > 0 ? { details: details.trim() } : {}),
      })
      setDetails('')
      onOpenChange(false)
      onSubmitted()
    } catch (err) {
      notifyError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>举报公开作品</DialogTitle>
          <DialogDescription>请提供事实信息；举报会进入管理员人工审核队列。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Select value={reason} onValueChange={value => setReason(value as typeof reason)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unsafe">不安全或违法内容</SelectItem>
              <SelectItem value="copyright">疑似侵犯版权</SelectItem>
              <SelectItem value="privacy">隐私或个人信息</SelectItem>
              <SelectItem value="spam">垃圾内容或滥用</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
          <Textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={2000} placeholder="补充说明（可选）" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={busy || generationId.length === 0}>{busy ? '提交中…' : '提交举报'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function modelLabel(models: readonly import('@bailian-studio/api-client').ModelCatalogItem[], modelId: string): string {
  const model = models.find(candidate => candidate.id === modelId)
  return model !== undefined ? modelNameZh(model) : modelId
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN')
}
