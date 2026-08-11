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

const SECTION_HEADING_PATTERN = /^[【[]?(?:人物表|角色表|人物关系|场景表|场景列表|故事梗概|剧情梗概|梗概|主题|标准剧本|主要人物)[】]]?\s*[:：]?$/i
const SCENE_HEADING_PATTERN = /^(?:(?:第\s*)?\d+\s*[.、)）]\s*|场景\s*\d+\s*|(?:INT|EXT|INT\/EXT|内景|外景)\b|【?场景\s*)/i
const PARENTHETICAL_PATTERN = /^(?:（[^）]*）|\([^)]*\)|【[^】]*】)$/
const LIST_ITEM_PATTERN = /^(?:[-*•·]|\d+[.)、])\s+/u
const SPEAKER_DIALOGUE_PATTERN = /^([^\s：:]{1,30})\s*[：:]\s*(.*)$/u
const QUOTED_DIALOGUE_PATTERN = /^(?:[“「『].+[”」』]|["'].+["'])$/u

/**
 * Parse the lightweight screenplay convention produced by the director chat:
 * scene headings, character dialogue, parentheticals, lists and action text.
 * Unknown lines intentionally remain action text so formatting never destroys
 * user content.
 */
export function parseScreenplay(text: string): ScreenplayLine[] {
  const sourceLines = text.replace(/\r\n?/g, '\n').split('\n')
  const firstContentIndex = sourceLines.findIndex(line => line.trim().length > 0)
  const result: ScreenplayLine[] = []
  let allowDialogueContinuation = false

  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index] ?? ''
    const line = rawLine.trim()
    if (line.length === 0) {
      allowDialogueContinuation = false
      result.push({ kind: 'blank', text: '' })
      continue
    }

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
    if (PARENTHETICAL_PATTERN.test(line)) {
      result.push({ kind: 'parenthetical', text: line })
      continue
    }

    const dialogueMatch = line.match(SPEAKER_DIALOGUE_PATTERN)
    if (dialogueMatch !== null && !SCENE_HEADING_PATTERN.test(line)) {
      const dialogue = dialogueMatch[2] ?? ''
      allowDialogueContinuation = isParenthetical(dialogue)
      result.push({
        kind: 'dialogue',
        text: line,
        speaker: dialogueMatch[1] ?? '',
        dialogue,
      })
      continue
    }

    if (allowDialogueContinuation) {
      allowDialogueContinuation = false
      result.push({ kind: 'dialogue', text: line, dialogue: line })
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

function isTitle(line: string, index: number, firstContentIndex: number): boolean {
  if (index !== firstContentIndex) return false
  if (/^(?:片名|标题|title)\s*[:：]/i.test(line)) return true
  return !SCENE_HEADING_PATTERN.test(line) && !SECTION_HEADING_PATTERN.test(line) && !SPEAKER_DIALOGUE_PATTERN.test(line)
}

function isParenthetical(value: string): boolean {
  return PARENTHETICAL_PATTERN.test(value.trim())
}
