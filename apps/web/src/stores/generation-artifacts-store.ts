import { create } from 'zustand'
import type { GenerationArtifact } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { registerPrivateDataReset } from './auth-store'

interface ArtifactEntry {
  items: GenerationArtifact[]
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
}

interface ArtifactsState {
  entries: Record<string, ArtifactEntry>
  load(recordId: string, force?: boolean): Promise<void>
  clear(): void
}

const pendingLoads = new Map<string, Promise<void>>()

export const useGenerationArtifactsStore = create<ArtifactsState>((set, get) => ({
  entries: {},

  async load(recordId, force = false) {
    const entry = get().entries[recordId]
    if (entry?.hasLoaded && !force) return
    const inFlight = pendingLoads.get(recordId)
    if (inFlight !== undefined) return inFlight

    set(state => ({
      entries: {
        ...state.entries,
        [recordId]: { items: entry?.items ?? [], isLoading: true, hasLoaded: false, error: null },
      },
    }))

    const task = apiClient
      .listGenerationArtifacts(recordId)
      .then(result => {
        set(state => ({
          entries: {
            ...state.entries,
            [recordId]: { items: result.items, isLoading: false, hasLoaded: true, error: null },
          },
        }))
      })
      .catch(error => {
        set(state => ({
          entries: {
            ...state.entries,
            [recordId]: {
              items: get().entries[recordId]?.items ?? [],
              isLoading: false,
              hasLoaded: true,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        }))
      })
      .finally(() => {
        pendingLoads.delete(recordId)
      })

    pendingLoads.set(recordId, task)
    return task
  },

  clear() {
    pendingLoads.clear()
    set({ entries: {} })
  },
}))

registerPrivateDataReset(() => useGenerationArtifactsStore.getState().clear())
