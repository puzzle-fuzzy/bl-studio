import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { AssetItem } from '@bailian-studio/api-client'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { filterReferenceAssets, referenceMarker } from '@/lib/reference-format'
import { cn } from '@/lib/utils'

/**
 * 参考图富文本提示词编辑器（contenteditable）。
 *
 * 参考池（refs）来自上方「输入参考素材」媒体字段，是**稳定列表**（外部唯一事实源，
 * 编辑器只引用、不增删）。文本以 `@图N` 中性标记承载引用（N 为 1-based 序号，见
 * lib/reference-format），DOM 内标记渲染为**行内缩略图 chip**（contentEditable=false）。
 *
 * 引用交互对齐 Notion/飞书类 mention：
 * - 按 `@` 时输入框里**出现 `@` 字符**、光标停在 `@` 之后，并在光标处弹参考图下拉；
 * - `@` 与光标之间插入一个零宽锚点（query marker），继续输入即成为过滤词，面板
 *   跟随光标移动并实时过滤（匹配「图N」与文件名）；
 * - 键盘 ArrowUp/Down + Enter 选择，WAI-ARIA combobox 模式；
 * - 点选/回车后，把 `@` + 过滤词整体替换为缩略图 chip，光标停在 chip 之后。
 *
 * 核心约定：
 * - 编辑期间以 DOM 为唯一事实源，`onInput` 时序列化回文本（不做重排编号）；
 * - 外部变化（回显、重新还原）由 `value`/`refs` 变化触发整块重渲染；
 * - 插入 chip 用 Range API 原位插入 + 手动复位 caret，纯文本输入不触碰 DOM 时
 *   光标得以保留（undo/删除/粘贴都交给浏览器原生行为）；
 * - 面板以 viewport 坐标 + fixed 渲染在 body portal，锚点用光标行矩形
 *   （getClientRects），零矩形时退回 query marker / 编辑器兜底，避免被创作页
 *   xl 两栏独立滚动容器裁剪。
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
  // query 会话跟踪：`@` 文本节点 + 零宽锚点 span + 最近一次光标位置。
  const atTextNodeRef = useRef<Text | null>(null)
  const queryMarkerRef = useRef<HTMLSpanElement | null>(null)
  const caretRangeRef = useRef<Range | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ style: CSSProperties } | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const visibleRefs = useMemo(() => filterReferenceAssets(refs, query), [refs, query])

  // 外部 value/refs 变化时同步 DOM（用户输入产生的变化 text 已一致而跳过，保留光标）。
  // 若整块重建发生在 query 会话中，锚点与 `@` 节点一并失效，须关闭面板。
  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    if (serializeText(editor) !== value) {
      renderInto(editor, value, refs)
      if (atTextNodeRef.current !== null) closePicker()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, refs])

  // 下拉打开时：点击外部 / Esc / 页面滚动关闭（下拉自身滚动不关闭，允许滚长列表）。
  useEffect(() => {
    if (!pickerOpen) return
    const close = () => closePicker()
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

  /** 关闭面板并清理 query 会话。`@` 与已输入文字保留为普通文本（Notion 行为）。 */
  const closePicker = () => {
    queryMarkerRef.current?.remove()
    queryMarkerRef.current = null
    atTextNodeRef.current = null
    caretRangeRef.current = null
    setQuery('')
    setActiveIndex(0)
    setPickerOpen(false)
  }

  /** 开始一次引用输入：插入 `@` + 零宽锚点，光标停在锚点后，并在光标处弹面板。 */
  const startMention = () => {
    const editor = editorRef.current
    if (editor === null) return
    const sel = window.getSelection()
    const atNode = document.createTextNode('@')
    if (sel !== null && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)) {
      const range = sel.getRangeAt(0).cloneRange()
      range.deleteContents()
      range.insertNode(atNode)
    } else {
      editor.appendChild(atNode)
    }
    // 零宽锚点：`@` 与光标之间的标记，用于提取过滤文本与作为定位兜底。
    const marker = document.createElement('span')
    marker.dataset.mentionMarker = 'query-start'
    marker.style.display = 'inline-block'
    marker.style.width = '0'
    marker.style.overflow = 'hidden'
    atNode.after(marker)
    const caret = document.createRange()
    caret.setStartAfter(marker)
    caret.collapse(true)
    if (sel !== null) {
      sel.removeAllRanges()
      sel.addRange(caret)
    }
    atTextNodeRef.current = atNode
    queryMarkerRef.current = marker
    caretRangeRef.current = caret.cloneRange()
    setQuery('')
    setActiveIndex(0)
    setPickerAnchor(anchorForCaret(editor, marker))
    setPickerOpen(true)
    const text = serializeText(editor)
    if (text !== value) onChange(text)
  }

  const handleInput = () => {
    const editor = editorRef.current
    if (editor === null) return
    const text = serializeText(editor)
    if (text !== value) onChange(text)
    const sel = window.getSelection()
    if (sel !== null && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)) {
      caretRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
    // query 会话中：提取 `@` 后的过滤词、跟随光标重定位；`@` 被删或光标移走则收尾。
    const atNode = atTextNodeRef.current
    const caret = caretRangeRef.current
    if (atNode !== null) {
      if (editor.contains(atNode) && caret !== null && editor.contains(caret.startContainer)) {
        const mention = document.createRange()
        mention.setStartBefore(atNode)
        mention.setEnd(caret.endContainer, caret.endOffset)
        if (mention.toString().startsWith('@')) {
          setQuery(mention.toString().slice(1))
          setActiveIndex(0)
          setPickerAnchor(anchorForCaret(editor, queryMarkerRef.current))
        } else {
          closePicker()
        }
      } else {
        closePicker()
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    // @ 触发引用：先让 `@` 进入输入框，再在光标处弹面板（不阻止字符输入）。
    if (event.key === '@' && !pickerOpen) {
      event.preventDefault()
      startMention()
      return
    }
    if (!pickerOpen || visibleRefs.length === 0) return
    // 下拉打开时键盘导航（combobox 模式）：方向键移动高亮，Enter 选中。
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(current => (current + delta + visibleRefs.length) % visibleRefs.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const asset = visibleRefs[activeIndex]
      if (asset !== undefined) handlePick(asset)
    }
  }

  const handlePick = (asset: AssetItem) => {
    const editor = editorRef.current
    const atNode = atTextNodeRef.current
    const caretRange = caretRangeRef.current
    if (editor === null) {
      closePicker()
      return
    }
    const index = refs.findIndex(ref => ref.id === asset.id) + 1
    if (index <= 0) {
      closePicker()
      return
    }
    const chip = createChip(asset, index)
    let inserted = false
    // 正常路径：把 `@` + 锚点 + 过滤词整体替换为 chip。须在 closePicker 移除锚点
    // 之前完成——先移除锚点会让已存 caretRange 边界回移，导致区间塌缩删不掉 `@`。
    if (atNode !== null && editor.contains(atNode) && caretRange !== null && editor.contains(caretRange.startContainer)) {
      const mention = document.createRange()
      mention.setStartBefore(atNode)
      mention.setEnd(caretRange.endContainer, caretRange.endOffset)
      if (mention.toString().startsWith('@')) {
        mention.deleteContents()
        mention.insertNode(chip)
        inserted = true
      }
    }
    closePicker()
    if (!inserted) {
      // 兜底：贴当前光标插入，光标不在编辑器里则追加到末尾。
      const sel = window.getSelection()
      if (sel !== null && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)) {
        const caret = sel.getRangeAt(0).cloneRange()
        caret.deleteContents()
        caret.insertNode(chip)
      } else {
        editor.appendChild(chip)
      }
    }
    editor.focus()
    const caret = document.createRange()
    caret.setStartAfter(chip)
    caret.collapse(true)
    const sel = window.getSelection()
    if (sel !== null) {
      sel.removeAllRanges()
      sel.addRange(caret)
    }
    const text = serializeText(editor)
    if (text !== value) onChange(text)
  }

  const activeDescendant =
    pickerOpen && visibleRefs[activeIndex] !== undefined ? `prompt-ref-option-${activeIndex}` : undefined

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
      {pickerOpen &&
        createPortal(
          <div
            ref={pickerRef}
            id={PICKER_ID}
            role="listbox"
            onMouseDown={event => event.stopPropagation()}
            style={pickerAnchor?.style}
            className={cn(
              'fixed z-50 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md',
              pickerAnchor === null && 'hidden',
            )}
          >
          <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">选择要引用的参考图</p>
          {visibleRefs.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {refs.length === 0 ? '暂无参考图，请先在上方「输入参考素材」添加' : `没有匹配“${query}”的参考图`}
            </p>
          ) : (
            visibleRefs.map((asset, index) => (
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
                <span>图{refs.findIndex(ref => ref.id === asset.id) + 1}</span>
                {asset.fileName !== undefined && (
                  <span className="truncate text-xs text-muted-foreground">{asset.fileName}</span>
                )}
              </button>
            ))
          )}
          </div>,
          document.body,
        )}
    </div>
  )
}

