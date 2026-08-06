import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Copy, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import type { PromptLibraryItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useModelCatalogStore } from '@/stores/model-catalog-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { modelNameZh } from '@/lib/model-modes'
import { encodeDeepLinkParams } from '@/lib/deeplink-params'

/**
 * 提示词资产库：服务端命名库（跨设备、可搜索、可复用）。
 * 每条保存「提示词 + 模型 + 文本参数」；「用此提示词创建」跳转创作页并预载参数。
 */
export function PromptsPage() {
  const navigate = useNavigate()
  const showMessage = useNotificationsStore(state => state.showMessage)
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)

  const [items, setItems] = useState<PromptLibraryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', modelId: '', prompt: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  /** 请求序号：首载/翻页共用，防止搜索词切换时旧响应覆盖新数据。 */
  const requestSeq = useRef(0)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  // 首载与翻页分离：loadFirst 仅依赖过滤器（q），由 effect 驱动；loadMore 闭包
  // nextCursor，只挂按钮。修复 nextCursor 进入 useCallback 依赖导致的无限刷新循环。
  const loadFirst = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    setItems([])
    setNextCursor(undefined)
    try {
      const page = await apiClient.listPromptLibrary({ ...(q.length > 0 ? { q } : {}) })
      if (seq !== requestSeq.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [q])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (nextCursor === undefined) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = await apiClient.listPromptLibrary({ cursor: nextCursor, ...(q.length > 0 ? { q } : {}) })
      if (seq !== requestSeq.current) return
      setItems(current => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      if (seq === requestSeq.current) setError(userErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [nextCursor, q])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    void loadFirst()
  }

  const handleCreate = async () => {
    if (createForm.name.trim().length === 0 || createForm.prompt.trim().length === 0 || createForm.modelId.length === 0) {
      setCreateError('请填写名称、模型与提示词')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await apiClient.createPromptLibraryItem({
        name: createForm.name.trim(),
        modelId: createForm.modelId,
        prompt: createForm.prompt.trim(),
        params: {},
      })
      setCreateOpen(false)
      setCreateForm({ name: '', modelId: '', prompt: '' })
      void loadFirst()
      showMessage({ title: '已保存到提示词库', tone: 'success' })
    } catch (err) {
      setCreateError(userErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (item: PromptLibraryItem) => {
    try {
      await apiClient.deletePromptLibraryItem(item.id)
      setItems(current => current.filter(candidate => candidate.id !== item.id))
      showMessage({ title: '已删除', tone: 'info' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    }
  }

  const handleReuse = (item: PromptLibraryItem) => {
    const params = encodeDeepLinkParams({ ...item.params, prompt: item.prompt })
    navigate(`/create?select=${encodeURIComponent(item.modelId)}&params=${params}`)
  }

  const handleCopy = async (item: PromptLibraryItem) => {
    await navigator.clipboard?.writeText(item.prompt).catch(() => undefined)
    showMessage({ title: '提示词已复制', tone: 'success' })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">提示词资产库</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon />
          新建提示词
        </Button>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={event => setQ(event.target.value)} placeholder="搜索名称或提示词…" className="pl-8" />
        </div>
        <Button type="submit" variant="outline">搜索</Button>
      </form>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          还没有保存的提示词。可以在生成详情页点「保存为提示词」，或点击右上角新建。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    <Badge variant="secondary" className="max-w-[40%] truncate">{modelLabel(models, item.modelId)}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.prompt}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void handleCopy(item)} aria-label="复制提示词">
                    <Copy data-icon />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReuse(item)}>
                    <Sparkles data-icon />
                    用此提示词创建
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void handleDelete(item)} aria-label="删除">
                    <Trash2 data-icon />
                  </Button>
                </div>
              </CardContent>
            </Card>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建提示词</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-name">名称</Label>
              <Input id="prompt-name" value={createForm.name} onChange={event => setCreateForm({ ...createForm, name: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>模型</Label>
              <Select value={createForm.modelId} onValueChange={modelId => setCreateForm({ ...createForm, modelId })}>
                <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-text">提示词</Label>
              <Textarea id="prompt-text" rows={4} value={createForm.prompt} onChange={event => setCreateForm({ ...createForm, prompt: event.target.value })} />
            </div>
            {createError !== null && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function modelLabel(models: readonly import('@bailian-studio/api-client').ModelCatalogItem[], modelId: string): string {
  const model = models.find(candidate => candidate.id === modelId)
  return model !== undefined ? modelNameZh(model) : modelId
}
