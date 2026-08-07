import type { CreateGenerationRequest } from '@bailian-studio/api-client'

/**
 * 辅助工具（视频→剧本 / 语音识别）的提交载荷构建（R2-P1-09）。
 *
 * 把「工具模型 → 所选素材的 assetRefs 媒体参数名」映射下沉为纯函数，便于单测：
 * P0-01 曾因 UI 层把 fun-asr 的媒体参数错写成 audioUrl（manifest 声明为 fileUrls）
 * 导致功能端到端不可用——这个映射必须与 manifest 的媒体参数名对齐，并靠测试锁死。
 *
 * 单一事实源在 model-core 的 manifest（参数 type: 'media' 的 name），此处是工具页
 * 快捷入口的静态映射；若新增工具模型，需在 toolMediaParamName 补充映射并加测试。
 */

export const TOOL_SCREENPLAY_MODEL_IDS = ['qwen-omni-screenplay', 'qwen-omni-screenplay-flash'] as const
export const TOOL_ASR_MODEL_IDS = ['fun-asr-v1'] as const

/** 工具提交所需的媒体参数名：assetRefs 的 key，须与 manifest 中 type: 'media' 的参数 name 一致。 */
export function toolMediaParamName(modelId: string): string {
  if ((TOOL_SCREENPLAY_MODEL_IDS as readonly string[]).includes(modelId)) return 'videoUrl'
  if ((TOOL_ASR_MODEL_IDS as readonly string[]).includes(modelId)) return 'fileUrls'
  throw new Error(`Unsupported tool model: ${modelId}`)
}

export function buildToolGenerationPayload(
  modelId: string,
  assetId: string,
): CreateGenerationRequest {
  return {
    modelId,
    params: {},
    assetRefs: { [toolMediaParamName(modelId)]: [assetId] },
  }
}