/**
 * 计算 @ 面板锚点：以 viewport 坐标 + fixed 定位渲染在 body portal 中，避免被创作页
 * xl 两栏独立滚动容器裁剪。优先取光标行矩形（getClientRects，对空行/行尾比
 * getBoundingClientRect 可靠），全 0 矩形时退回 query marker，最后兜底编辑器矩形。
 * 左边缘钳制在视口内；上方空间不足时向上展开，防止面板底部超出视口。
 */
function anchorForCaret(
  editor: HTMLDivElement,
  fallbackMarker: HTMLSpanElement | null,
): { style: CSSProperties } {
  let rect: DOMRect | null = null
  const sel = window.getSelection()
  if (sel !== null && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    if (editor.contains(range.startContainer)) {
      const rects = range.getClientRects()
      if (rects.length > 0) {
        rect = rects[0] ?? null
      } else {
        const fallback = range.getBoundingClientRect()
        if (!isZeroRect(fallback)) rect = fallback
      }
    }
  }
  if (rect === null && fallbackMarker?.isConnected === true) {
    const markerRect = fallbackMarker.getBoundingClientRect()
    if (!isZeroRect(markerRect)) rect = markerRect
  }
  if (rect === null) rect = editor.getBoundingClientRect()
  return pickerStyle(rect)
}

function isZeroRect(rect: DOMRect): boolean {
  return rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0
}

function pickerStyle(anchorRect: DOMRect): { style: CSSProperties } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const pickerWidth = 288 // w-72
  const pickerMaxHeight = 224 // max-h-56
  const gap = 4
  const style: CSSProperties = {}
  // 水平：左边缘钳制在视口内（gap 留白），避免面板超出右侧。
  style.left = Math.min(Math.max(anchorRect.left, gap), Math.max(viewportWidth - pickerWidth - gap, gap))
  // 垂直：下方空间不足时向上展开（贴光标上方）。
  if (anchorRect.bottom + gap + pickerMaxHeight <= viewportHeight) {
    style.top = anchorRect.bottom + gap
  } else {
    style.bottom = viewportHeight - anchorRect.top + gap
  }
  return { style }
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
 * 块级子元素（回车换行产生的 <div> 等）递归收集文本，避免第二行以后被丢弃。
 * query 锚点是零宽 span 且无 data-marker，递归为空，不参与序列化。
 */
function serializeText(editor: HTMLElement): string {
  let text = ''
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.dataset.marker !== undefined) {
        text += node.dataset.marker
      } else if (node.contentEditable !== 'false') {
        text += serializeText(node)
      }
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
