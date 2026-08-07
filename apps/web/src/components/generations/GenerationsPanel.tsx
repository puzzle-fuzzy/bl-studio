import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { List } from 'react-window'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GenerationRecord } from '@bailian-studio/api-client'
import { GenerationListItem } from '@/components/generations/GenerationListItem'
import { GenerationStatusFilter } from '@/components/generations/GenerationStatusFilter'
import { useGenerationsStore } from '@/stores/generations-store'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { ACTIVE_GENERATION_STATUSES } from '@/lib/labels'

/** 产物类型筛选（嵌入态）。 */
type KindFilter = 'all' | 'image' | 'video' | 'audio'
/** 进度筛选（嵌入态）。 */
type ProgressFilter = 'all' | 'done' | 'running' | 'failed'

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: '全部产物' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音乐' },
]

const PROGRESS_FILTERS: Array<{ value: ProgressFilter; label: string }> = [
  { value: 'all', label: '全部进度' },
  { value: 'done', label: '已完成' },
  { value: 'running', label: '进行中' },
  { value: 'failed', label: '失败' },
]

/**
 * 任务面板。embedded 形态展示最近任务（创作页右栏，含产物类型/进度两个筛选下拉）；
 * page 形态为完整渲染队列（状态筛选 + react-window 虚拟滚动 + 加载更多）。
 */
export function GenerationsPanel({ variant = 'embedded' }: { variant?: 'embedded' | 'page' }) {
  const navigate = useNavigate()
  const records = useGenerationsStore(state => state.records)
  const hasLoaded = useGenerationsStore(state => state.hasLoaded)
  const isLoading = useGenerationsStore(state => state.isLoading)
  const error = useGenerationsStore(state => state.error)
  const load = useGenerationsStore(state => state.load)
  const loadModels = useModelCatalogStore(state => state.load)

  useEffect(() => {
    if (!hasLoaded && !isLoading) void load()
    // 任务行按模型 referenceFormat 解析提示词标记（幂等，页面形态也保证目录就绪）。
    void loadModels()
  }, [hasLoaded, isLoading, load, loadModels])

  const open = (id: string) => navigate(`/generations/${id}`)

  if (variant === 'embedded') {
    return <EmbeddedVariant records={records} isLoading={isLoading} error={error} onOpen={open} onRetry={() => void load(true)} />
  }

  return <PageVariant />
}

