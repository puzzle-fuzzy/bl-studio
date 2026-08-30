export type ScreenplayLineKind =
  | 'blank'
  | 'title'
  | 'scene-heading'
  | 'section-heading'
  | 'dialogue'
  | 'parenthetical'
  | 'list-item'
  | 'action'

export interface ScreenplayLine {
  kind: ScreenplayLineKind
  text: string
  speaker?: string
  dialogue?: string
}

const SECTION_HEADING_PATTERN = /^(?:【)?(?:人物表|角色表|人物关系|人物小传|场景表|场景列表|故事梗概|剧情梗概|梗概|主题|标准剧本|主要人物)(?:】)?\s*[:：]?$/u
const SCENE_HEADING_PATTERN = /^(?:(?:第\s*(?:\d+|[一二三四五六七八九十百]+)\s*场)|(?:场景|场次)\s*(?:\d+|[一二三四五六七八九十百]+)?|(?:INT|EXT|INT\/EXT)\b|(?:内景|外景)\b|\d+\s*[.、)）])/iu
const PARENTHETICAL_PATTERN = /^(?:（[^）]*）|\([^)]*\)|【[^】]*】)$/u
const LIST_ITEM_PATTERN = /^(?:[-*•·]|\d+[.)、])\s+/u
const SPEAKER_DIALOGUE_PATTERN = /^([^\s：:]{1,30})\s*[：:]\s*(.*)$/u
const ROLE_WITH_PARENTHETICAL_PATTERN = /^([^\s：:（）()【】]{1,30})\s*[（(【]([^）)】]+)[）)】]$/u
const QUOTED_DIALOGUE_PATTERN = /^(?:[“「『].+[”」』]|["'].+["'])$/u
const NON_DIALOGUE_PREFIX_PATTERN = /^(?:片名|标题|title|时间|地点|场景|动作|表演提示|备注|镜头|时长|内外景|人物|角色|主题|简介)\s*[:：]/iu
const ROLE_CUE_PATTERN = /^(?:[\u4e00-\u9fff]{2,8}|[A-Z][A-Z0-9 _-]{1,24})$/u
const ACTION_START_PATTERN = /^(?:他|她|它|镜头|画面|门|窗|夜|雨|天|室内|室外|此时|随后|背景|一个|一阵|整个|众人|两人)/u

/**
 * Parse common screenplay conventions without interpreting the text as HTML.
 * The parser is intentionally conservative: anything it cannot identify
 * remains ordinary action text instead of being discarded or executed.
 */
export function parseScreenplay(text: string): ScreenplayLine[] {
  const sourceLines = text.replace(/\r\n?/g, '\n').split('\n')
  const firstContentIndex = sourceLines.findIndex(line => line.trim().length > 0)
  const result: ScreenplayLine[] = []
  let allowDialogueContinuation = false

  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index] ?? ''
    const line = normalizeMarkup(rawLine)
    if (line.length === 0) {
      allowDialogueContinuation = false
      result.push({ kind: 'blank', text: '' })
      continue
    }

    const nextLine = nextContentLine(sourceLines, index)
    if (isTitle(line, index, firstContentIndex)) {
      allowDialogueContinuation = false
      result.push({ kind: 'title', text: line })
      continue
    }
    if (SCENE_HEADING_PATTERN.test(line)) {
      allowDialogueContinuation = false
      result.push({ kind: 'scene-heading', text: line })
      continue
    }
    if (SECTION_HEADING_PATTERN.test(line)) {
      allowDialogueContinuation = false
      result.push({ kind: 'section-heading', text: line })
      continue
    }

    const roleWithParenthetical = line.match(ROLE_WITH_PARENTHETICAL_PATTERN)
    if (roleWithParenthetical !== null) {
      const speaker = roleWithParenthetical[1] ?? ''
      const cue = roleWithParenthetical[2] ?? ''
      allowDialogueContinuation = true
      result.push({ kind: 'parenthetical', text: line, speaker, dialogue: `（${cue}）` })
      continue
    }

    if (PARENTHETICAL_PATTERN.test(line)) {
      allowDialogueContinuation = true
      result.push({ kind: 'parenthetical', text: line, dialogue: line })
      continue
    }

    const dialogueMatch = line.match(SPEAKER_DIALOGUE_PATTERN)
    if (dialogueMatch !== null && !SCENE_HEADING_PATTERN.test(line)) {
      const speaker = dialogueMatch[1] ?? ''
      const dialogue = dialogueMatch[2] ?? ''
      if (NON_DIALOGUE_PREFIX_PATTERN.test(line)) {
        allowDialogueContinuation = false
        result.push({ kind: 'action', text: line })
      } else if (isParenthetical(dialogue)) {
        allowDialogueContinuation = true
        result.push({ kind: 'parenthetical', text: line, speaker, dialogue })
      } else {
        allowDialogueContinuation = false
        result.push({ kind: 'dialogue', text: line, speaker, dialogue })
      }
      continue
    }

    if (allowDialogueContinuation) {
      allowDialogueContinuation = false
      result.push({ kind: 'dialogue', text: line, dialogue: line })
      continue
    }

    if (isRoleCue(line, nextLine)) {
      allowDialogueContinuation = true
      result.push({ kind: 'dialogue', text: line, speaker: line, dialogue: '' })
      continue
    }
    if (LIST_ITEM_PATTERN.test(line)) {
      result.push({ kind: 'list-item', text: line })
      continue
    }
    if (QUOTED_DIALOGUE_PATTERN.test(line)) {
      result.push({ kind: 'dialogue', text: line, dialogue: line })
      continue
    }
    result.push({ kind: 'action', text: line })
  }

  return result
}

function normalizeMarkup(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s+/u, '')
    .replace(/^>\s?/u, '')
    .replace(/\*\*(.*?)\*\*/gu, '$1')
    .replace(/__(.*?)__/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .trim()
}

function nextContentLine(lines: string[], index: number): string | undefined {
  const next = normalizeMarkup(lines[index + 1] ?? '')
  return next.length > 0 ? next : undefined
}

function isTitle(line: string, index: number, firstContentIndex: number): boolean {
  if (index !== firstContentIndex) return false
  if (/^(?:片名|标题|title)\s*[:：]/iu.test(line)) return true
  return !SCENE_HEADING_PATTERN.test(line)
    && !SECTION_HEADING_PATTERN.test(line)
    && !SPEAKER_DIALOGUE_PATTERN.test(line)
    && !LIST_ITEM_PATTERN.test(line)
}

function isParenthetical(value: string): boolean {
  return PARENTHETICAL_PATTERN.test(value.trim())
}

function isRoleCue(line: string, nextLine: string | undefined): boolean {
  if (nextLine === undefined || !ROLE_CUE_PATTERN.test(line) || ACTION_START_PATTERN.test(line)) return false
  return isParenthetical(nextLine) || QUOTED_DIALOGUE_PATTERN.test(nextLine) || nextLine.length <= 80
}
