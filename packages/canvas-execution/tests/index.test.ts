import { describe, expect, it } from 'vitest'
import { canvasNodeCacheKey, compileCanvasGraph, CanvasExecutionError, prepareCanvasNodeRerun } from '../src/index'
import type { CanvasExecutionPlanNode, CanvasExecutionTaskInput, CanvasSnapshot } from '@bailian-studio/canvas-contracts'

function snapshot(
  nodes: CanvasSnapshot['nodes'],
  edges: CanvasSnapshot['edges'] = [],
): CanvasSnapshot {
  return { nodes, edges }
}

function mediaNode(
  id: string,
  data: Record<string, unknown>,
): CanvasSnapshot['nodes'][number] {
  return {
    id,
    type: 'mediaNode',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      status: 'empty',
      prompt: 'a cinematic scene',
      modelId: 'qwen-image',
      referenceAssetIds: [],
      ...data,
    },
  }
}

function expectExecutionError(run: () => unknown, code: string): void {
  try {
    run()
  } catch (error) {
    expect(error).toMatchObject({ code })
    return
  }
  throw new Error(`Expected ${code} to be thrown`)
}

describe('compileCanvasGraph', () => {
  it('rejects an empty canvas instead of creating an unexecutable task', () => {
    expectExecutionError(
      () => compileCanvasGraph({ snapshot: snapshot([]) }),
      'CANVAS_EXECUTION_INVALID_GRAPH',
    )
  })

  it('compiles a deterministic DAG and binds upstream output to a media parameter', () => {
    const result = compileCanvasGraph({
      snapshot: snapshot(
        [
          mediaNode('source', { prompt: 'a red fox', modelId: 'qwen-image' }),
          mediaNode('video', {
            kind: 'video',
            modelId: 'wanx-2.7-image-to-video',
            prompt: 'the fox runs',
          }),
        ],
        [{ id: 'edge_1', source: 'source', target: 'video' }],
      ),
    })

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['source', 'video'])
    expect(result.nodes[0]?.params).not.toHaveProperty('referenceAssetIds')
    expect(result.nodes[1]).toMatchObject({
      nodeId: 'video',
      dependencyBindings: { firstFrame: ['source'] },
      dependsOn: ['source'],
    })
    expect(JSON.stringify(result)).not.toContain('https://')
  })

  it('resolves static assets by kind and keeps them separate from dependencies', () => {
    const result = compileCanvasGraph({
      snapshot: snapshot([
        mediaNode('edit', {
          modelId: 'qwen-image-edit',
          referenceAssetIds: ['asset_image_1'],
        }),
      ]),
      assetKinds: new Map([['asset_image_1', 'image']]),
    })

    expect(result.nodes[0]).toMatchObject({
      assetRefs: { image: ['asset_image_1'] },
    })
  })

  it('rejects cycles before creating an execution plan', () => {
    expect(() =>
      compileCanvasGraph({
        snapshot: snapshot(
          [mediaNode('a', {}), mediaNode('b', {})],
          [
            { id: 'ab', source: 'a', target: 'b' },
            { id: 'ba', source: 'b', target: 'a' },
          ],
        ),
      }),
    ).toThrowError(
      new CanvasExecutionError(
        'CANVAS_EXECUTION_INVALID_GRAPH',
        'Canvas graph contains a cycle and cannot be executed',
      ),
    )
  })

  it('rejects unsupported model and node combinations', () => {
    expectExecutionError(
      () =>
        compileCanvasGraph({
          snapshot: snapshot([mediaNode('bad', { modelId: 'not-a-model' })]),
        }),
      'CANVAS_EXECUTION_MODEL_NOT_FOUND',
    )

    expectExecutionError(
      () =>
        compileCanvasGraph({
          snapshot: snapshot([
            mediaNode('bad_kind', { kind: 'video', modelId: 'qwen-image' }),
          ]),
        }),
      'CANVAS_EXECUTION_MODEL_KIND_MISMATCH',
    )
  })

  it('requires the media input declared by an edit model', () => {
    expectExecutionError(
      () =>
        compileCanvasGraph({
          snapshot: snapshot([
            mediaNode('edit', { modelId: 'qwen-image-edit' }),
          ]),
        }),
      'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING',
    )
  })
})

