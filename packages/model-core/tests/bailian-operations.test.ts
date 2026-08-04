import { describe, expect, test } from 'vitest'

import {
  assertBailianOperationMapComplete,
  listBailianCoverageRequirements,
  listModelCatalogItems,
  listModels,
} from '../src'

describe('Bailian SDK product operation map', () => {
  test('covers every enabled Bailian Studio manifest exactly once', () => {
    assertBailianOperationMapComplete()
    const requirements = listBailianCoverageRequirements()
    const models = listModels()
    expect(requirements).toHaveLength(models.length)
    expect(new Set(requirements.map(({ consumerId }) => consumerId)).size).toBe(models.length)
    for (const requirement of requirements) {
      const manifest = models.find(({ id }) => id === requirement.consumerId)
      if (manifest === undefined) throw new Error(`Missing manifest ${requirement.consumerId}`)
      expect(requirement.providerModelId).toBe(manifest.providerModel)
      expect(requirement.mode).toBe(manifest.taskMode === 'provider_async' ? 'async' : manifest.taskMode)
      expect(requirement.region).toBe('cn-beijing')
    }
  })

  test('maps representative operations from the complete official catalog explicitly', () => {
    const requirements = listBailianCoverageRequirements()
    expect(requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ consumerId: 'keling-text-to-video', capability: 'video.text-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'keling-image-to-video', capability: 'video.image-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'keling-first-last-frame-video', capability: 'video.image-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'keling-reference-video', capability: 'video.reference-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'keling-video-edit', capability: 'video.edit', mode: 'async' }),
      expect.objectContaining({ consumerId: 'happyhorse-text-to-video', capability: 'video.text-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'happyhorse-image-to-video', capability: 'video.image-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'happyhorse-reference-video', capability: 'video.reference-to-video', mode: 'async' }),
      expect.objectContaining({ consumerId: 'happyhorse-video-edit', capability: 'video.edit', mode: 'async' }),
      expect.objectContaining({ consumerId: 'fun-music-v1', capability: 'music.generate', mode: 'sync' }),
    ]))
  })

  test('projects each operation into the product model catalog', () => {
    const catalog = listModelCatalogItems()
    const requirements = listBailianCoverageRequirements()

    expect(catalog).toHaveLength(requirements.length)
    for (const item of catalog) {
      const requirement = requirements.find(
        ({ consumerId }) => consumerId === item.id,
      )
      if (requirement === undefined) {
        throw new Error(`Missing requirement for catalog item ${item.id}`)
      }
      expect(item.operation).toBe(requirement.capability)
      expect(Object.isFrozen(item)).toBe(true)
    }
  })

  test('projects video prompt reference syntax into the frontend catalog', () => {
    const catalog = listModelCatalogItems()
    const referenceModels = catalog.filter(
      (item) =>
        item.request.kind === 'dashscope-video-task' &&
        item.request.referenceFormat !== undefined,
    )

    expect(referenceModels.length).toBeGreaterThan(0)
    for (const item of referenceModels) {
      if (item.request.kind !== 'dashscope-video-task') {
        throw new Error(`Expected video task catalog item ${item.id}`)
      }
      expect(item.referenceFormat).toBe(item.request.referenceFormat)
    }
    expect(
      referenceModels.find(({ id }) => id === 'vidu-reference-video')
        ?.referenceFormat,
    ).toBe('image-bracket')
  })
})
