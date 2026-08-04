import {
  assertBailianOperationMapComplete,
  assertModelManifestConsistent,
  assertUniqueModelIds,
  MODEL_REGISTRY,
} from '../../packages/model-core/src/index'
import type { FrozenModelManifest } from '../../packages/model-core/src/index'

export interface ModelManifestCheckSummary {
  readonly registeredModels: number
  readonly enabledModels: number
  readonly operationRequirements: number
}

/**
 * Explicit root-level gate for the model catalog.
 *
 * The registry also checks itself at module load, but keeping this command
 * explicit makes the onboarding contract visible in CI and in the developer
 * workflow. It intentionally stays inside model-core and never imports an SDK,
 * adapter, provider, database, or service.
 */
export function checkModelManifests(
  manifests: readonly FrozenModelManifest[] = MODEL_REGISTRY,
): ModelManifestCheckSummary {
  assertUniqueModelIds(manifests)
  for (const manifest of manifests) assertModelManifestConsistent(manifest)
  assertBailianOperationMapComplete(manifests)

  const enabledModels = manifests.filter(manifest => manifest.availability.enabled)
  if (enabledModels.length === 0) throw new Error('Model catalog must expose at least one enabled model')

  return {
    registeredModels: manifests.length,
    enabledModels: enabledModels.length,
    operationRequirements: enabledModels.length,
  }
}

if (import.meta.main) {
  const summary = checkModelManifests()
  console.log(`Model manifests OK: ${summary.registeredModels} registered, ${summary.enabledModels} enabled, ${summary.operationRequirements} operation requirements`)
}
