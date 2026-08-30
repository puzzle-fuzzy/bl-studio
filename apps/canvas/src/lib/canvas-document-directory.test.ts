import type { CanvasDocumentSummary } from '@bailian-studio/api-client'
import { describe, expect, it } from 'vitest'
import { mergeCanvasDocumentPage } from './canvas-document-directory'

const documentSummary = (id: string, updatedAt: string): CanvasDocumentSummary => ({
  id,
  title: id,
  revision: 1,
  updatedAt,
})

describe('canvas document directory', () => {
  it('appends a page without changing server order', () => {
    const first = documentSummary('first', '2026-08-31T02:00:00.000Z')
    const second = documentSummary('second', '2026-08-30T02:00:00.000Z')

    expect(mergeCanvasDocumentPage([first], { items: [second], nextCursor: 'next' })).toEqual([first, second])
  })

  it('replaces an existing summary without duplicating it', () => {
    const oldSummary = documentSummary('same', '2026-08-30T02:00:00.000Z')
    const updatedSummary = { ...oldSummary, revision: 2, updatedAt: '2026-08-31T02:00:00.000Z' }

    expect(mergeCanvasDocumentPage([oldSummary], { items: [updatedSummary] })).toEqual([updatedSummary])
  })
})
