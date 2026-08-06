import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bookmark, BookmarkCheck, Check, Copy, Heart, Loader2, Sparkles } from 'lucide-react'
import type { GalleryDetail, GalleryItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useModelCatalogStore } from '@/stores/model-catalog-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { modelNameZh } from '@/lib/model-modes'
import { encodeDeepLinkParams } from '@/lib/deeplink-params'

type GalleryTab = 'community' | 'favorites'

/**
 * 社区画廊：展示所有同事公开到社区的作品（默认私有，用户主动公开）。
 * 支持点赞 / 收藏 / 用同参数生成 / 详情预览；「我的收藏」切换我的书签。
 */
export function GalleryPage() {
  const navigate = useNavigate()
  const showMessage = useNotificationsStore(state => state.showMessage)
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)

  const [tab, setTab] = useState<GalleryTab>('community')
  const [category, setCategory] = useState<string>('all')
  const [items, setItems] = useState<GalleryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GalleryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

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
      const page = tab === 'favorites'
        ? await apiClient.listMyFavorites({ ...(reset ? {} : nextCursor !== undefined ? { cursor: nextCursor } : {}) })
        : await apiClient.listGallery({
            ...(reset ? {} : nextCursor !== undefined ? { cursor: nextCursor } : {}),
            ...(category !== 'all' ? { category: category as 'image' | 'video' | 'audio' | 'text' } : {}),
          })
      setItems(current => reset ? page.items : [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [tab, category, nextCursor])

  useEffect(() => {
    void load(true)
  }, [load])

  const handleLike = async (item: GalleryItem) => {
    try {
      const result = item.likedByViewer
        ? await apiClient.unlikeGeneration(item.id)
        : await apiClient.likeGeneration(item.id)
      setItems(current => current.map(candidate => candidate.id === item.id
        ? { ...candidate, likedByViewer: result.liked, likeCount: result.likeCount }
        : candidate))
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    }
  }

  const handleFavorite = async (item: GalleryItem) => {
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
    }
  }

  const handleReuse = (item: GalleryItem) => {
    navigate(`/create?select=${encodeURIComponent(item.modelId)}&params=${encodeDeepLinkParams(item.inputParams)}`)
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
    if (detail === null) return
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
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">社区画廊</h1>
        <div className="flex items-center gap-2">
          <Select value={tab} onValueChange={value => setTab(value as GalleryTab)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="community">全部作品</SelectItem>
              <SelectItem value="favorites">我的收藏</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory} disabled={tab === 'favorites'}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="image">图片</SelectItem>
              <SelectItem value="video">视频</SelectItem>
              <SelectItem value="audio">音频</SelectItem>
              <SelectItem value="text">文本</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {tab === 'favorites' ? '我的收藏：收藏自己或同事公开到社区的作品。' : '同事公开到社区的作品；点击卡片查看详情，悬停可点赞/收藏/用同参数生成。'}
      </p>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {tab === 'favorites' ? '还没有收藏任何作品' : '还没有公开的作品，去创作页把你的作品公开到社区吧'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(item => (
            <GalleryCard
              key={item.id}
              item={item}
              modelLabel={modelLabel(models, item.modelId)}
              onOpen={() => void openDetail(item)}
              onLike={() => void handleLike(item)}
              onFavorite={() => void handleFavorite(item)}
              onReuse={() => handleReuse(item)}
            />
          ))}
        </div>
      )}

      {nextCursor !== undefined && items.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void load(false)}>
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
            <GalleryDetailView detail={detail} onLike={() => void handleDetailLike()} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GalleryCard({
  item,
  modelLabel,
  onOpen,
  onLike,
  onFavorite,
  onReuse,
}: {
  item: GalleryItem
  modelLabel: string
  onOpen: () => void
  onLike: () => void
  onFavorite: () => void
  onReuse: () => void
}) {
  // 封面：优先用已生成的首帧缩略图（<img>，轻量）；视频无缩略图时退化为 <video preload="metadata"> 展示首帧。
  const thumbUrl = resolveApiUrl(item.cover?.thumbnailUrl)
  const videoUrl = item.category === 'video' ? resolveApiUrl(item.cover?.readUrl) : ''
  const coverUrl = resolveApiUrl(item.cover?.readUrl ?? item.cover?.thumbnailUrl)
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10">
      <button type="button" onClick={onOpen} className="relative block aspect-square w-full overflow-hidden bg-muted">
        {thumbUrl.length > 0 ? (
          <img src={thumbUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        ) : item.category === 'video' && videoUrl.length > 0 ? (
          <video src={videoUrl} muted playsInline preload="metadata" className="size-full object-cover transition-transform group-hover:scale-105" />
        ) : coverUrl.length > 0 ? (
          <img src={coverUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">{item.category}</span>
        )}
        <div className="absolute inset-0 flex items-end justify-end gap-1 bg-linear-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); onReuse() }}>
            <Sparkles data-icon />
            同参数
          </Button>
          <Button size="icon-sm" variant="secondary" onClick={event => { event.stopPropagation(); onFavorite() }} aria-label="收藏">
            {item.favoritedByViewer ? <BookmarkCheck data-icon className="text-primary" /> : <Bookmark data-icon />}
          </Button>
          <Button size="icon-sm" variant="secondary" onClick={event => { event.stopPropagation(); onLike() }} aria-label="点赞">
            <Heart data-icon className={item.likedByViewer ? 'fill-current text-destructive' : undefined} />
          </Button>
        </div>
      </button>
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="max-w-[60%] truncate">{modelLabel}</Badge>
          <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
            <Heart data-icon className="size-3" />
            {item.likeCount}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{item.author.displayName ?? item.author.id.slice(0, 8)} · {formatTime(item.createdAt)}</p>
      </div>
    </div>
  )
}

function GalleryDetailView({ detail, onLike }: { detail: GalleryDetail; onLike: () => void }) {
  const [copied, setCopied] = useState(false)
  const prompt = typeof detail.record.inputParams.prompt === 'string' ? detail.record.inputParams.prompt : ''

  const handleCopyPrompt = async () => {
    await navigator.clipboard?.writeText(prompt).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <DialogHeader>
        {/* pr-8 给右上角关闭按钮让位，避免点赞按钮与关闭按钮重叠。 */}
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
          <Badge variant="secondary">{detail.record.modelId}</Badge>
          <span className="text-sm font-normal text-muted-foreground">{detail.author.displayName ?? detail.author.id.slice(0, 8)}</span>
          <button
            type="button"
            onClick={onLike}
            className="ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
          >
            <Heart data-icon className={detail.likedByViewer ? 'size-3.5 fill-current text-destructive' : 'size-3.5'} />
            {detail.likeCount}
          </button>
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
        {detail.artifacts.map(artifact => {
          const url = resolveApiUrl(artifact.readUrl ?? artifact.thumbnailUrl)
          return artifact.kind === 'video'
            ? <video key={artifact.id} src={url} controls className="aspect-video w-full rounded-lg bg-black" />
            : <img key={artifact.id} src={url} alt="" className="w-full rounded-lg object-contain" loading="lazy" />
        })}
      </div>
    </>
  )
}

function modelLabel(models: readonly import('@bailian-studio/api-client').ModelCatalogItem[], modelId: string): string {
  const model = models.find(candidate => candidate.id === modelId)
  return model !== undefined ? modelNameZh(model) : modelId
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN')
}
