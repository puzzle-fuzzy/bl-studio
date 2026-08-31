import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { AssetItem, CanvasExecutionTaskSummary } from '@bailian-studio/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasExecution } from './use-canvas-execution'
import { useCanvasStore } from '@/stores/canvas-store'

const apiClientMock = vi.hoisted(() => ({
  getCanvasExecution: vi.fn(),
  listAssets: vi.fn(),
  listCanvasExecutions: vi.fn(),
  retryCanvasNode: vi.fn(),
}))

vi.mock('@bailian-studio/lib-client', () => ({ apiClient: apiClientMock }))

function execution(): CanvasExecutionTaskSummary {
  return {
    id: 'execution-1',
    documentId: 'doc-1',
    documentRevision: 1,
    status: 'succeeded',
    nodeStatuses: [{
      nodeId: 'node-1',
      status: 'succeeded',
      assetIds: ['asset-1'],
    }],
    createdAt: '2026-08-31T02:00:00.000Z',
    updatedAt: '2026-08-31T02:00:00.000Z',
  }
}

function asset(id: string, kind: 'image' | 'video' = 'image'): AssetItem {
  return {
    id,
    kind,
    source: 'generation',
    url: `/signed/${id}`,
    createdAt: '2026-08-31T02:00:00.000Z',
  }
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function resetCanvasStore(documentId = 'doc-1') {
  useCanvasStore.setState({
    documentId,
    revision: 1,
    title: documentId,
    nodes: [{
      id: 'node-1',
      type: 'mediaNode',
      position: { x: 0, y: 0 },
      data: { status: 'idle' },
    }],
    edges: [],
    hydrated: true,
    saveStatus: 'saved',
    canvasExecutionBusy: false,
  })
}

describe('useCanvasExecution', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    apiClientMock.listCanvasExecutions.mockResolvedValue({ items: [] })
    apiClientMock.listAssets.mockResolvedValue({ items: [] })
    resetCanvasStore()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not write a failed asset hydration result into a newly selected document', async () => {
    const pendingAssets = deferred<{ items: AssetItem[] }>()
    apiClientMock.getCanvasExecution.mockResolvedValue(execution())
    apiClientMock.listAssets.mockImplementation(() => pendingAssets.promise)

    const { result } = renderHook(() => useCanvasExecution())
    await waitFor(() => expect(apiClientMock.listCanvasExecutions).toHaveBeenCalledWith('doc-1', { limit: 20 }))

    let loadPromise!: Promise<void>
    act(() => {
      loadPromise = result.current.loadExecution('execution-1')
    })
    await waitFor(() => expect(apiClientMock.listAssets).toHaveBeenCalledWith({ ids: ['asset-1'] }))

    act(() => {
      resetCanvasStore('doc-2')
    })
    pendingAssets.reject(new Error('asset service unavailable'))

    await act(async () => {
      await loadPromise
    })
    expect(useCanvasStore.getState().documentId).toBe('doc-2')
    expect(useCanvasStore.getState().nodes[0]?.data).toEqual({ status: 'idle' })
  })

  it('hydrates all successful node assets through one batch request', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'mediaNode',
          position: { x: 0, y: 0 },
          data: { status: 'idle' },
        },
        {
          id: 'node-2',
          type: 'mediaNode',
          position: { x: 0, y: 120 },
          data: { status: 'idle' },
        },
      ],
    })
    const completed = {
      ...execution(),
      nodeStatuses: [
        { nodeId: 'node-1', status: 'succeeded' as const, assetIds: ['asset-1'] },
        { nodeId: 'node-2', status: 'succeeded' as const, assetIds: ['asset-2'] },
      ],
    }
    apiClientMock.getCanvasExecution.mockResolvedValue(completed)
    apiClientMock.listAssets.mockResolvedValue({ items: [asset('asset-1'), asset('asset-2', 'video')] })

    const { result } = renderHook(() => useCanvasExecution())
    await act(async () => {
      await result.current.loadExecution('execution-1')
    })

    expect(apiClientMock.listAssets).toHaveBeenCalledTimes(1)
    expect(apiClientMock.listAssets).toHaveBeenCalledWith({ ids: ['asset-1', 'asset-2'] })
    expect(useCanvasStore.getState().nodes.map(node => node.data)).toEqual([
      expect.objectContaining({ status: 'ready', resultAssetId: 'asset-1', resultKind: 'image', resultUrl: '/signed/asset-1' }),
      expect.objectContaining({ status: 'ready', resultAssetId: 'asset-2', resultKind: 'video', resultUrl: '/signed/asset-2' }),
    ])
  })

  it('continues through execution history pages when resuming an active run', async () => {
    const resumable = {
      ...execution(),
      status: 'running' as const,
      nodeStatuses: [{
        nodeId: 'node-1',
        status: 'generating' as const,
      }],
    }
    apiClientMock.listCanvasExecutions
      .mockReset()
      .mockResolvedValueOnce({
        items: [execution()],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [resumable],
        nextCursor: undefined,
      })
    apiClientMock.getCanvasExecution.mockResolvedValue(resumable)

    const { result } = renderHook(() => useCanvasExecution())
    await waitFor(() => expect(apiClientMock.listCanvasExecutions).toHaveBeenCalledTimes(2))
    expect(apiClientMock.listCanvasExecutions).toHaveBeenNthCalledWith(2, 'doc-1', {
      limit: 20,
      cursor: 'cursor-1',
    })
    await waitFor(() => expect(result.current.status).toBe('running'))
    act(() => result.current.stop())
  })

  it('does not rerun a historical execution after the current document revision changes', async () => {
    const historical = {
      ...execution(),
      documentRevision: 1,
      nodeStatuses: [],
    }
    useCanvasStore.setState({ revision: 2 })
    apiClientMock.getCanvasExecution.mockResolvedValue(historical)

    const { result } = renderHook(() => useCanvasExecution())
    await waitFor(() => expect(apiClientMock.listCanvasExecutions).toHaveBeenCalledWith('doc-1', { limit: 20 }))

    await act(async () => {
      await result.current.loadExecution('execution-1')
    })
    await waitFor(() => expect(result.current.status).toBe('succeeded'))

    await act(async () => {
      await result.current.retryNode('node-1')
    })
    expect(apiClientMock.retryCanvasNode).not.toHaveBeenCalled()
  })
})
