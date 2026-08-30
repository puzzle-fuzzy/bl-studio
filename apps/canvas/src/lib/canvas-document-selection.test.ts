import type { CanvasDocumentSummary } from '@bailian-studio/api-client'
import { describe, expect, it } from 'vitest'
import { selectCanvasDocument } from './canvas-document-selection'

const documents: CanvasDocumentSummary[] = [
  { id: 'canvas-new', title: '新画布', revision: 2, updatedAt: '2026-08-31T02:00:00.000Z' },
  { id: 'canvas-old', title: '旧画布', revision: 1, updatedAt: '2026-08-30T02:00:00.000Z' },
]

describe('canvas document selection', () => {
  it('restores a preferred document when it is present in the directory', () => {
    expect(selectCanvasDocument(documents, 'canvas-old')?.id).toBe('canvas-old')
  })

  it('falls back to the first server-ordered document when the preference is stale', () => {
    expect(selectCanvasDocument(documents, 'canvas-missing')?.id).toBe('canvas-new')
  })

  it('returns no selection for an empty directory', () => {
    expect(selectCanvasDocument([], 'canvas-missing')).toBeUndefined()
  })
})
