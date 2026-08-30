import { describe, expect, it } from 'vitest'
import { CanvasSnapshotSchema, CreateCanvasInputSchema, SaveCanvasInputSchema } from '../src'

const node = {
  id: 'node-1',
  type: 'mediaNode',
  position: { x: 10, y: 20 },
  data: { kind: 'image', resultAssetId: 'asset-1' },
}

describe('canvas contracts', () => {
  it('accepts a stable React Flow snapshot', () => {
    expect(CanvasSnapshotSchema.parse({ nodes: [node], edges: [] })).toEqual({ nodes: [node], edges: [] })
  })

  it('rejects unknown top-level fields and oversized graphs', () => {
    expect(() => CanvasSnapshotSchema.parse({ nodes: [], edges: [], viewport: {} })).toThrow()
    expect(() => CanvasSnapshotSchema.parse({ nodes: Array.from({ length: 501 }, (_, index) => ({
      ...node,
      id: `node-${index}`,
    })), edges: [] })).toThrow()
  })

  it('requires a positive revision when saving', () => {
    expect(() => SaveCanvasInputSchema.parse({ expectedRevision: 0, snapshot: { nodes: [], edges: [] } })).toThrow()
    expect(CreateCanvasInputSchema.parse({ title: '镜头草稿' })).toEqual({ title: '镜头草稿' })
  })
})
