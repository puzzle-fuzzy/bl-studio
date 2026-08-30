import { act, renderHook, waitFor } from '@testing-library/react'
import type { CanvasDocument, CanvasDocumentSummary, ListCanvasesResult } from '@bailian-studio/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasPersistence } from './use-canvas-persistence'
import { useCanvasStore } from '@/stores/canvas-store'

const apiClientMock = vi.hoisted(() => ({
  createCanvas: vi.fn(),
  getAsset: vi.fn(),
  getCanvas: vi.fn(),
  listCanvases: vi.fn(),
}))

vi.mock('@bailian-studio/lib-client', () => ({ apiClient: apiClientMock }))

function documentSummary(id: string, updatedAt = '2026-08-31T02:00:00.000Z'): CanvasDocumentSummary {
  return { id, title: id, revision: 1, updatedAt }
}

function document(id: string): CanvasDocument {
  return {
    ...documentSummary(id),
    snapshot: { nodes: [], edges: [] },
    createdAt: '2026-08-31T01:00:00.000Z',
    currentVersionId: `${id}-version-1`,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function resetCanvasStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    documentId: undefined,
    revision: undefined,
    title: '未命名画布',
    hydrated: false,
    saveStatus: 'idle',
    canvasExecutionBusy: false,
  })
}

describe('useCanvasPersistence document directory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCanvasStore()
  })

  it('loads the next directory page and prevents duplicate in-flight requests', async () => {
    const first = documentSummary('first')
    const second = documentSummary('second', '2026-08-30T02:00:00.000Z')
    const nextPage = deferred<ListCanvasesResult>()
    apiClientMock.listCanvases
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-1' })
      .mockImplementationOnce(() => nextPage.promise)
    apiClientMock.getCanvas.mockResolvedValue(document('first'))

    const { result } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(result.current.documents).toEqual([first]))
    expect(result.current.documentNextCursor).toBe('cursor-1')

    let firstLoad!: Promise<boolean>
    act(() => {
      firstLoad = result.current.loadMoreDocuments()
    })
    await waitFor(() => expect(apiClientMock.listCanvases).toHaveBeenCalledTimes(2))

    await act(async () => {
      await expect(result.current.loadMoreDocuments()).resolves.toBe(false)
    })
    expect(apiClientMock.listCanvases).toHaveBeenCalledTimes(2)

    nextPage.resolve({ items: [second], nextCursor: undefined })
    await act(async () => {
      await expect(firstLoad).resolves.toBe(true)
    })
    expect(result.current.documents).toEqual([first, second])
    expect(result.current.documentNextCursor).toBeUndefined()
  })

  it('ignores a stale document response after a faster switch completes', async () => {
    const first = documentSummary('first')
    const second = documentSummary('second', '2026-08-30T02:00:00.000Z')
    const third = documentSummary('third', '2026-08-29T02:00:00.000Z')
    apiClientMock.listCanvases.mockResolvedValue({ items: [first, second, third] })
    apiClientMock.getCanvas.mockResolvedValueOnce(document('first'))
    const secondDocument = deferred<CanvasDocument>()
    const thirdDocument = deferred<CanvasDocument>()
    apiClientMock.getCanvas.mockImplementation((id: string) => {
      if (id === 'second') return secondDocument.promise
      if (id === 'third') return thirdDocument.promise
      return Promise.resolve(document(id))
    })

    const { result } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(useCanvasStore.getState().documentId).toBe('first'))

    let staleSwitch!: Promise<boolean>
    let currentSwitch!: Promise<boolean>
    act(() => {
      staleSwitch = result.current.openDocument('second')
      currentSwitch = result.current.openDocument('third')
    })

    thirdDocument.resolve(document('third'))
    await act(async () => {
      await expect(currentSwitch).resolves.toBe(true)
    })
    secondDocument.resolve(document('second'))
    await act(async () => {
      await expect(staleSwitch).resolves.toBe(false)
    })

    expect(useCanvasStore.getState().documentId).toBe('third')
    expect(useCanvasStore.getState().title).toBe('third')
  })
})
