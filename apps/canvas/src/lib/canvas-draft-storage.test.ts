import { describe, expect, it } from 'vitest'
import {
  clearCanvasDraft,
  clearAllCanvasDrafts,
  loadCanvasBootstrapDraft,
  loadCanvasDocumentDraft,
  writeCanvasDraft,
  type CanvasDraft,
} from './canvas-draft-storage'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

const draft: CanvasDraft = {
  nodes: [{ id: 'node-1', type: 'mediaNode', position: { x: 0, y: 0 }, data: { kind: 'image' } }],
  edges: [],
}

describe('canvas draft storage', () => {
  it('未绑定文档的草稿使用 bootstrap key，并在绑定文档后迁移到文档 key', () => {
    const storage = createStorage()
    writeCanvasDraft(storage, draft)
    expect(loadCanvasBootstrapDraft(storage)?.nodes).toHaveLength(1)

    writeCanvasDraft(storage, { ...draft, documentId: 'doc-1', revision: 2 })
    expect(loadCanvasBootstrapDraft(storage)).toBeNull()
    expect(loadCanvasDocumentDraft(storage, 'doc-1')).toMatchObject({ documentId: 'doc-1', revision: 2 })
    expect(loadCanvasDocumentDraft(storage, 'doc-2')).toBeNull()
  })

  it('过滤损坏的节点和边，避免离线草稿污染 React Flow store', () => {
    const storage = createStorage()
    storage.setItem('bailian-studio:canvas:bootstrap:v2', JSON.stringify({
      nodes: [
        { id: 'valid', position: { x: 1, y: 2 }, data: { kind: 'video' } },
        { id: 'broken', data: {} },
      ],
      edges: [
        { id: 'valid-edge', source: 'valid', target: 'valid' },
        { id: 'broken-edge', source: '', target: 'valid' },
      ],
    }))

    expect(loadCanvasBootstrapDraft(storage)).toMatchObject({
      nodes: [{ id: 'valid' }],
      edges: [{ id: 'valid-edge' }],
    })
  })

  it('可以清理 bootstrap 与指定文档草稿', () => {
    const storage = createStorage()
    writeCanvasDraft(storage, draft)
    writeCanvasDraft(storage, { ...draft, documentId: 'doc-1' })
    clearCanvasDraft(storage, 'doc-1')
    expect(loadCanvasBootstrapDraft(storage)).toBeNull()
    expect(loadCanvasDocumentDraft(storage, 'doc-1')).toBeNull()
  })

  it('登出时清理所有文档分桶与旧版本 key', () => {
    const storage = createStorage()
    writeCanvasDraft(storage, draft)
    writeCanvasDraft(storage, { ...draft, documentId: 'doc-1' })
    storage.setItem('bailian-studio:canvas:v1', JSON.stringify(draft))
    storage.setItem('unrelated-key', 'keep')

    clearAllCanvasDrafts(storage)

    expect(loadCanvasBootstrapDraft(storage)).toBeNull()
    expect(loadCanvasDocumentDraft(storage, 'doc-1')).toBeNull()
    expect(storage.getItem('unrelated-key')).toBe('keep')
  })
})
