import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/dashscope-manifests'
import type { CanvasSnapshot } from '@bailian-studio/canvas-contracts'
import { preflightCanvasGraph, type CanvasPreflightModel } from '../src/index'

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

function preflightModel(id: string): CanvasPreflightModel {
  const model = getModelById(id)
  if (model === undefined) {
    throw new Error(`Expected an image or video model: ${id}`)
  }
  if (model.category === 'image') return { ...model, category: 'image' }
  if (model.category === 'video') return { ...model, category: 'video' }
  throw new Error(`Expected an image or video model: ${id}`)
}

describe('preflightCanvasGraph', () => {
  it('returns localized field issues before a request is submitted', () => {
    const result = preflightCanvasGraph({
      snapshot: snapshot([
        mediaNode('invalid', {
          prompt: '',
          parameterValues: { seed: 99999999999 },
        }),
      ]),
      models: [preflightModel('qwen-image')],
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'invalid', field: 'prompt', code: 'CANVAS_EXECUTION_PROMPT_REQUIRED', message: '节点 invalid 需要填写提示词' }),
      expect.objectContaining({ nodeId: 'invalid', field: 'seed', code: 'OUT_OF_RANGE', message: '随机种子必须小于或等于 2147483647' }),
    ]))
  })

  it('uses graph references to validate required media slots', () => {
    const result = preflightCanvasGraph({
      snapshot: snapshot([
        mediaNode('edit', { modelId: 'qwen-image-edit' }),
      ]),
      models: [preflightModel('qwen-image-edit')],
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      nodeId: 'edit',
      field: 'image',
      code: 'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING',
    }))
  })

  it('accepts an authored node when model defaults and parameters are valid', () => {
    const result = preflightCanvasGraph({
      snapshot: snapshot([
        mediaNode('configured', {
          parameterValues: { watermark: true, size: '928*1664' },
        }),
      ]),
      models: [preflightModel('qwen-image')],
    })

    expect(result).toEqual({ valid: true, issues: [] })
  })
})