/** 嵌入态：最近任务 + 产物类型/进度两个筛选下拉。 */
function EmbeddedVariant({
  records,
  isLoading,
  error,
  onOpen,
  onRetry,
}: {
  records: readonly GenerationRecord[]
  isLoading: boolean
  error: string | null
  onOpen: (id: string) => void
  onRetry: () => void
}) {
  const models = useModelCatalogStore(state => state.models)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')

  // 展示 store 已加载的全部最近任务（初始 30 条），由外层 VirtualScrollArea 限高滚动。
  const filtered = records.filter(record => {
    if (kindFilter !== 'all' && recordKind(record, models) !== kindFilter) return false
    if (progressFilter !== 'all' && !matchesProgress(record.status, progressFilter)) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between xl:sticky xl:top-0 xl:z-10 xl:bg-background">
        <p className="text-sm font-medium">最近任务</p>
        <div className="flex gap-2">
          <Select value={kindFilter} onValueChange={value => setKindFilter(value as KindFilter)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={progressFilter} onValueChange={value => setProgressFilter(value as ProgressFilter)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROGRESS_FILTERS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        // R2-P1-07：加载失败时优先渲染错误态（带重试），而不是误导性的「还没有生成任务」空态。
        error !== null && records.length === 0 ? (
          <TaskLoadError message={error} onRetry={onRetry} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {isLoading ? '加载中…' : records.length === 0 ? '还没有生成任务，开始你的第一个创作吧' : '没有符合条件的任务'}
          </p>
        )
      ) : (
        // 无卡片包裹：列表项之间用分割线划分。
        <div className="divide-y divide-border">
          {error !== null && (
            // 有旧数据但刷新失败：诚实提示列表可能是上次结果。
            <p className="px-1 pb-2 text-xs text-destructive">任务列表刷新失败（{error}），当前显示上次结果</p>
          )}
          {filtered.map(record => (
            <GenerationListItem key={record.id} record={record} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 任务产物类型：优先取输出首产物 kind，回退模型目录的 category。 */
function recordKind(
  record: GenerationRecord,
  models: ReturnType<typeof useModelCatalogStore.getState>['models'],
): KindFilter | undefined {
  const firstKind = record.outputResult?.artifacts?.[0]?.kind
  if (firstKind === 'image' || firstKind === 'video' || firstKind === 'audio') return firstKind
  const category = selectModelById(models, record.modelId)?.category
  if (category === 'image' || category === 'video' || category === 'audio') return category
  return undefined
}

/** 任务进度匹配：已完成 / 进行中（活跃态）/ 失败（失败+取消）。 */
function matchesProgress(status: string, filter: ProgressFilter): boolean {
  if (filter === 'done') return status === 'succeeded'
  // 复用共享的活跃态集合：submitting/provider_processing/saving_output 等
  // 非终态都属于「进行中」，避免这里手写列表与 labels.ts 漂移（P2-25）。
  if (filter === 'running') return ACTIVE_GENERATION_STATUSES.has(status)
  if (filter === 'failed') return status === 'failed' || status === 'cancelled'
  return true
}

function PageVariant() {
  const navigate = useNavigate()
  const records = useGenerationsStore(state => state.records)
  const hasLoaded = useGenerationsStore(state => state.hasLoaded)
  const isLoading = useGenerationsStore(state => state.isLoading)
  const error = useGenerationsStore(state => state.error)
  const nextCursor = useGenerationsStore(state => state.nextCursor)
  const isLoadingMore = useGenerationsStore(state => state.isLoadingMore)
  const load = useGenerationsStore(state => state.load)
  const loadMore = useGenerationsStore(state => state.loadMore)
  const viewFilters = useGenerationsStore(state => state.viewFilters)
  const setViewFilters = useGenerationsStore(state => state.setViewFilters)
  const setLibraryState = useGenerationsStore(state => state.setLibraryState)

  const open = (id: string) => navigate(`/generations/${id}`)

  // R2-P1-05：从 hidden/deleted 视图恢复任务后按当前视图重新拉取，使其从列表消失。
  const restoreTask = async (id: string) => {
    await setLibraryState(id, 'visible')
    await load(true)
  }

  return (
    <div className="space-y-3">
      {/* P1-05：value 从 store viewFilters 回传，筛选选中态不再被复位。 */}
      <GenerationStatusFilter value={viewFilters} onFiltersChange={setViewFilters} />
      <div className="h-[calc(100vh-16rem)] min-h-64 overflow-hidden rounded-lg border">
        {records.length === 0 ? (
          // R2-P1-07：空列表区分「加载中 / 加载失败 / 真没有任务」三种情况。
          error !== null ? (
            <div className="flex h-full items-center justify-center">
              <TaskLoadError message={error} onRetry={() => void load(true)} />
            </div>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {isLoading || !hasLoaded ? '加载中…' : '还没有生成任务，开始你的第一个创作吧'}
            </p>
          )
        ) : (
          <List<TaskRowProps>
            rowCount={records.length}
            rowHeight={112}
            rowComponent={TaskRow}
            rowProps={{ records, onOpen: open, onRestore: id => void restoreTask(id) }}
            overscanCount={6}
            className="h-full"
          />
        )}
      </div>
      {nextCursor !== undefined && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
            {isLoadingMore ? '加载中…' : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 任务列表加载失败态：错误信息 + 重试按钮（与「空态」明确区分）。 */
function TaskLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p className="text-sm text-destructive">任务列表加载失败：{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        重试
      </Button>
    </div>
  )
}

interface TaskRowProps {
  records: readonly GenerationRecord[]
  onOpen: (id: string) => void
  onRestore: (id: string) => void
}

function TaskRow({ index, style, records, onOpen, onRestore }: { index: number; style: CSSProperties } & TaskRowProps) {
  const record = records[index]
  if (record === undefined) return null
  // R2-P1-05：hidden/deleted 视图行内提供「恢复」；点击行仍进详情页。
  const isInTrash = record.hiddenAt !== null || record.deletedAt !== null
  return (
    <div style={style} className="flex items-center border-b border-border px-1.5 pb-1.5">
      <div className="min-w-0 flex-1">
        <GenerationListItem record={record} onOpen={onOpen} className="h-full" />
      </div>
      {isInTrash && (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onRestore(record.id)}>
          <RotateCcw data-icon />
          恢复
        </Button>
      )}
    </div>
  )
}

/** 用 ResizeObserver 测量容器宽高（供需要像素列宽的场景，如 Library 网格）。 */
export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect !== undefined) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}