describe('prepareCanvasNodeRerun', () => {
  it('resets the selected node and all descendants while preserving unrelated successes', () => {
    const input: CanvasExecutionTaskInput = {
      documentId: 'canvas-1',
      documentRevision: 3,
      plan: {
        nodes: [
          { nodeId: 'source', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: [] },
          { nodeId: 'target', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: ['source'] },
          { nodeId: 'downstream', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: ['target'] },
          { nodeId: 'other', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: [] },
        ],
      },
      nodeRuns: {
        source: { status: 'succeeded', assetIds: ['asset-source'] },
        target: { status: 'failed', error: 'provider failed' },
        downstream: { status: 'queued' },
        other: { status: 'succeeded', assetIds: ['asset-other'] },
      },
    }

    const next = prepareCanvasNodeRerun(input, 'target', 'failed')

    expect(next.nodeRuns).toEqual({
      source: { status: 'succeeded', assetIds: ['asset-source'] },
      target: { status: 'queued' },
      downstream: { status: 'queued' },
      other: { status: 'succeeded', assetIds: ['asset-other'] },
    })
  })

  it('does not carry cancelled generations into a new run', () => {
    const input: CanvasExecutionTaskInput = {
      documentId: 'canvas-1',
      documentRevision: 3,
      plan: {
        nodes: [
          { nodeId: 'source', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: [] },
          { nodeId: 'target', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: ['source'] },
        ],
      },
      nodeRuns: {
        source: { status: 'succeeded', assetIds: ['asset-source'] },
        target: { status: 'generating', generationId: 'generation-target' },
      },
    }

    const next = prepareCanvasNodeRerun(input, 'target', 'cancelled')

    expect(next.nodeRuns).toEqual({
      source: { status: 'succeeded', assetIds: ['asset-source'] },
      target: { status: 'queued' },
    })
  })

  it('rejects a node that is absent from the execution plan', () => {
    const input: CanvasExecutionTaskInput = {
      documentId: 'canvas-1',
      documentRevision: 1,
      plan: {
        nodes: [{ nodeId: 'source', kind: 'image', modelId: 'qwen-image', params: {}, assetRefs: {}, dependencyBindings: {}, dependsOn: [] }],
      },
      nodeRuns: {},
    }

    expect(() => prepareCanvasNodeRerun(input, 'missing', 'succeeded')).toThrowError(
      new CanvasExecutionError('CANVAS_EXECUTION_NODE_NOT_FOUND', 'Canvas node missing is not present in the execution plan', {
        nodeId: 'missing',
      }),
    )
  })
})

describe('canvasNodeCacheKey', () => {
  const node: CanvasExecutionPlanNode = {
    nodeId: 'node-1',
    kind: 'image',
    modelId: 'qwen-image',
    modelManifestHash: 'manifest-v1',
    params: { prompt: 'lantern', n: 1 },
    assetRefs: {},
    dependencyBindings: {},
    dependsOn: [],
  }

  it('is stable for object key ordering and changes with inputs', () => {
    expect(canvasNodeCacheKey(node, { image: ['asset-a', 'asset-b'] })).toBe(
      canvasNodeCacheKey(
        { ...node, params: { n: 1, prompt: 'lantern' } },
        { image: ['asset-a', 'asset-b'] },
      ),
    )
    expect(canvasNodeCacheKey(node, { image: ['asset-b', 'asset-a'] })).not.toBe(
      canvasNodeCacheKey(node, { image: ['asset-a', 'asset-b'] }),
    )
    expect(canvasNodeCacheKey(node, {})).not.toBe(
      canvasNodeCacheKey({ ...node, modelManifestHash: 'manifest-v2' }, {}),
    )
  })
})
