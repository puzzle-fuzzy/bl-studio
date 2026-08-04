import { create } from 'zustand'
import type { AssetItem, AssetSort } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { ASSETS_PAGE_SIZE } from '@/lib/labels'
import { registerPrivateDataReset } from './auth-store'

export interface AssetQuery {
  kind?: string
  source?: string
  q?: string
  sort?: AssetSort
}

export function assetQueryKey(query: AssetQuery): string {
  return [query.kind ?? 'all', query.source ?? 'all', query.sort ?? 'time', query.q ?? ''].join(':')
}

interface AssetQueryState {
  items: AssetItem[]
  nextCursor: string | undefined
  isLoading: boolean
  isLoadingMore: boolean
  hasLoaded: boolean
  error: string | null
}

interface AssetsState {
  queries: Record<string, AssetQueryState>
  load(query: AssetQuery, force?: boolean): Promise<void>
  loadMore(query: AssetQuery): Promise<void>
  getFreshAsset(id: string): Promise<AssetItem | null>
  remove(id: string): Promise<void>
  invalidate(): void
  clear(): void
}

const pendingLoads = new Map<string, Promise<void>>()

function initialState(): AssetQueryState {
  return { items: [], nextCursor: undefined, isLoading: false, isLoadingMore: false, hasLoaded: false, error: null }
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  queries: {},

  async load(query, force = false) {
    const key = assetQueryKey(query)
    const existing = get().queries[key]
    if (existing?.hasLoaded && !force) return
    const inFlight = pendingLoads.get(key)
    if (inFlight !== undefined) return inFlight

    set(state => ({
      queries: {
        ...state.queries,
        [key]: { ...(existing ?? initialState()), isLoading: true, error: null },
      },
    }))

    const task = apiClient
      .listAssets({ limit: ASSETS_PAGE_SIZE, kind: query.kind, source: query.source, sort: query.sort, q: query.q })
      .then(result => {
        set(state => ({
          queries: {
            ...state.queries,
            [key]: {
              items: result.items,
              nextCursor: result.nextCursor,
              isLoading: false,
              isLoadingMore: false,
              hasLoaded: true,
              error: null,
            },
          },
        }))
      })
      .catch(error => {
        set(state => ({
          queries: {
            ...state.queries,
            [key]: {
              ...(get().queries[key] ?? initialState()),
              isLoading: false,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        }))
      })
      .finally(() => {
        pendingLoads.delete(key)
      })

    pendingLoads.set(key, task)
    return task
  },

  async loadMore(query) {
    const key = assetQueryKey(query)
    const state = get().queries[key]
    if (state === undefined || state.isLoadingMore || state.nextCursor === undefined) return
    set(current => ({
      queries: { ...current.queries, [key]: { ...state, isLoadingMore: true } },
    }))
    try {
      const result = await apiClient.listAssets({
        limit: ASSETS_PAGE_SIZE,
        cursor: state.nextCursor,
        kind: query.kind,
        source: query.source,
        sort: query.sort,
        q: query.q,
      })
      set(current => {
        const currentState = current.queries[key] ?? state
        const byId = new Map(currentState.items.map(item => [item.id, item]))
        for (const item of result.items) byId.set(item.id, item)
        return {
          queries: {
            ...current.queries,
            [key]: { ...currentState, items: [...byId.values()], nextCursor: result.nextCursor, isLoadingMore: false },
          },
        }
      })
    } catch {
      set(current => ({
        queries: { ...current.queries, [key]: { ...(current.queries[key] ?? state), isLoadingMore: false } },
      }))
    }
  },

  async getFreshAsset(id) {
    try {
      const asset = await apiClient.getAsset(id)
      // 回写所有包含该资产的缓存
      set(state => {
        const queries: Record<string, AssetQueryState> = {}
        for (const [key, entry] of Object.entries(state.queries)) {
          if (entry.items.some(item => item.id === id)) {
            queries[key] = { ...entry, items: entry.items.map(item => (item.id === id ? asset : item)) }
          }
        }
        return queries
      })
      return asset
    } catch {
      return null
    }
  },

  async remove(id) {
    await apiClient.deleteAsset(id)
    set(state => {
      const queries: Record<string, AssetQueryState> = {}
      for (const [key, entry] of Object.entries(state.queries)) {
        queries[key] = { ...entry, items: entry.items.filter(item => item.id !== id) }
      }
      return queries
    })
  },

  invalidate() {
    set(state => {
      const queries: Record<string, AssetQueryState> = {}
      for (const [key, entry] of Object.entries(state.queries)) {
        queries[key] = { ...entry, hasLoaded: false }
      }
      return queries
    })
  },

  clear() {
    pendingLoads.clear()
    set({ queries: {} })
  },
}))

registerPrivateDataReset(() => useAssetsStore.getState().clear())
