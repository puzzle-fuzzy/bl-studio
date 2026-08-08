/**
 * 模型注册表 —— model-core 的运行时入口。
 *
 * 把所有 provider 模型的 manifest 汇总成唯一的 MODEL_REGISTRY，并在【模块加载时】
 * 做三件事：
 *  1. assertUniqueModelIds —— 校验 id 全局唯一
 *  2. assertModelManifestConsistent —— 校验每个 manifest 内部一致
 *  3. deepFreeze —— 递归 Object.freeze 整张表
 *
 * 此后任何代码都通过 getModelById / listModels 取用 manifest，且因表已深冻结、
 * 类型层面又是 DeepReadonly，运行时与类型层面双重杜绝了 mutate。这保证了一旦
 * 注册完成，下游（API / worker / UI / 校验 / 定价）看到的 manifest 就是不可变
 * 的事实来源。
 *
 * 添加新模型的唯一入口：在 manifests/ 下新增一份 manifest，并在此处的 registry
 * 数组里追加一行。provider / service 代码无需改动——这正是 manifest 驱动架构
 * 的核心收益。
 */

import { assertModelManifestConsistent, assertUniqueModelIds } from './registry-check'
import type { DeepReadonly, FrozenModelManifest } from './types'
import { qwenImage } from './manifests/image/qwen-image'
import { qwenImage2Pro, qwenImageMax, qwenImage2 } from './manifests/image/qwen-image-2'
import { wanx27ImagePro, wanx27Image } from './manifests/image/wanx-image'
import { zImage } from './manifests/image/z-image'
import { qwenImageEditMax, qwenImageEditPlus, qwenImageEdit } from './manifests/image/qwen-image-edit'
import { wanxTextToVideo } from './manifests/video/wanx-video'
import { viduT2VPro, viduT2VTurbo, viduT2V, viduI2V, viduFirstLastFrame, viduR2V } from './manifests/video/vidu-video'
import { viduR2VQ3, viduR2VQ3Turbo, viduR2VQ3Ad, viduR2VQ3Drama, viduR2VQ2, viduR2VQ2Pro } from './manifests/video/vidu-reference-video'
import { wanx27T2V, wanx27I2V, wanx27R2V, wanx27VideoEdit } from './manifests/video/wanx-27-video'
import { wan3T2V, wan3I2V, wan3R2V } from './manifests/video/wan3-video'
import { kelingT2V, kelingI2V, kelingFirstLastFrame, kelingReferenceVideo, kelingVideoEdit } from './manifests/video/keling-video'
import { aishiT2V, aishiI2V, aishiFirstLastFrame } from './manifests/video/aishi-video'
import { happyhorseT2V, happyhorseI2V, happyhorseR2V, happyhorseVideoEdit } from './manifests/video/happyhorse-video'
import { qwenPlus, qwenMax, qwenTurbo, qwenFlash, qwenLong } from './manifests/text/qwen-text'
import { deepseekV4Pro, deepseekV4Flash } from './manifests/text/deepseek-v4'
import { funMusicV1 } from './manifests/audio/fun-music'
import { funAsrV1 } from './manifests/audio/fun-asr'
import { paraformerV1 } from './manifests/audio/paraformer'
import { qwenOmniScreenplay } from './manifests/video/qwen-omni-screenplay'
import { qwenOmniScreenplayFlash } from './manifests/video/qwen-omni-screenplay-flash'

export type { FrozenModelManifest } from './types'

/**
 * 递归 Object.freeze。seen 集合用于防循环引用——manifest 理论上是纯数据无环，
 * 但保留环检测能在出现意外结构时不爆栈而是收敛。返回类型是 DeepReadonly<T>，
 * 把"已冻结"这一事实编码进类型系统。
 */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value === null || typeof value !== 'object') return value as DeepReadonly<T>

  const objectValue = value as object
  if (seen.has(objectValue)) return value as DeepReadonly<T>
  seen.add(objectValue)

  for (const nestedValue of Object.values(objectValue)) {
    deepFreeze(nestedValue, seen)
  }

  return Object.freeze(value) as DeepReadonly<T>
}

const registry = [
  // === 图像生成 ===
  qwenImage,
  qwenImage2Pro,
  qwenImageMax,
  qwenImage2,
  wanx27ImagePro,
  wanx27Image,
  zImage,
  qwenImageEditMax,
  qwenImageEditPlus,
  qwenImageEdit,

  // === 视频生成 ===
  wanxTextToVideo,
  viduT2VPro,
  viduT2VTurbo,
  viduT2V,
  viduI2V,
  viduFirstLastFrame,
  viduR2V,
  viduR2VQ3,
  viduR2VQ3Turbo,
  viduR2VQ3Ad,
  viduR2VQ3Drama,
  viduR2VQ2,
  viduR2VQ2Pro,
  wanx27T2V,
  wanx27I2V,
  wanx27R2V,
  wanx27VideoEdit,
  wan3T2V,
  wan3I2V,
  wan3R2V,
  kelingT2V,
  kelingI2V,
  kelingFirstLastFrame,
  kelingReferenceVideo,
  kelingVideoEdit,
  aishiT2V,
  aishiI2V,
  aishiFirstLastFrame,
  happyhorseT2V,
  happyhorseI2V,
  happyhorseR2V,
  happyhorseVideoEdit,

  // === 视频理解 ===
  qwenOmniScreenplay,
  qwenOmniScreenplayFlash,

  // === 文本生成 ===
  qwenPlus,
  qwenMax,
  qwenTurbo,
  qwenFlash,
  qwenLong,
  deepseekV4Pro,
  deepseekV4Flash,

  // === 音频生成 ===
  funMusicV1,
  funAsrV1,
  paraformerV1,
]

// 加载时一次性完成"唯一性 + 内部一致性"断言。任一失败都会让本模块 import
// 直接抛错——坏 manifest 不会流到运行时。
assertUniqueModelIds(registry)
for (const manifest of registry) assertModelManifestConsistent(manifest)

// 整张表深冻结后对外暴露。下游仅读，不可 mutate。
const FROZEN_MODEL_REGISTRY = deepFreeze(registry)

/**
 * 全部已注册 manifest 的只读视图（含 availability.enabled=false 的未启用模型）。
 * 已深冻结，外部代码不应也不能修改。需要"面向用户的可用列表"请用 listModels。
 */
export const MODEL_REGISTRY: readonly FrozenModelManifest[] = FROZEN_MODEL_REGISTRY

/**
 * 返回所有 availability.enabled=true 的 manifest。enabled=false 的模型（如
 * stage='hidden' 或灰度下线）对外不可见，UI 与 API 都基于此过滤。
 */
export function listModels(): readonly FrozenModelManifest[] {
  return MODEL_REGISTRY.filter(model => model.availability.enabled)
}

/**
 * 按 id 取单个 manifest，仅命中 enabled 的模型。未启用模型返回 undefined——
 * 这样 API 路由 / share 链接对"已下线模型"自然返回 404，无需额外特判。
 */
export function getModelById(id: string): FrozenModelManifest | undefined {
  return MODEL_REGISTRY.find(model => model.id === id && model.availability.enabled)
}
