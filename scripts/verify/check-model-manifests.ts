import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertBailianOperationMapComplete,
  assertModelManifestConsistent,
  assertUniqueModelIds,
  MODEL_REGISTRY,
  type FrozenModelManifest,
} from '@bailian-studio/dashscope-manifests'
import { validateModelParams } from '@bailian-studio/model-core'

export interface ModelManifestCheckSummary {
  readonly registeredModels: number
  readonly enabledModels: number
  readonly operationRequirements: number
  readonly examplesChecked: number
  readonly sourceRefDrifts: number
  readonly parameterInventoryGaps: number
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

interface SyncStateDocument {
  path: string
  officialVersion: number
}

/**
 * 模型目录的显式顶层入口检查。
 *
 * registry 在模块加载时也会自检，但保留这条显式命令，能让 CI 与开发者工作流
 * 都看到 onboarding 契约。它刻意留在仓库校验脚本层，绝不 import SDK、
 * adapter、provider、数据库或 service。
 *
 * Batch 4 增强：
 *  1. examples 门禁——对声明了 examples 的 manifest 真跑 validateModelParams
 *  2. sourceRefs 漂移检测——对比 sync-state.json 版本，文档更新但 manifest
 *     版本落后时输出漂移计数（警告级，不阻塞 CI）
 *  3. parameterInventory 完整性——确保每个声明的参数都有 request binding，
 *     每个 binding 都引用了声明的参数（防止 AI 提取时静默丢参数）
 */
export function checkModelManifests(
  manifests: readonly FrozenModelManifest[] = MODEL_REGISTRY,
): ModelManifestCheckSummary {
  assertUniqueModelIds(manifests)
  for (const manifest of manifests) assertModelManifestConsistent(manifest)
  assertBailianOperationMapComplete(manifests)

  const enabledModels = manifests.filter(manifest => manifest.availability.enabled)
  if (enabledModels.length === 0) throw new Error('Model catalog must expose at least one enabled model')

  let examplesChecked = 0
  let parameterInventoryGaps = 0
  for (const manifest of manifests) {
    examplesChecked += assertManifestExamples(manifest)
    parameterInventoryGaps += countParameterInventoryGaps(manifest)
  }

  if (parameterInventoryGaps > 0) {
    throw new Error(
      `Parameter inventory gaps: ${parameterInventoryGaps} (parameters missing bindings or bindings referencing undeclared parameters)`,
    )
  }

  const sourceRefDrifts = checkSourceRefDrift(manifests)

  return {
    registeredModels: manifests.length,
    enabledModels: enabledModels.length,
    operationRequirements: enabledModels.length,
    examplesChecked,
    sourceRefDrifts,
    parameterInventoryGaps,
  }
}

function assertManifestExamples(manifest: FrozenModelManifest): number {
  const examples = manifest.examples
  if (examples === undefined) return 0

  let checked = 0

  for (const [index, params] of examples.valid.entries()) {
    checked++
    const result = validateModelParams(manifest, params)
    if (!result.valid) {
      const errors = result.errors.map(e => `${e.code}:${e.field}`).join(', ')
      throw new Error(`Manifest ${manifest.id} examples.valid[${index}] should pass but got: ${errors}`)
    }
  }

  for (const [index, expectation] of examples.invalid.entries()) {
    checked++
    const result = validateModelParams(manifest, expectation.params)
    if (result.valid) {
      throw new Error(`Manifest ${manifest.id} examples.invalid[${index}] should fail with ${expectation.expectedCode} but passed`)
    }
    const matched = result.errors.some(error =>
      error.code === expectation.expectedCode
      && (expectation.expectedField === undefined || error.field === expectation.expectedField))
    if (!matched) {
      const actual = result.errors.map(e => `${e.code}:${e.field}`).join(', ')
      throw new Error(`Manifest ${manifest.id} examples.invalid[${index}] expected ${expectation.expectedCode} but got: ${actual}`)
    }
  }

  return checked
}

function countParameterInventoryGaps(manifest: FrozenModelManifest): number {
  const declared = new Set(manifest.parameters.map(p => p.name))
  const bound = new Set(Object.keys(manifest.request.bindings))
  let gaps = 0

  for (const name of declared) {
    if (!bound.has(name)) {
      console.warn(`  [inventory] ${manifest.id}: parameter "${name}" declared but not bound`)
      gaps++
    }
  }
  for (const name of bound) {
    if (!declared.has(name)) {
      console.warn(`  [inventory] ${manifest.id}: binding "${name}" references undeclared parameter`)
      gaps++
    }
  }
  return gaps
}

function checkSourceRefDrift(manifests: readonly FrozenModelManifest[]): number {
  const syncState = loadSyncState()
  if (syncState === null) return 0

  const docVersions = new Map<string, number>()
  for (const doc of syncState) {
    docVersions.set(doc.path, doc.officialVersion)
  }

  let drifts = 0
  for (const manifest of manifests) {
    const refs = manifest.sourceRefs
    if (refs === undefined) continue
    for (const path of refs.paths) {
      const currentVersion = docVersions.get(path)
      if (currentVersion === undefined) continue
      if (currentVersion > refs.reviewedAtVersion) {
        console.warn(`  [sourceRefs] ${manifest.id}: doc "${path}" v${currentVersion} > reviewed v${refs.reviewedAtVersion}`)
        drifts++
      }
    }
  }
  return drifts
}

function loadSyncState(): SyncStateDocument[] | null {
  try {
    const raw = JSON.parse(readFileSync(resolve(repoRoot, 'docs/bailian/official/sync-state.json'), 'utf-8'))
    if (!Array.isArray(raw.sourceDocuments)) return null
    return raw.sourceDocuments.filter((d: unknown): d is SyncStateDocument =>
      typeof d === 'object' && d !== null
      && typeof (d as SyncStateDocument).path === 'string'
      && typeof (d as SyncStateDocument).officialVersion === 'number')
  }
  catch {
    return null
  }
}

if (import.meta.main) {
  const summary = checkModelManifests()
  console.log(
    `Model manifests OK: ${summary.registeredModels} registered,`
    + ` ${summary.enabledModels} enabled,`
    + ` ${summary.examplesChecked} examples verified,`
    + ` ${summary.parameterInventoryGaps} inventory gaps,`
    + ` ${summary.sourceRefDrifts} source ref drifts`,
  )
}
