import { DirectorPromptRebuildResultSchema, type DirectorPromptRebuildResult } from '@bailian-studio/director-contracts'

export interface DirectorPromptRebuildShotInput {
  id: string
  sequence: number
  sceneNumber: number | null
  slugline: string | null
  narrative: string
  camera: Record<string, unknown>
  durationSeconds: number | null
  environmentPrompt: string | null
  videoPrompt: string | null
  negativePrompt: string | null
  dialogue: Record<string, unknown> | null
  continuity: Record<string, unknown> | null
  referenceAssetIds: string[]
}

export function parseDirectorPromptRebuildOutput(text: string): DirectorPromptRebuildResult | undefined {
  const trimmed = text.trim()
  const candidates = [trimmed, stripCodeFence(trimmed), extractObject(trimmed)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorPromptRebuildResultSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next normalized representation.
    }
  }
  return undefined
}

export function promptRebuildPrompt(
  title: string,
  synopsis: string | null,
  shots: readonly DirectorPromptRebuildShotInput[],
  continuity: unknown,
): string {
  return [
    '你是一名短剧导演、分镜师和视频提示词顾问。请基于已经人工审核过的当前分镜，重建适合视频模型执行的环境提示词、动作提示词和负面提示词。',
    '这里只生成可供用户逐镜审核和编辑的建议，不要自动生成视频，不要修改分镜结构，不要凭空增加角色、场景、道具或事件。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。每个 shotId 必须来自输入，sequence 必须与输入保持一致。',
    'environmentPrompt 只描述画面环境、角色外观连续性、光线和空间锚点；videoPrompt 只描述镜头内动作、表情、镜头运动和节奏；negativePrompt 描述应避免的画面问题。',
    '如果已有提示词已经足够明确，应保留其有效信息并只做必要的补全。rationale 简述这次调整解决了什么执行风险。',
    '{"summary":"本次提示词重建的总体说明","shots":[{"shotId":"输入中的镜头ID","sequence":1,"environmentPrompt":"环境与视觉连续性提示词","videoPrompt":"动作与镜头运动提示词","negativePrompt":"需要避免的画面问题","rationale":"调整原因"}]}',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
    `连续性检查结果：\n${JSON.stringify(continuity)}`,
    `当前分镜输入：\n${JSON.stringify(shots)}`,
  ].filter(value => value.length > 0).join('\n\n')
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function extractObject(value: string): string {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  return start >= 0 && end > start ? value.slice(start, end + 1) : ''
}
