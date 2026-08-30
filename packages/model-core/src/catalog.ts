import type { FrozenModelManifest } from './types'

/**
 * Provider-neutral model lookup seam.
 *
 * Runtime packages consume this port instead of importing a concrete provider
 * catalog. The process composition root decides which catalog implementation
 * supplies the immutable manifest snapshot.
 */
export interface ModelManifestResolver {
  getModelById(id: string): FrozenModelManifest | undefined
}
