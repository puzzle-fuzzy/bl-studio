import { describe, expect, it } from 'vitest'
import type { GenerationRecord } from '@bailian-studio/api-client'
// 导入全部注册 store 模块：模块级 registerPrivateDataReset 即完成注册。
import { registerPrivateDataReset, resetAllPrivateData } from './auth-store'
import { useGenerationsStore } from './generations-store'
import { useAssetsStore } from './assets-store'
import { useNotificationsStore } from './notifications-store'
import { useCreditsStore } from './credits-store'
import { useReferenceAssetsStore } from './reference-assets-store'
import { useGenerationArtifactsStore } from './generation-artifacts-store'

/**
 * 给每个注册 store 塞一条「标志性」私有数据。登出清理的 invariiant 是：若任一
 * store 忘了 registerPrivateDataReset，这些种子数据会穿越 resetAllPrivateData
 * 残留到下一个用户——本文件下方的断言因此能在注册表漏掉某个 store 时变红。
 */
function seedAllStores(): void {
  useGenerationsStore.setState({
    records: [{ id: 'secret-generation' } as unknown as GenerationRecord],
    nextCursor: 'cursor-1',
    hasLoaded: true,
  })
  useAssetsStore.setState({
    queries: {
      'all:all:time:': {
        items: [{ id: 'secret-asset' } as never],
        nextCursor: undefined,
        isLoading: false,
        isLoadingMore: false,
        hasLoaded: true,
        error: null,
      },
    },
  })
  useNotificationsStore.setState({
    notifications: [{ id: 'n1', kind: 'system', title: 'secret', createdAt: 'x', read: false } as never],
    unreadCount: 1,
    hasLoaded: true,
  })
  useCreditsStore.setState({
    balance: { userId: 'u1', availableCents: 1, reservedCents: 0, totalCents: 1 },
    hasLoaded: true,
  })
  useReferenceAssetsStore.setState({ assets: { 'secret-ref': { id: 'secret-ref' } as never } })
  useGenerationArtifactsStore.setState({ entries: { 'rec-secret': { recordId: 'rec-secret' } as never } })
}

describe('private data reset registry (R2-P1-12)', () => {
  it('wipes every registered store so a later user never sees the previous session data', async () => {
    seedAllStores()
    await resetAllPrivateData()

    expect(useGenerationsStore.getState().records).toEqual([])
    expect(useGenerationsStore.getState().nextCursor).toBeUndefined()
    expect(useAssetsStore.getState().queries).toEqual({})
    expect(useNotificationsStore.getState().notifications).toEqual([])
    expect(useNotificationsStore.getState().unreadCount).toBe(0)
    expect(useCreditsStore.getState().balance).toBeNull()
    expect(useReferenceAssetsStore.getState().assets).toEqual({})
    expect(useGenerationArtifactsStore.getState().entries).toEqual({})
  })

  it('keeps running the other resets when one callback rejects (allSettled)', async () => {
    // 注册一个必失败的清理回调；resetAllPrivateData 用 allSettled 不得被它拖垮。
    registerPrivateDataReset(() => Promise.reject(new Error('cleanup boom')))

    seedAllStores()
    await expect(resetAllPrivateData()).resolves.toBeUndefined()
    expect(useGenerationsStore.getState().records).toEqual([])
    expect(useCreditsStore.getState().balance).toBeNull()
  })
})
