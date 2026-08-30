import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'

/**
 * 媒体参数输入：打开资产选择器，选择后以 assetId 列表回写表单值。
 * 表单值类型为 `AssetItem[]`，提交时由 CreatePage 提取为 assetRefs。
 */
export function MediaParameterInput({
  kind,
  value,
  onChange,
  multiple = true,
}: {
  kind?: 'image' | 'video' | 'audio' | 'text'
  value: AssetItem[] | undefined
  onChange: (value: AssetItem[]) => void
  multiple?: boolean
}) {
  const [open, setOpen] = useState(false)
  const items = value ?? []

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map(asset => (
          <div key={asset.id} className="group relative size-16 overflow-hidden rounded-md border">
            <AssetThumbnail kind={asset.kind} url={asset.url} thumbnailUrl={asset.thumbnailUrl} />
            <button
              type="button"
              aria-label="移除素材"
              onClick={() => onChange(items.filter(item => item.id !== asset.id))}
              className="absolute top-0.5 right-0.5 hidden size-4 items-center justify-center rounded-full bg-background/90 text-foreground group-hover:flex"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="选择素材">
          <ImagePlus className="size-4" />
        </Button>
      </div>
      <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        mediaKind={kind}
        multiple={multiple}
        onSelect={assets => onChange(multiple ? assets : assets.slice(-1))}
      />
    </div>
  )
}
