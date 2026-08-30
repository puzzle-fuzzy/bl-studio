import { DirectorContinuityResultSchema, type DirectorContinuityResult } from '@bailian-studio/director-contracts'

export interface DirectorContinuityShotInput {
  id: string
  sequence: number
  sceneNumber: number | null
  slugline: string | null
  narrative: string
  camera: Record<string, unknown>
  durationSeconds: number | null
  environmentPrompt: string | null
  videoPrompt: string | null
  dialogue: Record<string, unknown> | null
  continuity: Record<string, unknown> | null
}

export function parseDirectorContinuityOutput(text: string): DirectorContinuityResult | undefined {
  const candidates = [text.trim(), stripCodeFence(text.trim()), extractObject(text)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorContinuityResultSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next normalized representation.
    }
  }
  return undefined
}

export function continuityPrompt(title: string, synopsis: string | null, shots: readonly DirectorContinuityShotInput[]): string {
  return [
    '你是一名短剧导演与现场连续性顾问。请检查下面已经人工审核过的分镜草稿，找出跨镜头会影响拍摄和视频生成的连续性风险。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    '只引用输入中真实存在的 shotId，不要虚构角色、场景、道具或事件。没有风险时 issues 返回空数组。',
    'severity 只能是 info、warning、error；category 使用简短中文分类，例如角色、场景、时间、动作、镜头、道具。',
    '{"summary":"整体连续性结论","issues":[{"shotId":"输入中的镜头ID","sequence":1,"severity":"warning","category":"角色","issue":"具体风险","suggestion":"可执行的修正建议"}]}',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
    `分镜输入：\n${JSON.stringify(shots)}`,
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
