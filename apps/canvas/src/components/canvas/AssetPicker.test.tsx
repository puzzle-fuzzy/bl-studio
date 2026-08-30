import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AssetItem, ListAssetsResult } from '@bailian-studio/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetPicker } from './AssetPicker'

const apiClientMock = vi.hoisted(() => ({
  getAsset: vi.fn(),
  listAssets: vi.fn(),
}))

vi.mock('@bailian-studio/lib-client', () => ({
  apiClient: apiClientMock,
  resolveApiUrl: (url: string | undefined | null) => url ?? '',
}))

function asset(id: string, kind: 'image' | 'video' = 'image'): AssetItem {
  return {
    id,
    kind,
    source: 'upload',
    fileName: `${id}.png`,
    createdAt: '2026-08-31T02:00:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('AssetPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serializes repeated load-more clicks for the same asset page', async () => {
    const firstPage: ListAssetsResult = { items: [asset('first')], nextCursor: 'cursor-1' }
    const secondPage = deferred<ListAssetsResult>()
    apiClientMock.listAssets
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => secondPage.promise)

    render(
      <AssetPicker
        kind="image"
        allowedKinds={['image']}
        maxSelectableByKind={{ image: 2 }}
        selectedIds={[]}
        selectedKinds={{}}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '加载更多素材' })).toBeDefined())

    const loadMoreButton = screen.getByRole('button', { name: '加载更多素材' })
    fireEvent.click(loadMoreButton)
    fireEvent.click(loadMoreButton)
    expect(apiClientMock.listAssets).toHaveBeenCalledTimes(2)
    expect(apiClientMock.listAssets).toHaveBeenLastCalledWith({
      kind: 'image',
      cursor: 'cursor-1',
      limit: 50,
      sort: 'time',
    })

    secondPage.resolve({ items: [asset('second')], nextCursor: undefined })
    await waitFor(() => expect(screen.getByTitle('second.png')).toBeDefined())
  })
})
