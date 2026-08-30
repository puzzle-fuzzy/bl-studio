import {
  getBailianOperationCapability,
  type BailianOperationCapability,
} from './bailian-operations'
import { MODEL_REGISTRY } from './registry'
import type { ReferenceFormat } from './contracts'
import type { FrozenModelManifest } from './types'
import type { ModelCatalog } from '@bailian-studio/model-core'

export type ModelCatalogItem = FrozenModelManifest & Readonly<{
  operation: BailianOperationCapability
  referenceFormat?: ReferenceFormat
}>

const MODEL_CATALOG: readonly ModelCatalogItem[] = Object.freeze(
  MODEL_REGISTRY.map((manifest) => {
    const operation = getBailianOperationCapability(manifest.id)
    if (operation === undefined) {
      throw new Error(`Missing model operation for catalog item ${manifest.id}`)
    }

    return Object.freeze({
      ...manifest,
      operation,
      referenceFormat: manifest.request.kind === 'dashscope-video-task'
        ? manifest.request.referenceFormat
        : undefined,
    })
  }),
)

export function listModelCatalogItems(): readonly ModelCatalogItem[] {
  return MODEL_CATALOG
}

export function getModelCatalogItemById(
  id: string,
): ModelCatalogItem | undefined {
  return MODEL_CATALOG.find((model) => model.id === id)
}

/** DashScope implementation of the provider-neutral model catalog port. */
export const modelCatalog: ModelCatalog = {
  list: listModelCatalogItems,
  getById: getModelCatalogItemById,
}
