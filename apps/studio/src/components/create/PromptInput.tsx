import type { AssetItem } from '@bailian-studio/api-client'
import { Textarea } from '@bailian-studio/ui'
import { RichPromptEditor } from '@/components/create/RichPromptEditor'
import { cn } from '@/lib/utils'

/**
 * 提示词输入。
 *
 * 模型支持参考图（referenceFormat 存在）时使用 RichPromptEditor：文本内以 `@图N`
 * 标记引用素材（refs 为上方「输入参考素材」的参考池，按 @ 弹出下拉选择并渲染为
 * 行内缩略图）；否则为普通 textarea（无引用能力）。
 */

export interface PromptInputProps {
  value: string
  refs: readonly AssetItem[]
  onChange: (text: string) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  className?: string
  /** 模型是否支持参考图（决定是否启用 @ 引用 + 行内缩略图）。 */
  supportsReferences?: boolean
}

export function PromptInput({
  value,
  refs,
  onChange,
  placeholder,
  maxLength,
  disabled,
  className,
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
        className={cn('min-h-28', className)}
      />
    )
  }

  return (
    <RichPromptEditor
      value={value}
      refs={refs}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  )
}
