import { useEffect, useRef, useState } from 'react'
import type { AssetItem } from '@bailian-studio/api-client'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { referenceMarker } from '@/lib/reference-format'
import { cn } from '@/lib/utils'

/**
 * 参考图富文本提示词编辑器（contenteditable）。
 *
 * 参考池（refs）来自上方「输入参考素材」媒体字段，是**稳定列表**（外部唯一事实源，
 * 编辑器只引用、不增删）。文本以 `@图N` 中性标记承载引用（N 为 1-based 序号，见
 * lib/reference-format），DOM 内标记渲染为**行内缩略图 chip**（contentEditable=false）。
 * 按 `@` 弹出已选参考图下拉，点一张在光标处插入 `@图N`。
 *
 * 核心约定：
 * - 编辑期间以 DOM 为唯一事实源，`onInput` 时序列化回文本（不做重排编号）；
 * - 外部变化（回显、重新还原）由 `value`/`refs` 变化触发整块重渲染；
 * - 纯文本输入不触碰标记时不会重渲染，光标得以保留；
 * - 插入标记后立即 `renderInto` 转成 chip，避免停留在纯文本形态。
 */

interface RichPromptEditorProps {
  value: string
  refs: readonly AssetItem[]
  onChange: (text: string) => void
  disabled?: boolean
}

const MARKER_RE = /@图(\d+)/g

export function RichPromptEditor({ value, refs, onChange, disabled }: RichPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // 外部 value/refs 变化时同步 DOM（用户输入产生的变化 text 已一致而跳过，保留光标）。
  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    if (serializeText(editor) !== value) {
      renderInto(editor, value, refs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, refs])

  // 下拉打开时：点击外部 / Esc / 滚动关闭。
  useEffect(() => {
    if (!pickerOpen) return
    const close = () => setPickerOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
    }
  }, [pickerOpen])

  const handleInput = () => {
    const editor = editorRef.current
    if (editor === null) return
    const text = serializeText(editor)
    if (text !== value) onChange(text)
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

  const handlePick = (asset: AssetItem) => {
    const editor = editorRef.current
    setPickerOpen(false)
    if (editor === null) return
    const index = refs.findIndex(ref => ref.id === asset.id) + 1
    if (index <= 0) return

    editor.focus()
    // 恢复光标并在原位置插入 @图N 标记；无保存范围则追加到末尾。
    if (savedRangeRef.current !== null) {
      const selection = window.getSelection()
      if (selection !== null) {
        selection.removeAllRanges()
        selection.addRange(savedRangeRef.current)
      }
    } else {
      savedRangeRef.current = null
    }
    insertTextAtCaret(editor, referenceMarker(index))
    savedRangeRef.current = null

    // 立即把文本标记渲染为 chip（reconcile 守卫会因 text 已一致而跳过重渲染）。
    const text = serializeText(editor)
    renderInto(editor, text, refs)
    onChange(text)
  }

  return (
    <div className="relative space-y-2">
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
      {pickerOpen && (
        <div
          onMouseDown={event => event.stopPropagation()}
          className="absolute z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">选择要引用的参考图</p>
          {refs.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">暂无参考图，请先在上方「输入参考素材」添加</p>
          ) : (
            refs.map((asset, index) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => handlePick(asset)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="size-6 shrink-0 overflow-hidden rounded">
                  <AssetThumbnail kind={asset.kind} url={asset.url} thumbnailUrl={asset.thumbnailUrl} />
                </span>
                <span>图{index + 1}</span>
              </button>
            ))
          )}
        </div>
      )}
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
    chip.className =
      'mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-1.5 pl-0.5 text-xs align-middle'

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
 * 序列化 contenteditable 为纯文本：按 DOM 顺序拼接文本节点与 chip 的标记文本
 * （`@图N` 保持原序号，不重排；refs 由外部参考池维护，编辑器不重建）。
 */
function serializeText(editor: HTMLDivElement): string {
  let text = ''
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node instanceof HTMLElement && node.dataset.marker !== undefined) {
      text += node.dataset.marker
    }
  }
  return text
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
