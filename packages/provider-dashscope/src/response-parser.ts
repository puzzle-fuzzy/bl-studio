/**
 * DashScope（百炼）响应归一化。
 *
 * 不同模型（文生图、文生视频、音频生成、多模态对话等）的响应结构差异很大，
 * 但下游 worker 只关心"产出的 artifact 列表"。本模块依据 manifest 的
 * ProviderOutputMapping.kind，从原始响应里按对应策略取出 url/text，统一包装为
 * NormalizedArtifact，把 provider 特有的结构差异屏蔽在此处。
 */
import type { NormalizedArtifact, NormalizedOutput } from '@bailian-studio/model-core'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'

// Compatibility exports keep provider-local imports stable while the shared
// output contract is owned by model-core.
export type { NormalizedArtifact, NormalizedOutput } from '@bailian-studio/model-core'

/**
 * 把 DashScope 原始响应按 manifest 归一化为 NormalizedOutput。
 *
 * usage 字段只有在响应里实际存在时才透出（避免输出 `{ usage: undefined }`）。
 * raw 始终原样保留，供上游记录日志、排查或回放使用。
 */
export function parseDashScopeOutput(manifest: FrozenModelManifest, raw: unknown): NormalizedOutput {
  const artifacts = parseArtifacts(manifest, raw)
  const usage = getProperty(raw, 'usage')

  return {
    artifacts,
    ...(usage !== undefined ? { usage } : {}),
    raw,
  }
}

/**
 * 按 manifest.output.kind 分派到对应的解析策略：
 *  - video-url / audio-url / text：单值路径，直接取 manifest.output.path 指向的字符串；
 *  - images-from-message-content：多模态对话返回的 choices[].message.content 结构；
 *  - asr-transcription：语音识别异步任务返回的 transcription_url；
 *  - custom / 其它：当前不解析 artifact（调用方自行处理 raw）。
 */
function parseArtifacts(manifest: FrozenModelManifest, raw: unknown): NormalizedArtifact[] {
  switch (manifest.output.kind) {
    case 'video-url': {
      const sourceUrl = getPath(raw, manifest.output.path)
      return typeof sourceUrl === 'string' ? [{ kind: 'video', sourceUrl }] : []
    }
    case 'audio-url': {
      const sourceUrl = getPath(raw, manifest.output.path)
      return typeof sourceUrl === 'string' ? [{ kind: 'audio', sourceUrl }] : []
    }
    case 'text': {
      const text = getPath(raw, manifest.output.path)
      return typeof text === 'string' ? [{ kind: 'text', text }] : []
    }
    case 'images-from-message-content':
      return parseImageMessageContent(raw)
    case 'asr-transcription':
      return parseAsrTranscription(raw)
    case 'custom':
      return []
    default:
      return []
  }
}

/**
 * 解析多模态对话式返回（如 qwen-image 的图像编辑）。
 *
 * DashScope 这类接口把生成结果放在 `output.choices[].message.content[]`，
 * 每个 content 项形如 `{ image: "<url>" }` 或 `{ text: "..." }`。这里只挑出 image
 * 项作为图片 artifact 的来源 url。
 */
function parseImageMessageContent(raw: unknown): NormalizedArtifact[] {
  const choices = getPath(raw, 'output.choices')
  if (!Array.isArray(choices)) return []

  const artifacts: NormalizedArtifact[] = []
  for (const choice of choices) {
    const content = getPath(choice, 'message.content')
    if (!Array.isArray(content)) continue

    for (const item of content) {
      const image = getProperty(item, 'image')
      if (typeof image === 'string') artifacts.push({ kind: 'image', sourceUrl: image })
    }
  }

  return artifacts
}

/** 按点分隔的路径（如 'output.task_id'）逐级取值，遇到非对象或缺失字段返回 undefined。 */
function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => getProperty(current, segment), value)
}

function getProperty(value: unknown, property: string): unknown {
  if (typeof value !== 'object' || value === null || !(property in value)) return undefined
  return (value as Record<string, unknown>)[property]
}

/**
 * 解析 Fun-ASR 异步语音识别任务的返回结果。
 *
 * DashScope 的异步语音识别（Fun-ASR）在轮询到 SUCCEEDED 后，把识别结果放在
 * `output.results[]` 数组中，每项包含 `transcription_url`（有效期为 24 小时的
 * 签名 URL，指向 JSON 格式的识别结果文件）。本函数取出所有成功子任务的
 * transcription_url，作为 `kind: 'text'` 的 artifact 输出（sourceUrl 指向
 * 该 JSON 文件），让上游 worker 或前端按需下载。
 */
function parseAsrTranscription(raw: unknown): NormalizedArtifact[] {
  const results = getPath(raw, 'output.results')
  if (!Array.isArray(results)) return []

  const artifacts: NormalizedArtifact[] = []
  for (const result of results) {
    if (typeof result !== 'object' || result === null) continue
    const subtaskStatus = getProperty(result, 'subtask_status')
    const transcriptionUrl = getProperty(result, 'transcription_url')
    if (subtaskStatus === 'SUCCEEDED' && typeof transcriptionUrl === 'string') {
      artifacts.push({ kind: 'text', sourceUrl: transcriptionUrl, mimeType: 'application/json' })
    }
  }

  return artifacts
}
