import type {
  DeepReadonly,
  FrozenModelManifest,
  ModelCapability,
  ModelCategory,
  ModelParameter,
  ModelTaskMode,
  ModelValidationRule,
} from './types'

/**
 * Provider-neutral model lookup seam.
 *
 * Runtime packages consume this port instead of importing a concrete provider
 * catalog. The process composition root decides which catalog implementation
 * supplies the immutable manifest snapshot.
 */
export interface ModelManifestResolver<
  TManifest extends FrozenModelManifest = FrozenModelManifest,
> {
  getModelById(id: string): TManifest | undefined
}

/**
 * Provider-neutral catalog data exposed to product/API consumers.
 *
 * A concrete catalog may retain a richer manifest internally, but the catalog
 * port only exposes fields needed for model selection and client-side
 * validation. Provider request/output/transport details stay behind the port.
 */
export interface ModelCatalogProjection {
  id: string
  provider: string
  providerModel: string
  displayName: string
  description?: string
  category: ModelCategory
  operation: string
  taskMode: ModelTaskMode
  capabilities: readonly DeepReadonly<ModelCapability>[]
  parameters: readonly DeepReadonly<ModelParameter>[]
  rules?: readonly DeepReadonly<ModelValidationRule>[]
  availability: {
    readonly enabled: boolean
    readonly stage: 'stable' | 'beta' | 'hidden'
    readonly notActivated?: string
  }
  referenceFormat?: string
}

/** Model catalog seam supplied by the process composition root. */
export interface ModelCatalog {
  list(): readonly ModelCatalogProjection[]
  getById(id: string): ModelCatalogProjection | undefined
}
