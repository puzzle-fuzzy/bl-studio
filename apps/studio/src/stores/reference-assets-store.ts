import { create } from 'zustand'
import type { AssetItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { registerPrivateDataReset } from '@bailian-studio/app-shell'

/**
 * 最近任务列表用：把 generation_record.assetRefs 中的资产 id 解析为可展示的
 * AssetItem（缩略图）。任务列表跨记录大量复用同一批参考图，故按 id 全局缓存 +
 * 请求去重；登录态登出时随其它私有数据一并清空。
 */
interface ReferenceAssetsState {
  assets: Record<string, AssetItem>
  /** 拉取缺失资产；已缓存/在途的跳过。返回按输入顺序的资产（缺失为 null）。 */
  getAssets(ids: readonly string[]): Promise<Array<AssetItem | null>>
  clear(): void
}

const inFlight = new Map<string, Promise<AssetItem | null>>()

function loadAsset(id: string): Promise<AssetItem | null> {
  const pending = inFlight.get(id)
  if (pending !== undefined) return pending
  const task = apiClient
    .getAsset(id)
    .then(asset => {
      useReferenceAssetsStore.setState(state => ({ assets: { ...state.assets, [id]: asset } }))
      return asset
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(id)
    })
  inFlight.set(id, task)
  return task
}

export const useReferenceAssetsStore = create<ReferenceAssetsState>((set, get) => ({
  assets: {},

  async getAssets(ids) {
    const missing = ids.filter(id => get().assets[id] === undefined)
    await Promise.all(missing.map(loadAsset))
    return ids.map(id => get().assets[id] ?? null)
  },

  clear() {
    inFlight.clear()
    set({ assets: {} })
  },
}))

registerPrivateDataReset(() => useReferenceAssetsStore.getState().clear())
