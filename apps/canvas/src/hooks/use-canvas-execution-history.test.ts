import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { CanvasExecutionTaskSummary, ListCanvasExecutionsResult } from '@bailian-studio/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasExecutionHistory } from './use-canvas-execution-history'
import { useCanvasStore } from '@/stores/canvas-store'

const apiClientMock = vi.hoisted(() => ({
  listCanvasExecutions: vi.fn(),
}))

vi.mock('@bailian-studio/lib-client', () => ({ apiClient: apiClientMock }))

function execution(id: string, documentId = 'doc-1'): CanvasExecutionTaskSummary {
  return {
    id,
    documentId,
    documentRevision: 1,
    status: 'succeeded',
    nodeStatuses: [],
    createdAt: '2026-08-31T02:00:00.000Z',
    updatedAt: '2026-08-31T02:00:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

function resetCanvasStore(documentId = 'doc-1') {
  useCanvasStore.setState({
    documentId,
    nodes: [],
    edges: [],
    revision: 1,
    title: documentId,
    hydrated: true,
    saveStatus: 'saved',
    canvasExecutionBusy: false,
  })
}

describe('useCanvasExecutionHistory', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    resetCanvasStore()
  })

  afterEach(() => {
    cleanup()
  })

  it('serializes repeated page loads and appends the next page once', async () => {
    const first = execution('execution-1')
    const second = execution('execution-2')
    const nextPage = deferred<ListCanvasExecutionsResult>()
    apiClientMock.listCanvasExecutions
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-1' })
      .mockImplementationOnce(() => nextPage.promise)

    const { result } = renderHook(() => useCanvasExecutionHistory('doc-1', true, 'idle'))
    await waitFor(() => expect(result.current.executions).toEqual([first]))

    let firstLoad!: Promise<boolean>
    act(() => {
      firstLoad = result.current.load('cursor-1', true)
    })
    await waitFor(() => expect(apiClientMock.listCanvasExecutions).toHaveBeenCalledTimes(2))

    await act(async () => {
      await expect(result.current.load('cursor-1', true)).resolves.toBe(false)
    })
    expect(apiClientMock.listCanvasExecutions).toHaveBeenCalledTimes(2)

    nextPage.resolve({ items: [second], nextCursor: undefined })
    await act(async () => {
      await expect(firstLoad).resolves.toBe(true)
    })
    expect(result.current.executions).toEqual([first, second])
  })

  it('resets on document switch and ignores a stale previous document page', async () => {
    const first = execution('execution-1')
    const second = execution('execution-2', 'doc-2')
    const stalePage = deferred<ListCanvasExecutionsResult>()
    apiClientMock.listCanvasExecutions
      .mockResolvedValueOnce({ items: [first], nextCursor: 'stale-cursor' })
      .mockImplementationOnce(() => stalePage.promise)
      .mockResolvedValueOnce({ items: [second], nextCursor: undefined })

    const { result, rerender } = renderHook(
      ({ documentId }) => useCanvasExecutionHistory(documentId, true, 'idle'),
      { initialProps: { documentId: 'doc-1' } },
    )
    await waitFor(() => expect(result.current.executions).toEqual([first]))

    let staleLoad!: Promise<boolean>
    act(() => {
      staleLoad = result.current.load('stale-cursor', true)
      useCanvasStore.setState({ documentId: 'doc-2', title: 'doc-2' })
      rerender({ documentId: 'doc-2' })
    })
    await waitFor(() => expect(result.current.executions).toEqual([second]))

    stalePage.resolve({ items: [first], nextCursor: undefined })
    await act(async () => {
      await expect(staleLoad).resolves.toBe(false)
    })
    expect(result.current.executions).toEqual([second])
  })
})
