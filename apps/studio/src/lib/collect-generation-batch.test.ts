import { describe, expect, it } from 'vitest'
import { buildCollectGenerationBatchRequest } from './collect-generation-batch'

describe('buildCollectGenerationBatchRequest', () => {
  it('creates ordered, normalized items with shared collection metadata', () => {
    expect(buildCollectGenerationBatchRequest({
      generationId: 'generation-1',
      artifactIds: ['artifact-2', 'artifact-7'],
      type: 'character',
      role: 'front',
      projectId: ' project-1 ',
      namePrefix: ' 林默 ',
      description: '  标准角色设定  ',
    })).toEqual({
      items: [
        {
          type: 'character',
          name: '林默 01',
          description: '标准角色设定',
          projectId: 'project-1',
          sourceGenerationId: 'generation-1',
          semanticSpec: {},
          generationRecipe: { source: 'generation', generationId: 'generation-1', batchPosition: 0 },
          references: [{ artifactId: 'artifact-2', role: 'front', position: 0, metadata: { source: 'generated' } }],
        },
        {
          type: 'character',
          name: '林默 02',
          description: '标准角色设定',
          projectId: 'project-1',
          sourceGenerationId: 'generation-1',
          semanticSpec: {},
          generationRecipe: { source: 'generation', generationId: 'generation-1', batchPosition: 1 },
          references: [{ artifactId: 'artifact-7', role: 'front', position: 0, metadata: { source: 'generated' } }],
        },
      ],
    })
  })

  it('omits optional empty values and protects the server batch limit', () => {
    expect(buildCollectGenerationBatchRequest({
      generationId: 'generation-1',
      artifactIds: ['artifact-1'],
      type: 'environment',
      role: 'wide',
      namePrefix: '场景',
      description: '   ',
    }).items[0]).not.toHaveProperty('description')

    expect(() => buildCollectGenerationBatchRequest({
      generationId: 'generation-1',
      artifactIds: Array.from({ length: 51 }, (_, index) => `artifact-${index}`),
      type: 'prop',
      role: 'isolated',
      namePrefix: '道具',
    })).toThrow('一次最多收录 50 个图片产物')
  })
})
