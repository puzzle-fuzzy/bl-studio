import { create } from 'zustand'
import type { CreativeAssetDetail, CreativeAssetSummary, CreativeAssetType, CreativeAssetVersionStatus } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { diffCreativeAssetMemberships } from '@/lib/creative-asset-memberships'
import { registerPrivateDataReset } from './auth-store'

export interface CreativeAssetQuery {
  projectId?: string
  type?: CreativeAssetType
  versionStatus?: CreativeAssetVersionStatus
  q?: string
}

export function creativeAssetQueryKey(query: CreativeAssetQuery): string {
  return [query.projectId ?? 'all', query.type ?? 'all', query.versionStatus ?? 'all', query.q?.trim() ?? ''].join(':')
}

interface CreativeAssetQueryState {
  items: CreativeAssetSummary[]
  nextCursor: string | undefined
  isLoading: boolean
  isLoadingMore: boolean
  hasLoaded: boolean
  error: string | null
}

interface CreativeAssetDetailState {
  asset: CreativeAssetDetail | null
  isLoading: boolean
  error: string | null
}

interface CreativeAssetsState {
  queries: Record<string, CreativeAssetQueryState>
  details: Record<string, CreativeAssetDetailState>
  load(query: CreativeAssetQuery, force?: boolean): Promise<void>
  loadMore(query: CreativeAssetQuery): Promise<void>
  loadDetail(assetId: string, force?: boolean): Promise<void>
  syncProjectMemberships(assetId: string, projectIds: string[]): Promise<void>
  clear(): void
}

const CREATIVE_ASSETS_PAGE_SIZE = 36
const pendingLoads = new Map<string, Promise<void>>()
const pendingDetails = new Map<string, Promise<void>>()

function initialQueryState(): CreativeAssetQueryState {
  return {
    items: [],
    nextCursor: undefined,
    isLoading: false,
    isLoadingMore: false,
    hasLoaded: false,
    error: null,
  }
}

function initialDetailState(): CreativeAssetDetailState {
  return { asset: null, isLoading: false, error: null }
}

export const useCreativeAssetsStore = create<CreativeAssetsState>((set, get) => ({
  queries: {},
  details: {},

  async load(query, force = false) {
    const key = creativeAssetQueryKey(query)
    const existing = get().queries[key]
    if (existing?.hasLoaded && !force) return
    const pending = pendingLoads.get(key)
    if (pending !== undefined) return pending

    set(state => ({
      queries: {
        ...state.queries,
        [key]: { ...(existing ?? initialQueryState()), isLoading: true, error: null },
      },
    }))

    const task = apiClient
      .listCreativeAssets({
        limit: CREATIVE_ASSETS_PAGE_SIZE,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.versionStatus ? { versionStatus: query.versionStatus } : {}),
        ...(query.q?.trim() ? { q: query.q.trim() } : {}),
      })
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
              ...(get().queries[key] ?? initialQueryState()),
              isLoading: false,
              error: userErrorMessage(error),
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
    const key = creativeAssetQueryKey(query)
    const state = get().queries[key]
    if (state === undefined || state.isLoadingMore || state.nextCursor === undefined) return

    set(current => ({
      queries: { ...current.queries, [key]: { ...state, isLoadingMore: true, error: null } },
    }))

    try {
      const result = await apiClient.listCreativeAssets({
        limit: CREATIVE_ASSETS_PAGE_SIZE,
        cursor: state.nextCursor,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.versionStatus ? { versionStatus: query.versionStatus } : {}),
        ...(query.q?.trim() ? { q: query.q.trim() } : {}),
      })
      set(current => {
        const currentState = current.queries[key] ?? state
        const byId = new Map(currentState.items.map(item => [item.id, item]))
        for (const item of result.items) byId.set(item.id, item)
        return {
          queries: {
            ...current.queries,
            [key]: {
              ...currentState,
              items: [...byId.values()],
              nextCursor: result.nextCursor,
              isLoadingMore: false,
            },
          },
        }
      })
    } catch (error) {
      set(current => ({
        queries: {
          ...current.queries,
          [key]: {
            ...(current.queries[key] ?? state),
            isLoadingMore: false,
            error: userErrorMessage(error),
          },
        },
      }))
    }
  },

  async loadDetail(assetId, force = false) {
    const existing = get().details[assetId]
    if (existing?.asset !== null && !force) return
    const pending = pendingDetails.get(assetId)
    if (pending !== undefined) return pending

    set(state => ({
      details: {
        ...state.details,
        [assetId]: { ...(existing ?? initialDetailState()), isLoading: true, error: null },
      },
    }))

    const task = apiClient
      .getCreativeAsset(assetId)
      .then(asset => {
        set(state => ({
          details: { ...state.details, [assetId]: { asset, isLoading: false, error: null } },
        }))
      })
      .catch(error => {
        set(state => ({
          details: {
            ...state.details,
            [assetId]: {
              ...(get().details[assetId] ?? initialDetailState()),
              isLoading: false,
              error: userErrorMessage(error),
            },
          },
        }))
      })
      .finally(() => {
        pendingDetails.delete(assetId)
      })

    pendingDetails.set(assetId, task)
    return task
  },

  async syncProjectMemberships(assetId, projectIds) {
    const asset = get().details[assetId]?.asset
    if (asset === null || asset === undefined) throw new Error('素材详情尚未加载完成')
    const currentProjectIds = asset.projects.map(project => project.projectId)
    const diff = diffCreativeAssetMemberships(currentProjectIds, projectIds)
    try {
      for (const projectId of diff.attachProjectIds) {
        await apiClient.attachCreativeAssetToProject(projectId, { assetId })
      }
      for (const projectId of diff.detachProjectIds) {
        await apiClient.detachCreativeAssetFromProject(projectId, assetId)
      }
    } finally {
      await get().loadDetail(assetId, true)
    }
  },

  clear() {
    pendingLoads.clear()
    pendingDetails.clear()
    set({ queries: {}, details: {} })
  },
}))

registerPrivateDataReset(() => useCreativeAssetsStore.getState().clear())
