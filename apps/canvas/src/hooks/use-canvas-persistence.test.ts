import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { CanvasDocument, CanvasDocumentSummary, CanvasVersion, ListCanvasesResult } from '@bailian-studio/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasPersistence } from './use-canvas-persistence'
import { useCanvasStore } from '@/stores/canvas-store'

const apiClientMock = vi.hoisted(() => ({
  createCanvas: vi.fn(),
  getAsset: vi.fn(),
  getCanvas: vi.fn(),
  listCanvases: vi.fn(),
  listCanvasVersions: vi.fn(),
  restoreCanvas: vi.fn(),
  saveCanvas: vi.fn(),
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

function version(id: string, documentId: string): CanvasVersion {
  return {
    id,
    documentId,
    version: 1,
    snapshot: { nodes: [], edges: [] },
    createdAt: '2026-08-31T01:30:00.000Z',
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
    cleanup()
    vi.clearAllMocks()
    resetCanvasStore()
  })

  afterEach(() => {
    cleanup()
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
    await waitFor(() => expect(result.current.documentLoading).toBe(false))

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

  it('persists a renamed document through the revisioned save path', async () => {
    const first = documentSummary('first')
    apiClientMock.listCanvases.mockResolvedValue({ items: [first] })
    apiClientMock.getCanvas.mockResolvedValue(document('first'))
    apiClientMock.saveCanvas.mockImplementation(async (
      id: string,
      input: { expectedRevision: number; snapshot: CanvasDocument['snapshot']; title: string },
    ) => ({
      ...document(id),
      revision: input.expectedRevision + 1,
      title: input.title,
      snapshot: input.snapshot,
    }))

    const { result, rerender } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(result.current.documentLoading).toBe(false))
    expect(apiClientMock.getCanvas).toHaveBeenCalledTimes(1)
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isDirty).toBe(false)

    act(() => useCanvasStore.getState().setTitle('我的首个画布'))
    await waitFor(() => expect(apiClientMock.saveCanvas).toHaveBeenCalledWith('first', {
      expectedRevision: 1,
      title: '我的首个画布',
      snapshot: { nodes: [], edges: [] },
    }), { timeout: 1_500 })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    rerender()
    expect(result.current.isDirty).toBe(false)
  })

  it('surfaces version loading errors while preserving the last successful history', async () => {
    const first = documentSummary('first')
    const firstVersion = version('version-1', 'first')
    apiClientMock.listCanvases.mockResolvedValue({ items: [first] })
    apiClientMock.getCanvas.mockResolvedValue(document('first'))
    apiClientMock.listCanvasVersions
      .mockResolvedValueOnce([firstVersion])
      .mockRejectedValueOnce(new Error('版本服务暂不可用'))

    const { result } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(result.current.documentLoading).toBe(false))

    await act(async () => {
      await expect(result.current.refreshVersions()).resolves.toEqual([firstVersion])
    })
    expect(result.current.versions).toEqual([firstVersion])
    expect(result.current.versionsError).toBeUndefined()
    expect(result.current.versionsLoading).toBe(false)

    await act(async () => {
      await expect(result.current.refreshVersions()).resolves.toEqual([])
    })
    expect(result.current.versions).toEqual([firstVersion])
    expect(result.current.versionsError).toBe('版本服务暂不可用')
    expect(result.current.versionsLoading).toBe(false)
  })

  it('marks restore failures as errors instead of leaving the document saving forever', async () => {
    const first = documentSummary('first')
    apiClientMock.listCanvases.mockResolvedValue({ items: [first] })
    apiClientMock.getCanvas.mockResolvedValue(document('first'))
    apiClientMock.restoreCanvas.mockRejectedValue(new Error('恢复失败'))

    const { result } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(result.current.documentLoading).toBe(false))

    await act(async () => {
      await expect(result.current.restoreVersion('version-1')).rejects.toThrow('恢复失败')
    })
    expect(useCanvasStore.getState().saveStatus).toBe('error')
  })

  it('ignores a stale version response after switching documents', async () => {
    const first = documentSummary('first')
    const second = documentSummary('second', '2026-08-30T02:00:00.000Z')
    const staleVersions = deferred<CanvasVersion[]>()
    apiClientMock.listCanvases.mockResolvedValue({ items: [first, second] })
    apiClientMock.getCanvas.mockImplementation((id: string) => Promise.resolve(document(id)))
    apiClientMock.listCanvasVersions.mockImplementation((id: string) => (
      id === 'first' ? staleVersions.promise : Promise.resolve([version('version-2', 'second')])
    ))

    const { result } = renderHook(() => useCanvasPersistence())
    await waitFor(() => expect(result.current.documentLoading).toBe(false))

    let staleRefresh!: Promise<CanvasVersion[]>
    let currentSwitch!: Promise<boolean>
    act(() => {
      staleRefresh = result.current.refreshVersions()
      currentSwitch = result.current.openDocument('second')
    })
    await act(async () => {
      await expect(currentSwitch).resolves.toBe(true)
    })
    expect(useCanvasStore.getState().documentId).toBe('second')
    expect(result.current.versions).toEqual([])

    staleVersions.resolve([version('version-1', 'first')])
    await act(async () => {
      await expect(staleRefresh).resolves.toEqual([expect.objectContaining({ id: 'version-1' })])
    })
    expect(result.current.versions).toEqual([])
    expect(result.current.versionsError).toBeUndefined()
  })
})
