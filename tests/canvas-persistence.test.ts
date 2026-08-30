import { describe, expect, it } from 'vitest'
import { fromCanvasSnapshot, toCanvasSnapshot } from '../apps/canvas/src/lib/canvas-persistence'

describe('Canvas persistence runtime boundary', () => {
  it('does not persist execution status or error text, but keeps stable generation references', () => {
    const snapshot = toCanvasSnapshot([
      {
        id: 'node-1',
        type: 'mediaNode',
        position: { x: 10, y: 20 },
        data: {
          kind: 'image',
          status: 'generating',
          prompt: 'a lantern',
          modelId: 'image-model',
          generationId: 'generation-1',
          resultKind: 'image',
          resultAssetId: 'asset-1',
          errorMessage: 'transient error',
        },
      },
    ], [])

    expect(snapshot.nodes[0]?.data).toEqual({
      kind: 'image',
      prompt: 'a lantern',
      modelId: 'image-model',
      generationId: 'generation-1',
      resultKind: 'image',
      resultAssetId: 'asset-1',
    })
  })

  it('derives a recoverable status when restoring current and legacy snapshots', () => {
    const restored = fromCanvasSnapshot({
      nodes: [
        {
          id: 'running',
          type: 'mediaNode',
          position: { x: 0, y: 0 },
          data: { kind: 'image', generationId: 'generation-1' },
        },
        {
          id: 'legacy-ready',
          type: 'mediaNode',
          position: { x: 0, y: 0 },
          data: { kind: 'image', status: 'generating', resultAssetId: 'asset-1' },
        },
        {
          id: 'legacy-empty',
          type: 'mediaNode',
          position: { x: 0, y: 0 },
          data: { kind: 'image', status: 'generating' },
        },
      ],
      edges: [],
    })

    expect(restored.nodes.map(node => node.data.status)).toEqual(['generating', 'ready', 'empty'])
  })
})
