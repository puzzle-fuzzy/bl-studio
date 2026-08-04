import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { referenceMarker } from '@/lib/reference-format'

/**
 * 多参考图提示词编辑器。
 *
 * 文本内使用中性标记 `@图N`（N 为 1-based 序号），提交时按模型 referenceFormat
 * 转成 provider 语法（见 lib/reference-format）。移除一个引用会同步移除文本
 * 标记并把后续序号前移，保证文本与 refs 数组始终一致。
 */

export interface PromptInputProps {
  value: string
  refs: AssetItem[]
  onChange: (text: string) => void
  onRefsChange: (refs: AssetItem[]) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
}

export function PromptInput({
  value,
  refs,
  onChange,
  onRefsChange,
  placeholder,
  maxLength,
  disabled,
}: PromptInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleAddRefs = (assets: AssetItem[]) => {
    const nextRefs = [...refs]
    let nextText = value
    for (const asset of assets) {
      if (nextRefs.some(ref => ref.id === asset.id)) continue
      nextRefs.push(asset)
      nextText = `${nextText}${nextText.endsWith(' ') || nextText === '' ? '' : ' '}${referenceMarker(nextRefs.length)}`
    }
    onRefsChange(nextRefs)
    onChange(nextText)
  }

  const handleRemoveRef = (index: number) => {
    // 移除 @图{index+1} 标记，并把后续序号前移
    const marker = referenceMarker(index + 1)
    let nextText = value.replace(new RegExp(`\\s?${escapeMarker(marker)}`), '')
    for (let i = index + 1; i < refs.length; i += 1) {
      nextText = nextText.replaceAll(referenceMarker(i + 1), referenceMarker(i))
    }
    onChange(nextText)
    onRefsChange(refs.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((ref, index) => (
            <span key={ref.id} className="group inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pr-1 pl-1.5 text-xs">
              <span className="size-6 overflow-hidden rounded">
                <AssetThumbnail kind={ref.kind} url={ref.url} thumbnailUrl={ref.thumbnailUrl} />
              </span>
              图{index + 1}
              <button
                type="button"
                aria-label={`移除参考图 ${index + 1}`}
                onClick={() => handleRemoveRef(index)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder ?? '描述你想要生成的内容…'}
        maxLength={maxLength}
        disabled={disabled}
        className="min-h-28"
      />
      <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={disabled}>
        <ImagePlus data-icon />
        添加参考素材
      </Button>
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple
        onSelect={handleAddRefs}
      />
    </div>
  )
}

function escapeMarker(marker: string): string {
  return marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
