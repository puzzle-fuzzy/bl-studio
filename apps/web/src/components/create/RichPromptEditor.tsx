import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { referenceMarker } from '@/lib/reference-format'
import { cn } from '@/lib/utils'

/**
 * 多参考图富文本提示词编辑器（contenteditable）。
 *
 * 文本以 `@图N` 中性标记承载引用（N 为 1-based 序号，见 lib/reference-format）；
 * DOM 内标记渲染为**行内缩略图 chip**（contentEditable=false）。核心约定：
 * - 编辑期间以 DOM 为唯一事实源，`onInput` 时序列化回文本并重新编号/重建 refs；
 * - 外部变化（@ 选择、重新还原）由 `value`/`refs` 变化触发整块重渲染；
 * - 纯文本输入不触碰标记时不会重渲染，光标得以保留。
 *
 * 由于 DOM 每次序列化都会把标记重排为连续 `@图N`，文本与 refs 数组始终一致。
 */

interface RichPromptEditorProps {
  value: string
  refs: readonly AssetItem[]
  onChange: (text: string) => void
  onRefsChange: (refs: AssetItem[]) => void
  disabled?: boolean
}

const MARKER_RE = /@图(\d+)/g

export function RichPromptEditor({ value, refs, onChange, onRefsChange, disabled }: RichPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // 外部 value/refs 变化时同步 DOM（用户输入产生的变化因 text 已一致而跳过，保留光标）。
  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    if (reconcile(editor, refs).text !== value) {
      renderInto(editor, value, refs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, refs])

  const handleInput = () => {
    const editor = editorRef.current
    if (editor === null) return
    const { text, refs: nextRefs } = reconcile(editor, refs)
    if (text !== value || !sameRefs(nextRefs, refs)) {
      onChange(text)
      onRefsChange(nextRefs)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== '@' || disabled) return
    event.preventDefault()
    const selection = window.getSelection()
    if (selection !== null && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }
    setPickerOpen(true)
  }

  const handleAppend = () => {
    savedRangeRef.current = null // 无光标位置 → 追加到末尾
    setPickerOpen(true)
  }

  const handlePickerSelect = (assets: AssetItem[]) => {
    const editor = editorRef.current
    setPickerOpen(false)
    if (editor === null || assets.length === 0) return

    const added = assets.filter(asset => !refs.some(ref => ref.id === asset.id))
    if (added.length === 0) return
    const nextRefs = [...refs, ...added]

    // 恢复光标并在原位置插入 @图N 标记；无保存范围则追加到末尾。
    editor.focus()
    if (savedRangeRef.current !== null) {
      const selection = window.getSelection()
      if (selection !== null) {
        selection.removeAllRanges()
        selection.addRange(savedRangeRef.current)
      }
    } else {
      savedRangeRef.current = null
    }
    for (const asset of added) {
      const index = nextRefs.findIndex(ref => ref.id === asset.id) + 1
      insertTextAtCaret(editor, referenceMarker(index))
    }
    savedRangeRef.current = null

    // 序列化并按 DOM 顺序重排编号/refs 后上报。
    const { text, refs: reconciledRefs } = reconcile(editor, nextRefs)
    onChange(text)
    onRefsChange(reconciledRefs)
  }

  return (
    <div className="space-y-2">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="描述你想要生成的内容…（输入 @ 可引用图片）"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={cn(
          'min-h-28 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      />
      <Button variant="outline" size="sm" type="button" onClick={handleAppend} disabled={disabled}>
        <ImagePlus data-icon />
        添加参考素材
      </Button>
      <AssetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} multiple onSelect={handlePickerSelect} />
    </div>
  )
}

/** 把 value+refs 渲染进 contenteditable：文本节点 + 缩略图 chip。 */
function renderInto(editor: HTMLDivElement, value: string, refs: readonly AssetItem[]): void {
  editor.textContent = ''
  for (const segment of splitTextAndMarkers(value)) {
    if (typeof segment === 'string') {
      editor.appendChild(document.createTextNode(segment))
      continue
    }
    const ref = refs[segment - 1]
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.marker = referenceMarker(segment)
    chip.dataset.assetId = ref?.id ?? ''
    chip.className = 'mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-1.5 pl-0.5 text-xs align-middle'

    const thumb = document.createElement('span')
    thumb.className = 'size-5 shrink-0 overflow-hidden rounded'
    const source = ref?.thumbnailUrl ?? ref?.url
    if (source !== undefined) {
      const img = document.createElement('img')
      img.src = source
      img.alt = ''
      img.className = 'size-full object-cover'
      thumb.appendChild(img)
    } else {
      thumb.className = cn(thumb.className, 'bg-muted-foreground/20')
    }
    const label = document.createElement('span')
    label.textContent = `图${segment}`
    chip.appendChild(thumb)
    chip.appendChild(label)
    editor.appendChild(chip)
  }
}

/**
 * 序列化 contenteditable：按 DOM 顺序收集文本段与标记序号，
 * 把标记重排为连续 `@图1..N`，refs 按标记出现的顺序重建。
 */
function reconcile(editor: HTMLDivElement, baseRefs: readonly AssetItem[]): { text: string; refs: AssetItem[] } {
  const segments: Array<string | number> = []
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text.length > 0) segments.push(...splitTextAndMarkers(text))
    } else if (node instanceof HTMLElement && node.dataset.marker !== undefined) {
      const match = node.dataset.marker.match(MARKER_RE)
      if (match !== null) segments.push(Number(match[1]))
    }
  }

  let text = ''
  const refs: AssetItem[] = []
  let count = 0
  for (const segment of segments) {
    if (typeof segment === 'string') {
      text += segment
      continue
    }
    const ref = baseRefs[segment - 1]
    if (ref === undefined) continue // 悬空标记：跳过（对应删除的 chip）
    count += 1
    refs.push(ref)
    text += referenceMarker(count)
  }
  return { text, refs }
}

/** 把文本按 `@图N` 标记切分为字符串与序号交替的片段。 */
function splitTextAndMarkers(text: string): Array<string | number> {
  const parts: Array<string | number> = []
  let last = 0
  for (const match of text.matchAll(MARKER_RE)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    parts.push(Number(match[1]))
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function insertTextAtCaret(editor: HTMLDivElement, text: string): void {
  const selection = window.getSelection()
  if (selection !== null && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    document.execCommand('insertText', false, text)
    return
  }
  editor.appendChild(document.createTextNode(text))
}

function sameRefs(a: readonly AssetItem[], b: readonly AssetItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((ref, index) => ref.id === b[index]?.id)
}
