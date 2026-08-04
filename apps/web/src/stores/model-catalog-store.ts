import { create } from 'zustand'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'

interface ModelCatalogState {
  models: ModelCatalogItem[]
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  load(force?: boolean): Promise<void>
  reset(): void
}

let inFlight: Promise<void> | null = null

export const useModelCatalogStore = create<ModelCatalogState>((set, get) => ({
  models: [],
  isLoading: false,
  hasLoaded: false,
  error: null,

  async load(force = false) {
    if (get().hasLoaded && !force) return
    if (inFlight !== null) return inFlight
    set({ isLoading: true, error: null })
    inFlight = apiClient
      .getModels()
      .then(models => {
        set({ models, hasLoaded: true, isLoading: false })
      })
      .catch(error => {
        set({ error: error instanceof Error ? error.message : String(error), isLoading: false })
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  },

  reset() {
    set({ models: [], hasLoaded: false, error: null, isLoading: false })
  },
}))

/** 便捷 selector：按 id 取模型。 */
export function selectModelById(models: readonly ModelCatalogItem[], id: string): ModelCatalogItem | undefined {
  return models.find(model => model.id === id)
}
