import { useEffect, useState, type FormEvent } from 'react'
import type { AssetItem } from '@bailian-studio/api-client'
import { FileImage, Film, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'

/**
 * 普通素材的唯一上传入口。
 *
 * 这里故意不要求用户先选择主体、场景或道具：上传得到的 user asset
 * 可以先作为通用图片/视频保存，后续再作为创作参考或收录为结构化资产。
 */
export function UploadAssetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (asset: AssetItem) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setProgress(0)
      setIsSubmitting(false)
    }
  }, [open])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isSubmitting) {
      setFile(null)
      setProgress(0)
    }
    onOpenChange(nextOpen)
  }

  function handleFileChange(nextFile: File | undefined) {
    if (nextFile === undefined) return
    if (!nextFile.type.startsWith('image/') && !nextFile.type.startsWith('video/')) {
      setFile(null)
      notifyError('这里只支持图片或视频文件')
      return
    }
    setFile(nextFile)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (file === null) {
      notifyError('请选择一张图片或一个视频')
      return
    }

    setIsSubmitting(true)
    setProgress(0)
    try {
      const asset = await apiClient.uploadAsset({
        file,
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        onProgress: (loaded, total) => setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0),
      })
      onCreated(asset)
      setFile(null)
      setProgress(0)
    } catch (submitError) {
      notifyError(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>上传素材</DialogTitle>
          <DialogDescription>
            图片和视频会先保存到“素材”，之后你可以在创建主体、场景或其它资产时继续使用它们。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label
            htmlFor="asset-upload-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            {file === null ? (
              <>
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-background text-primary">
                  <Upload className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium">点击选择图片或视频</span>
                  <span className="mt-1 block text-xs text-muted-foreground">支持常见图片格式和视频格式</span>
                </span>
              </>
            ) : (
              <span className="flex w-full items-center gap-3 text-left">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary">
                  {file.type.startsWith('video/') ? <Film className="size-5" aria-hidden="true" /> : <FileImage className="size-5" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">点击更换</span>
              </span>
            )}
            <input
              id="asset-upload-file"
              type="file"
              className="sr-only"
              accept="image/*,video/*"
              disabled={isSubmitting}
              onChange={event => {
                handleFileChange(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>

          {isSubmitting && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />正在上传</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>取消</Button>
            <Button type="submit" disabled={isSubmitting || file === null}>
              {isSubmitting ? '上传中…' : '上传到素材'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
