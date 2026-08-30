import { DirectorDialogueResultSchema, type DirectorDialogueResult } from '@bailian-studio/director-contracts'

export interface DirectorDialogueShotInput {
  id: string
  sequence: number
  sceneNumber: number | null
  slugline: string | null
  narrative: string
  dialogue: Record<string, unknown> | null
  continuity: Record<string, unknown> | null
}

export function parseDirectorDialogueOutput(text: string): DirectorDialogueResult | undefined {
  const trimmed = text.trim()
  const candidates = [trimmed, stripCodeFence(trimmed), extractObject(trimmed)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorDialogueResultSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next normalized representation.
    }
  }
  return undefined
}

export function dialoguePrompt(
  title: string,
  synopsis: string | null,
  shots: readonly DirectorDialogueShotInput[],
): string {
  return [
    '你是一名短剧编剧、对白导演和现场表演顾问。请基于已经人工审核过的当前分镜，整理适合拍摄和配音的逐镜对白建议。',
    '这里只生成可供用户逐镜审核和编辑的建议，不要自动生成视频，不要改变分镜顺序，不要凭空增加角色或剧情事件。没有对白的镜头返回空 lines。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。每个 shotId 必须来自输入，sequence 必须与输入保持一致。',
    'speaker 必须来自当前镜头已有角色或剧本中明确出现的角色；text 保留原意并适当口语化；delivery 描述语气、情绪和节奏。',
    '{"summary":"本次对白整理的总体说明","shots":[{"shotId":"输入中的镜头ID","sequence":1,"lines":[{"speaker":"角色名","text":"台词","delivery":"克制、低声"}],"rationale":"调整原因"}]}',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
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
