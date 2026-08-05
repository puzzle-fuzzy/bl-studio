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
 * 按 `@` 在**光标处**弹出已选参考图下拉（面板锚点 = 光标所在行，左边缘钳制在编辑区内，
 * 对齐 lobehub mention 菜单做法），键盘 ArrowUp/Down + Enter 选择，WAI-ARIA combobox
 * 模式。点选后在光标处**直接插入 chip 节点**（不整块重建），光标保持在 chip 之后。
 *
 * 核心约定：
 * - 编辑期间以 DOM 为唯一事实源，`onInput` 时序列化回文本（不做重排编号）；
 * - 外部变化（回显、重新还原）由 `value`/`refs` 变化触发整块重渲染；
 * - 插入 chip 用 Range API 原位插入 + 手动复位 caret，纯文本输入不触碰 DOM 时
 *   光标得以保留（undo/删除/粘贴都交给浏览器原生行为）。
 */

interface RichPromptEditorProps {
  value: string
  refs: readonly AssetItem[]
  onChange: (text: string) => void
  disabled?: boolean
}

const MARKER_RE = /@图(\d+)/g
const PICKER_ID = 'prompt-ref-picker'

export function RichPromptEditor({ value, refs, onChange, disabled }: RichPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // 外部 value/refs 变化时同步 DOM（用户输入产生的变化 text 已一致而跳过，保留光标）。
  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    if (serializeText(editor) !== value) {
      renderInto(editor, value, refs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, refs])

  // 下拉打开时：点击外部 / Esc / 页面滚动关闭（下拉自身滚动不关闭，允许滚长列表）。
  useEffect(() => {
    if (!pickerOpen) return
    const close = () => setPickerOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || pickerRef.current?.contains(event.target) !== true) {
        close()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [pickerOpen])

  const handleInput = () => {
    const editor = editorRef.current
    if (editor === null) return
    const text = serializeText(editor)
    if (text !== value) onChange(text)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    // @ 触发下拉：记下当前光标并算出面板锚点（贴光标），弹出前不输入字符。
    if (event.key === '@') {
      event.preventDefault()
      const selection = window.getSelection()
      const editor = editorRef.current
      if (selection !== null && selection.rangeCount > 0 && editor !== null) {
        const range = selection.getRangeAt(0)
        savedRangeRef.current = range.cloneRange()
        setPickerAnchor(anchorForRange(range, editor))
      } else {
        savedRangeRef.current = null
        setPickerAnchor(null)
      }
      setActiveIndex(0)
      setPickerOpen(true)
      return
    }
    if (!pickerOpen || refs.length === 0) return
    // 下拉打开时键盘导航（combobox 模式）：方向键移动高亮，Enter 选中。
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(current => (current + delta + refs.length) % refs.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const asset = refs[activeIndex]
      if (asset !== undefined) handlePick(asset)
    }
  }

  const handlePick = (asset: AssetItem) => {
    const editor = editorRef.current
    setPickerOpen(false)
    if (editor === null) return
    const index = refs.findIndex(ref => ref.id === asset.id) + 1
    if (index <= 0) return

    editor.focus()
    const saved = savedRangeRef.current
    savedRangeRef.current = null

    // 直接 DOM 插入 chip（不 execCommand、不整块重建），光标由下面手动复位到 chip 后。
    const chip = createChip(asset, index)
    const caretPoint = saved !== null && editor.contains(saved.startContainer) ? saved : null
    const selection = window.getSelection()
    if (caretPoint !== null) {
      caretPoint.deleteContents()
      caretPoint.insertNode(chip)
    } else {
      editor.appendChild(chip)
    }

    const caret = document.createRange()
    caret.setStartAfter(chip)
    caret.collapse(true)
    if (selection !== null) {
      selection.removeAllRanges()
      selection.addRange(caret)
    }

    const text = serializeText(editor)
    if (text !== value) onChange(text)
  }

  const activeDescendant =
    pickerOpen && refs[activeIndex] !== undefined ? `prompt-ref-option-${activeIndex}` : undefined

  return (
    <div className="relative space-y-2">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="combobox"
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        aria-controls={pickerOpen ? PICKER_ID : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-label="提示词"
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
          ref={pickerRef}
          id={PICKER_ID}
          role="listbox"
          onMouseDown={event => event.stopPropagation()}
          style={pickerAnchor !== null ? { top: pickerAnchor.top, left: pickerAnchor.left } : undefined}
          className={cn(
            'absolute z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md',
            pickerAnchor === null && 'top-full left-0',
          )}
        >
          <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">选择要引用的参考图</p>
          {refs.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">暂无参考图，请先在上方「输入参考素材」添加</p>
          ) : (
            refs.map((asset, index) => (
              <button
                key={asset.id}
                type="button"
                role="option"
                id={`prompt-ref-option-${index}`}
                aria-selected={index === activeIndex}
                onClick={() => handlePick(asset)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
                  index === activeIndex && 'bg-accent',
                )}
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

/**
 * 计算 @ 面板锚点：光标（Range）在编辑器内的相对坐标，使下拉贴住光标而不是固定在输入框底部。
 * 光标矩形全 0（无法定位）时返回 null，退回输入框下方。左边缘做钳制，避免面板超出编辑区右侧。
 */
function anchorForRange(range: Range, editor: HTMLDivElement): { top: number; left: number } | null {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return null
  const editorRect = editor.getBoundingClientRect()
  const pickerWidth = 288 // w-72
  const gap = 4
  const maxLeft = Math.max(editorRect.width - pickerWidth - gap, gap)
  const left = Math.min(Math.max(rect.left - editorRect.left, gap), maxLeft)
  const top = rect.bottom - editorRect.top + gap
  return { top, left }
}

/** 把 value+refs 渲染进 contenteditable：文本节点 + 缩略图 chip。 */
function renderInto(editor: HTMLDivElement, value: string, refs: readonly AssetItem[]): void {
  editor.textContent = ''
  for (const segment of splitTextAndMarkers(value)) {
    if (typeof segment === 'string') {
      editor.appendChild(document.createTextNode(segment))
      continue
    }
    editor.appendChild(createChip(refs[segment - 1], segment))
  }
}

/** 构建单个引用 chip 节点（行内缩略图 + 图N 标签，contentEditable=false）。 */
function createChip(ref: AssetItem | undefined, index: number): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.marker = referenceMarker(index)
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
  label.textContent = `图${index}`
  chip.appendChild(thumb)
  chip.appendChild(label)
  return chip
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
