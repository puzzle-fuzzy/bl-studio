import { create } from 'zustand'
import type { GenerationLibraryState, GenerationListView, GenerationRecord } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { ACTIVE_GENERATION_STATUSES, GENERATIONS_PAGE_SIZE } from '@/lib/labels'
import { registerPrivateDataReset } from './auth-store'

export type EventStreamStatus = 'idle' | 'connecting' | 'connected' | 'degraded' | 'unsupported'

/** 判断一条 record 是否落入给定视图（completed/active/hidden/deleted）。 */
export function recordMatchesGenerationViews(
  record: GenerationRecord,
  views: readonly GenerationListView[],
): boolean {
  if (views.length === 0) return true
  const isDeleted = record.deletedAt !== null
  const isHidden = record.hiddenAt !== null
  const isActive = ACTIVE_GENERATION_STATUSES.has(record.status)
  return views.some(view => {
    if (view === 'deleted') return isDeleted
    if (view === 'hidden') return isHidden && !isDeleted
    if (view === 'active') return isActive && !isHidden && !isDeleted
    return !isActive && !isHidden && !isDeleted // completed
  })
}

export function activeGenerationCount(records: readonly GenerationRecord[]): number {
  return records.filter(record => ACTIVE_GENERATION_STATUSES.has(record.status)).length
}

/** 按 id 去重合并并按 createdAt 倒序。 */
export function mergeRecords(
  current: readonly GenerationRecord[],
  incoming: readonly GenerationRecord[],
): GenerationRecord[] {
  const byId = new Map<string, GenerationRecord>()
  for (const record of current) byId.set(record.id, record)
  for (const record of incoming) byId.set(record.id, record)
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

interface GenerationsState {
  records: GenerationRecord[]
  nextCursor: string | undefined
  viewFilters: GenerationListView[]
  isLoading: boolean
  isRefreshing: boolean
  isLoadingMore: boolean
  hasLoaded: boolean
  error: string | null
  eventStreamStatus: EventStreamStatus

  load(force?: boolean): Promise<void>
  refresh(): Promise<void>
  refreshRecord(id: string): Promise<void>
  loadMore(): Promise<void>
  setViewFilters(views: GenerationListView[]): Promise<void>
  setLibraryState(id: string, state: GenerationLibraryState): Promise<void>
  setEventStreamStatus(status: EventStreamStatus): void
  reset(): void
}

let requestVersion = 0
const recordRefreshVersions = new Map<string, number>()

export const useGenerationsStore = create<GenerationsState>((set, get) => ({
  records: [],
  nextCursor: undefined,
  viewFilters: [],
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  hasLoaded: false,
  error: null,
  eventStreamStatus: 'idle',

  async load(force = false) {
    if (get().hasLoaded && !force) return
    const version = ++requestVersion
    set({ isLoading: true, error: null })
    try {
      const { viewFilters } = get()
      const result = await apiClient.listGenerations({
        limit: GENERATIONS_PAGE_SIZE,
        views: viewFilters,
      })
      if (version !== requestVersion) return
      set({ records: result.items, nextCursor: result.nextCursor, hasLoaded: true, isLoading: false })
    } catch (error) {
      if (version === requestVersion) {
        set({ error: error instanceof Error ? error.message : String(error), isLoading: false })
      }
    }
  },

  async refresh() {
    const version = ++requestVersion
    set({ isRefreshing: true })
    try {
      const { viewFilters } = get()
      const result = await apiClient.listGenerations({
        limit: GENERATIONS_PAGE_SIZE,
        views: viewFilters,
      })
      if (version !== requestVersion) return
      set(state => ({
        // P1-01：刷新合并新首页而非整表替换——已「加载更多」的任务列表不会被降级轮询 /
        // 提交后刷新打回第一页。已翻页（nextCursor 非空）时保留原游标，未翻页才采用新游标。
        records: mergeRecords(state.records, result.items),
        nextCursor: state.nextCursor ?? result.nextCursor,
        isRefreshing: false,
      }))
    } catch {
      if (version === requestVersion) set({ isRefreshing: false })
    }
  },

  async refreshRecord(id) {
    const version = (recordRefreshVersions.get(id) ?? 0) + 1
    recordRefreshVersions.set(id, version)
    try {
      const record = await apiClient.getGeneration(id)
      if (recordRefreshVersions.get(id) !== version) return
      set(state => ({ records: mergeRecords(state.records, [record]) }))
    } catch {
      // 404 等：记录可能刚被删除，忽略
    }
  },

  async loadMore() {
    const { isLoadingMore, nextCursor, viewFilters, records } = get()
    if (isLoadingMore || nextCursor === undefined) return
    const version = requestVersion
    set({ isLoadingMore: true })
    try {
      const result = await apiClient.listGenerations({
        limit: GENERATIONS_PAGE_SIZE,
        cursor: nextCursor,
        views: viewFilters,
      })
      if (version !== requestVersion) return
      set({
        records: mergeRecords(records, result.items),
        nextCursor: result.nextCursor,
        isLoadingMore: false,
      })
    } catch {
      if (version === requestVersion) set({ isLoadingMore: false })
    }
  },

  async setViewFilters(views) {
    requestVersion += 1
    set({ viewFilters: views, records: [], nextCursor: undefined, hasLoaded: false })
    await get().load(true)
  },

  async setLibraryState(id, state) {
    const record = await apiClient.setGenerationLibraryState(id, state)
    set(current => ({ records: mergeRecords(current.records, [record]) }))
  },

  setEventStreamStatus(status) {
    set({ eventStreamStatus: status })
  },

  reset() {
    requestVersion += 1
    recordRefreshVersions.clear()
    set({
      records: [],
      nextCursor: undefined,
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasLoaded: false,
      error: null,
      eventStreamStatus: 'idle',
    })
  },
}))

registerPrivateDataReset(() => useGenerationsStore.getState().reset())
