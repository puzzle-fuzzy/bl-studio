import { describe, expect, it } from 'vitest'
import {
  normalizeMediaNodeData,
  normalizeStoredCanvasEdge,
  normalizeStoredCanvasNode,
} from './media-node-data'

describe('normalizeMediaNodeData', () => {
  it('补齐缺失字段并过滤不受支持的运行时值', () => {
    expect(normalizeMediaNodeData({
      kind: 'audio',
      resultKind: 'video',
      status: 'unknown',
      resultUrl: 42,
      resultAssetId: '',
      referenceUrls: ['https://example.com/a.png', 3, null],
      referenceAssetIds: ['asset-1', false],
      referenceAssetKinds: { 'asset-1': 'video', 'asset-2': 'audio' },
      parameterValues: ['invalid'],
      aspectRatio: '2:1',
      customField: 'kept',
    })).toEqual({
      kind: 'video',
      resultKind: 'video',
      status: 'empty',
      resultUrl: undefined,
      resultAssetId: undefined,
      referenceUrls: ['https://example.com/a.png'],
      referenceAssetIds: ['asset-1'],
      referenceAssetKinds: { 'asset-1': 'video' },
      parameterValues: {},
      aspectRatio: '1:1',
      prompt: '',
      modelId: '',
      generationId: undefined,
      errorMessage: undefined,
      customField: 'kept',
    })
  })

  it('保留可恢复的生成状态与已知节点字段', () => {
    const data = normalizeMediaNodeData({
      kind: 'image',
      status: 'generating',
      prompt: 'a paper boat',
      modelId: 'image-model',
      generationId: 'generation-1',
      aspectRatio: '16:9',
    })

    expect(data.status).toBe('generating')
    expect(data.generationId).toBe('generation-1')
    expect(data.aspectRatio).toBe('16:9')
    expect(data.prompt).toBe('a paper boat')
  })
})

describe('normalizeStoredCanvasNode', () => {
  it('只恢复具有稳定 id 和位置的离线节点', () => {
    expect(normalizeStoredCanvasNode({
      id: 'node-1',
      type: 'mediaNode',
      position: { x: 10, y: 20 },
      selected: true,
      data: { kind: 'image' },
    })).toMatchObject({
      id: 'node-1',
      type: 'mediaNode',
      position: { x: 10, y: 20 },
      selected: true,
      data: { kind: 'image', status: 'empty' },
    })
    expect(normalizeStoredCanvasNode({ id: 'missing-position', data: {} })).toBeUndefined()
  })
})

describe('normalizeStoredCanvasEdge', () => {
  it('丢弃损坏的连接并保留合法连接字段', () => {
    expect(normalizeStoredCanvasEdge({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      sourceHandle: null,
      animated: true,
    })).toEqual({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      sourceHandle: null,
      animated: true,
    })
    expect(normalizeStoredCanvasEdge({ id: 'edge-2', source: '', target: 'node-2' })).toBeUndefined()
  })
})
