import { useEffect, useRef, useState } from 'react'
import { Check, Image as ImageIcon, Link2, Loader2, Upload } from 'lucide-react'
import { ApiClientError, type AssetItem } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@bailian-studio/ui'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { useQueryClient } from '@tanstack/react-query'
import { useAssetList, type AssetQuery } from '@/hooks/use-assets'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'
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
  const assetsQuery = useAssetList(query, open)
  const queryClient = useQueryClient()
  const loadMore = () => {
    if (assetsQuery.hasNextPage && !assetsQuery.isFetchingNextPage) void assetsQuery.fetchNextPage()
  }
  const assetsState = {
    items: assetsQuery.data?.pages.flatMap(page => page.items) ?? [],
    nextCursor: assetsQuery.data?.pages.at(-1)?.nextCursor,
    isLoading: assetsQuery.isPending,
  }

  const [selected, setSelected] = useState<AssetItem[]>([])
  const [uploadedAssets, setUploadedAssets] = useState<AssetItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [linkUrl, setLinkUrl] = useState('')
  // R2-P1-06：持有本次上传的 AbortController，支持「取消上传」与关弹窗时中止 XHR。
  const uploadController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      setSelected([])
      setUploadedAssets([])
    }
  }, [open, query.kind])

  // 组件卸载时若有未完成上传一并中止（正常情况下弹窗关闭走 handleOpenChange）。
  useEffect(() => () => uploadController.current?.abort(), [])

  const abortUpload = () => {
    uploadController.current?.abort()
    uploadController.current = null
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) abortUpload()
    onOpenChange(next)
  }

  /** 判断上传是否被用户主动取消（取消不算失败，不展示错误）。 */
  const isAbortError = (error: unknown): boolean => {
    if (error instanceof ApiClientError) return error.code === 'REQUEST_ABORTED'
    return error instanceof Error && error.name === 'AbortError'
  }

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
    // 连续选文件：先中止上一次可能仍在飞的上传。
    uploadController.current?.abort()
    const controller = new AbortController()
    uploadController.current = controller
    setUploading(true)
    setUploadProgress(0)
    try {
      const asset = await apiClient.uploadAsset({
        file,
        kind: mediaKind,
        signal: controller.signal,
        onProgress: (loaded, total) => setUploadProgress(total > 0 ? loaded / total : 0),
      })
      setSelected(current => (multiple ? [...current, asset] : [asset]))
      setUploadedAssets(current => (multiple ? [...current, asset] : [asset]))
      void queryClient.invalidateQueries({ queryKey: ['assets', 'list'] })
    } catch (error) {
      // R2-P1-06：用户主动取消不展示错误文案。
      if (!isAbortError(error)) notifyError(error)
    } finally {
      if (uploadController.current === controller) uploadController.current = null
      setUploading(false)
    }
  }

  const handleImport = async () => {
    const url = linkUrl.trim()
    if (url === '') return
    try {
      const asset = await apiClient.importAsset({ url, kind: mediaKind ?? 'image' })
      setSelected(current => (multiple ? [...current, asset] : [asset]))
      setLinkUrl('')
      void queryClient.invalidateQueries({ queryKey: ['assets', 'list'] })
    } catch (error) {
      notifyError(error)
    }
  }

  const items = assetsState?.items ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                <Button variant="ghost" size="sm" className="col-span-full" onClick={() => loadMore()}>
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
            {/* R2-P1-06：上传中提供「取消上传」，中止进行中的 XHR。 */}
            {uploading && (
              <Button variant="outline" size="sm" className="w-full" onClick={abortUpload}>
                取消上传
              </Button>
            )}
            {uploadedAssets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">已上传，点击预览图即可选中</p>
                <div className="flex flex-wrap gap-3">
                  {uploadedAssets.map(asset => {
                    const selectedIndex = selected.findIndex(item => item.id === asset.id)
                    const isSelected = selectedIndex >= 0
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleAsset(asset)}
                        className={cn(
                          'group relative size-28 overflow-hidden rounded-lg bg-muted/40 ring-1 ring-border transition hover:ring-primary/60',
                          isSelected && 'ring-2 ring-primary',
                        )}
                        aria-pressed={isSelected}
                        aria-label={asset.fileName ?? '已上传素材'}
                      >
                        <AssetThumbnail
                          kind={asset.kind}
                          url={asset.url}
                          thumbnailUrl={asset.thumbnailUrl}
                          alt={asset.fileName ?? '已上传素材'}
                        />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left text-[11px] text-white">
                          {asset.fileName ?? '已上传素材'}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            {multiple ? selectedIndex + 1 : <Check className="size-3" />}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              onSelect(selected)
              handleOpenChange(false)
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
