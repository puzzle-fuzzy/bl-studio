import { create } from 'zustand'
import type { CreativeProject, CreativeProjectDetail } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { registerPrivateDataReset } from './auth-store'

export interface CreativeProjectQuery {
  q?: string
}

export function creativeProjectQueryKey(query: CreativeProjectQuery = {}): string {
  return query.q?.trim() ?? ''
}

interface CreativeProjectQueryState {
  items: CreativeProject[]
  nextCursor: string | undefined
  isLoading: boolean
  isLoadingMore: boolean
  hasLoaded: boolean
  error: string | null
}

interface CreativeProjectDetailState {
  project: CreativeProjectDetail | null
  isLoading: boolean
  error: string | null
}

interface CreativeProjectsState {
  queries: Record<string, CreativeProjectQueryState>
  details: Record<string, CreativeProjectDetailState>
  load(query?: CreativeProjectQuery, force?: boolean): Promise<void>
  loadMore(query?: CreativeProjectQuery): Promise<void>
  loadDetail(projectId: string, force?: boolean): Promise<void>
  create(input: { title: string; description?: string }): Promise<CreativeProject>
  attachAssets(projectId: string, assetIds: string[]): Promise<void>
  detachAssets(projectId: string, assetIds: string[]): Promise<void>
  clear(): void
}

const PROJECTS_PAGE_SIZE = 100
const pendingLoads = new Map<string, Promise<void>>()
const pendingDetails = new Map<string, Promise<void>>()

function initialState(): CreativeProjectQueryState {
  return {
    items: [],
    nextCursor: undefined,
    isLoading: false,
    isLoadingMore: false,
    hasLoaded: false,
    error: null,
  }
}

function initialDetailState(): CreativeProjectDetailState {
  return { project: null, isLoading: false, error: null }
}

export const useCreativeProjectsStore = create<CreativeProjectsState>((set, get) => ({
  queries: {},
  details: {},

  async load(query = {}, force = false) {
    const key = creativeProjectQueryKey(query)
    const existing = get().queries[key]
    if (existing?.hasLoaded && !force) return
    const pending = pendingLoads.get(key)
    if (pending !== undefined) return pending

    set(state => ({
      queries: {
        ...state.queries,
        [key]: { ...(existing ?? initialState()), isLoading: true, error: null },
      },
    }))

    const task = apiClient
      .listCreativeProjects({
        limit: PROJECTS_PAGE_SIZE,
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
              ...(get().queries[key] ?? initialState()),
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

  async loadMore(query = {}) {
    const key = creativeProjectQueryKey(query)
    const state = get().queries[key]
    if (state === undefined || state.isLoadingMore || state.nextCursor === undefined) return

    set(current => ({
      queries: { ...current.queries, [key]: { ...state, isLoadingMore: true, error: null } },
    }))

    try {
      const result = await apiClient.listCreativeProjects({
        limit: PROJECTS_PAGE_SIZE,
        cursor: state.nextCursor,
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

  async loadDetail(projectId, force = false) {
    const existing = get().details[projectId]
    if (existing?.project !== null && !force) return
    const pending = pendingDetails.get(projectId)
    if (pending !== undefined) return pending

    set(state => ({
      details: {
        ...state.details,
        [projectId]: { ...(existing ?? initialDetailState()), isLoading: true, error: null },
      },
    }))

    const task = apiClient
      .getCreativeProject(projectId)
      .then(project => {
        set(state => ({
          details: { ...state.details, [projectId]: { project, isLoading: false, error: null } },
        }))
      })
      .catch(error => {
        set(state => ({
          details: {
            ...state.details,
            [projectId]: {
              ...(get().details[projectId] ?? initialDetailState()),
              isLoading: false,
              error: userErrorMessage(error),
            },
          },
        }))
      })
      .finally(() => {
        pendingDetails.delete(projectId)
      })

    pendingDetails.set(projectId, task)
    return task
  },

  async create(input) {
    const project = await apiClient.createCreativeProject(input)
    set(state => {
      const queries: Record<string, CreativeProjectQueryState> = {}
      for (const [key, entry] of Object.entries(state.queries)) {
        const matchesQuery = key.length === 0 || project.title.toLocaleLowerCase().includes(key.toLocaleLowerCase())
        queries[key] = matchesQuery ? { ...entry, items: [project, ...entry.items.filter(item => item.id !== project.id)] } : entry
      }
      return {
        queries,
        details: {
          ...state.details,
          [project.id]: { project, isLoading: false, error: null },
        },
      }
    })
    return project
  },

  async attachAssets(projectId, assetIds) {
    const uniqueAssetIds = [...new Set(assetIds)]
    if (uniqueAssetIds.length === 0) return
    const existingCount = get().details[projectId]?.project?.assets.length ?? 0
    try {
      for (const [index, assetId] of uniqueAssetIds.entries()) {
        await apiClient.attachCreativeAssetToProject(projectId, {
          assetId,
          sortOrder: existingCount + index,
        })
      }
    } finally {
      await get().loadDetail(projectId, true)
    }
  },

  async detachAssets(projectId, assetIds) {
    const uniqueAssetIds = [...new Set(assetIds)]
    if (uniqueAssetIds.length === 0) return
    try {
      for (const assetId of uniqueAssetIds) {
        await apiClient.detachCreativeAssetFromProject(projectId, assetId)
      }
    } finally {
      await get().loadDetail(projectId, true)
    }
  },

  clear() {
    pendingLoads.clear()
    pendingDetails.clear()
    set({ queries: {}, details: {} })
  },
}))

registerPrivateDataReset(() => useCreativeProjectsStore.getState().clear())
