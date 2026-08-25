import { create } from 'zustand'
import type { CreativeProject } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
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

interface CreativeProjectsState {
  queries: Record<string, CreativeProjectQueryState>
  load(query?: CreativeProjectQuery, force?: boolean): Promise<void>
  loadMore(query?: CreativeProjectQuery): Promise<void>
  create(input: { title: string; description?: string }): Promise<CreativeProject>
  clear(): void
}

const PROJECTS_PAGE_SIZE = 100
const pendingLoads = new Map<string, Promise<void>>()

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

export const useCreativeProjectsStore = create<CreativeProjectsState>((set, get) => ({
  queries: {},

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
            error: error instanceof Error ? error.message : String(error),
          },
        },
      }))
    }
  },

  async create(input) {
    const project = await apiClient.createCreativeProject(input)
    set(state => {
      const queries: Record<string, CreativeProjectQueryState> = {}
      for (const [key, entry] of Object.entries(state.queries)) {
        const matchesQuery = key.length === 0 || project.title.toLocaleLowerCase().includes(key.toLocaleLowerCase())
        queries[key] = matchesQuery ? { ...entry, items: [project, ...entry.items.filter(item => item.id !== project.id)] } : entry
      }
      return { queries }
    })
    return project
  },

  clear() {
    pendingLoads.clear()
    set({ queries: {} })
  },
}))

registerPrivateDataReset(() => useCreativeProjectsStore.getState().clear())
