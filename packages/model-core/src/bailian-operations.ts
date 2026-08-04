/**
 * Bailian Studio 产品 manifest → Bailian SDK operation 的映射。
 *
 * 本文件刻意只包含"消费者持有的产品标识 → 能力"这一决策。provider 模型 ID
 * 与执行模式仍来自 ModelManifest；请求字段、传输、响应、生命周期与官方定价
 * 归属 @puzzle-fuzzy/bailian-sdk。
 */

import { MODEL_REGISTRY, listModels } from './registry'
import type { FrozenModelManifest, ModelTaskMode } from './types'

export type BailianOperationCapability =
  | 'text.chat'
  | 'image.text-to-image'
  | 'image.image-to-image'
  | 'image.edit'
  | 'video.text-to-video'
  | 'video.image-to-video'
  | 'video.reference-to-video'
  | 'video.edit'
  | 'video.understand'
  | 'speech.recognize'
  | 'music.generate'

export type BailianExecutionMode = 'sync' | 'async' | 'stream'

export interface BailianCoverageRequirementReference {
  consumerId: string
  providerModelId: string
  capability: BailianOperationCapability
  mode: BailianExecutionMode
  region: 'cn-beijing'
}

const CAPABILITY_BY_MANIFEST_ID = {
  'qwen-image': 'image.text-to-image',
  'qwen-image-2.0-pro': 'image.text-to-image',
  'qwen-image-max': 'image.text-to-image',
  'qwen-image-2.0': 'image.text-to-image',
  'wanx-2.7-image-pro': 'image.image-to-image',
  'wanx-2.7-image': 'image.image-to-image',
  'z-image-turbo': 'image.text-to-image',
  'qwen-image-edit-max': 'image.edit',
  'qwen-image-edit-plus': 'image.edit',
  'qwen-image-edit': 'image.edit',
  'wanx-text-to-video': 'video.text-to-video',
  'vidu-text-to-video-pro': 'video.text-to-video',
  'vidu-text-to-video-turbo': 'video.text-to-video',
  'vidu-text-to-video': 'video.text-to-video',
  'vidu-image-to-video': 'video.image-to-video',
  'vidu-first-last-frame-video': 'video.image-to-video',
  'vidu-reference-video': 'video.reference-to-video',
  'wanx-2.7-text-to-video': 'video.text-to-video',
  'wanx-2.7-image-to-video': 'video.image-to-video',
  'wanx-2.7-reference-video': 'video.reference-to-video',
  'wanx-2.7-video-edit': 'video.edit',
  'keling-text-to-video': 'video.text-to-video',
  'keling-image-to-video': 'video.image-to-video',
  'keling-first-last-frame-video': 'video.image-to-video',
  'keling-reference-video': 'video.reference-to-video',
  'keling-video-edit': 'video.edit',
  'aishi-text-to-video': 'video.text-to-video',
  'aishi-image-to-video': 'video.image-to-video',
  'aishi-first-last-frame-video': 'video.image-to-video',
  'happyhorse-text-to-video': 'video.text-to-video',
  'happyhorse-image-to-video': 'video.image-to-video',
  'happyhorse-reference-video': 'video.reference-to-video',
  'happyhorse-video-edit': 'video.edit',
  'qwen-omni-screenplay': 'video.understand',
  'qwen-omni-screenplay-flash': 'video.understand',
  'qwen-plus': 'text.chat',
  'qwen-max': 'text.chat',
  'qwen-turbo': 'text.chat',
  'qwen-flash': 'text.chat',
  'qwen-long': 'text.chat',
  'deepseek-v4-pro': 'text.chat',
  'deepseek-v4-flash': 'text.chat',
  'fun-music-v1': 'music.generate',
  'fun-asr-v1': 'speech.recognize',
  'paraformer-v1': 'speech.recognize',
} as const satisfies Readonly<Record<string, BailianOperationCapability>>

export function getBailianOperationCapability(
  modelId: string,
): BailianOperationCapability | undefined {
  return CAPABILITY_BY_MANIFEST_ID[
    modelId as keyof typeof CAPABILITY_BY_MANIFEST_ID
  ]
}

function executionMode(taskMode: ModelTaskMode): BailianExecutionMode {
  if (taskMode === 'provider_async') return 'async'
  return taskMode
}

export function assertBailianOperationMapComplete(
  manifests: readonly FrozenModelManifest[] = MODEL_REGISTRY,
): void {
  const manifestIds = new Set(manifests.map((manifest) => manifest.id))
  const mappingIds = Object.keys(CAPABILITY_BY_MANIFEST_ID)
  const missing = [...manifestIds].filter((id) => !(id in CAPABILITY_BY_MANIFEST_ID))
  const stale = mappingIds.filter((id) => !manifestIds.has(id))
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(`Bailian operation map mismatch; missing=[${missing.join(', ')}], stale=[${stale.join(', ')}]`)
  }
}

assertBailianOperationMapComplete()

export function listBailianCoverageRequirements(): readonly BailianCoverageRequirementReference[] {
  return listModels().map((manifest) => {
    const capability = getBailianOperationCapability(manifest.id)
    if (capability === undefined) {
      throw new Error(`Missing Bailian operation capability for ${manifest.id}`)
    }

    return {
      consumerId: manifest.id,
      providerModelId: manifest.providerModel,
      capability,
      mode: executionMode(manifest.taskMode),
      region: 'cn-beijing',
    }
  })
}
