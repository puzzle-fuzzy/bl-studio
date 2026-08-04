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
 * 模型目录的显式顶层入口检查。
 *
 * registry 在模块加载时也会自检，但保留这条显式命令，能让 CI 与开发者工作流
 * 都看到 onboarding 契约。它刻意留在 model-core 内部，绝不 import SDK、
 * adapter、provider、数据库或 service。
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
