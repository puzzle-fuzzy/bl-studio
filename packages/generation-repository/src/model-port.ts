import type { FrozenModelManifest } from '@bailian-studio/model-core'

/**
 * Model lookup seam owned by the composition root.
 *
 * Generation persistence only needs a manifest snapshot to validate inputs,
 * estimate cost, and persist an audit snapshot. It must not know which
 * provider catalog supplies that snapshot.
 */
export interface ModelManifestResolver {
  getModelById(id: string): FrozenModelManifest | undefined
}
