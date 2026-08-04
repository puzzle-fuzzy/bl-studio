import type { AssetItem } from '@bailian-studio/api-client'
import { Textarea } from '@/components/ui/textarea'
import { RichPromptEditor } from '@/components/create/RichPromptEditor'

/**
 * 提示词输入。
 *
 * 模型支持参考图（referenceFormat 存在）时使用 RichPromptEditor：文本内以 `@图N`
 * 标记引用素材并渲染为行内缩略图；否则为普通 textarea（无引用能力）。
 */

export interface PromptInputProps {
  value: string
  refs: AssetItem[]
  onChange: (text: string) => void
  onRefsChange: (refs: AssetItem[]) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  /** 模型是否支持参考图（决定是否启用 @ 引用 + 行内缩略图）。 */
  supportsReferences?: boolean
}

export function PromptInput({
  value,
  refs,
  onChange,
  onRefsChange,
  placeholder,
  maxLength,
  disabled,
  supportsReferences = false,
}: PromptInputProps) {
  if (!supportsReferences) {
    return (
      <Textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder ?? '描述你想要生成的内容…'}
        maxLength={maxLength}
        disabled={disabled}
        className="min-h-28"
      />
    )
  }

  return (
    <RichPromptEditor
      value={value}
      refs={refs}
      onChange={onChange}
      onRefsChange={onRefsChange}
      disabled={disabled}
    />
  )
}
