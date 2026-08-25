import { useState } from 'react'
import { Bookmark, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  loadCreationPresets,
  removeCreationPreset,
  saveCreationPreset,
  type CreationPreset,
} from '@/lib/creation-presets'
import { useNotificationsStore } from '@/stores/notifications-store'
import { cn } from '@/lib/utils'

/** 创作预设：命名保存当前参数 + 快速应用。localStorage 版本化。 */
export function CreationPresetPanel({
  modelId,
  params,
  onApply,
  disabled,
  allowedModelIds,
}: {
  modelId: string | undefined
  params: Record<string, unknown>
  onApply: (preset: CreationPreset) => void
  disabled?: boolean
  allowedModelIds?: readonly string[]
}) {
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [name, setName] = useState('')
  const [presets, setPresets] = useState<CreationPreset[]>(() => loadCreationPresets())

  const handleSave = () => {
    if (modelId === undefined || name.trim() === '') return
    const preset: CreationPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      modelId,
      params,
      createdAt: new Date().toISOString(),
    }
    setPresets(saveCreationPreset(preset))
    setName('')
    showMessage({ title: '已保存预设', tone: 'success' })
  }

  const handleRemove = (id: string) => {
    setPresets(removeCreationPreset(id))
  }

  const visiblePresets = allowedModelIds === undefined
    ? presets
    : presets.filter(preset => allowedModelIds.includes(preset.modelId))

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="为当前参数命名并保存…"
          value={name}
          disabled={disabled || modelId === undefined}
          onChange={event => setName(event.target.value)}
        />
        <Button variant="outline" size="sm" onClick={handleSave} disabled={disabled || name.trim() === '' || modelId === undefined}>
          <Bookmark data-icon />
          保存
        </Button>
      </div>
      {visiblePresets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visiblePresets.map(preset => (
            <span
              key={preset.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs',
              )}
            >
              <button type="button" onClick={() => onApply(preset)} className="hover:text-foreground">
                {preset.name}
              </button>
              <button
                type="button"
                aria-label={`删除预设 ${preset.name}`}
                onClick={() => handleRemove(preset.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
