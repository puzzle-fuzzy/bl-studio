import { useEffect, useState } from 'react'
import { Check, Image as ImageIcon, Link2, Loader2, Upload, X } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { assetQueryKey, useAssetsStore, type AssetQuery } from '@/stores/assets-store'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { kindLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

/**
 * 资产选择器（三 Tab：资产库 / 本地上传 / 粘贴链接）。
 * 支持单选/多选；多选时按点击顺序编号。供媒体参数与参考图提示词复用。
 */
export function AssetPickerDialog({
  open,
  onOpenChange,
  mediaKind,
  multiple = false,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaKind?: 'image' | 'video' | 'audio' | 'text'
  multiple?: boolean
  onSelect: (assets: AssetItem[]) => void
}) {
  const query: AssetQuery = { kind: mediaKind }
  const queryKey = assetQueryKey(query)
  const load = useAssetsStore(state => state.load)
  const loadMore = useAssetsStore(state => state.loadMore)
  const assetsState = useAssetsStore(state => state.queries[queryKey])

  const [selected, setSelected] = useState<AssetItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected([])
      void load(query)
    }
  }, [open, load, query.kind])

  const toggleAsset = (asset: AssetItem) => {
    setSelected(current => {
      if (current.some(item => item.id === asset.id)) {
        return current.filter(item => item.id !== asset.id)
      }
      if (!multiple) return [asset]
      return [...current, asset]
    })
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    try {
      const asset = await apiClient.uploadAsset({
        file,
        kind: mediaKind,
        onProgress: (loaded, total) => setUploadProgress(total > 0 ? loaded / total : 0),
      })
      setSelected(current => (multiple ? [...current, asset] : [asset]))
      void load(query, true)
    } catch (error) {
      setUploadError(userErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  const handleImport = async () => {
    const url = linkUrl.trim()
    if (url === '') return
    setLinkError(null)
    try {
      const asset = await apiClient.importAsset({ url, kind: mediaKind ?? 'image' })
      setSelected(current => (multiple ? [...current, asset] : [asset]))
      setLinkUrl('')
      void load(query, true)
    } catch (error) {
      setLinkError(userErrorMessage(error))
    }
  }

  const items = assetsState?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>选择素材</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="library">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library">资产库</TabsTrigger>
            <TabsTrigger value="upload">上传</TabsTrigger>
            <TabsTrigger value="link">粘贴链接</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-3">
            {/* 固定高度资产网格：空态与满载都保持同一占位区域，弹窗不跳动 */}
            <div className="grid h-72 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {items.length === 0 ? (
                <div className="col-span-full flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="size-8" />
                  <span>还没有资产，去「上传」或「粘贴链接」添加吧</span>
                </div>
              ) : (
                items.map(asset => {
                  const index = selected.findIndex(item => item.id === asset.id)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggleAsset(asset)}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-md border',
                        index >= 0 ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground/50',
                      )}
                      aria-pressed={index >= 0}
                    >
                      <AssetThumbnail kind={asset.kind} url={asset.url} thumbnailUrl={asset.thumbnailUrl} />
                      {index >= 0 && (
                        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                          {multiple ? index + 1 : <Check className="size-2.5" />}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
              {items.length > 0 && assetsState?.nextCursor !== undefined && (
                <Button variant="ghost" size="sm" className="col-span-full" onClick={() => void loadMore(query)}>
                  加载更多
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3">
            <Label htmlFor="asset-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
              {uploading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  上传中 {Math.round(uploadProgress * 100)}%
                </>
              ) : (
                <>
                  <Upload className="size-5" />
                  点击选择文件上传
                </>
              )}
            </Label>
            <input
              id="asset-file"
              type="file"
              className="hidden"
              accept={mediaKind === 'image' ? 'image/*' : mediaKind === 'video' ? 'video/*' : mediaKind === 'audio' ? 'audio/*' : undefined}
              disabled={uploading}
              onChange={event => {
                const file = event.target.files?.[0]
                if (file !== undefined) void handleUpload(file)
                event.target.value = ''
              }}
            />
            {uploadError !== null && <p className="text-sm text-destructive">{uploadError}</p>}
          </TabsContent>

          <TabsContent value="link" className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="粘贴图片/视频链接 (https://…)"
                value={linkUrl}
                onChange={event => setLinkUrl(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleImport()
                }}
              />
              <Button onClick={() => void handleImport()} disabled={linkUrl.trim() === ''}>
                <Link2 data-icon />
                导入
              </Button>
            </div>
            {linkError !== null && <p className="text-sm text-destructive">{linkError}</p>}
          </TabsContent>
        </Tabs>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map(asset => (
              <span key={asset.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                {kindLabel(asset.kind)}
                <button type="button" onClick={() => toggleAsset(asset)} aria-label="移除">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              onSelect(selected)
              onOpenChange(false)
            }}
            disabled={selected.length === 0}
          >
            确定（{selected.length}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
