import { useState } from 'react'
import { Film } from 'lucide-react'
import { resolveApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 播放真实视频资产；缩略图只作为 poster，不再把成片误当成静态图片展示。
 */
export function AssetVideoPlayer({
  url,
  thumbnailUrl,
  captionsUrl,
  mimeType,
  alt,
  className,
}: {
  url?: string | null
  thumbnailUrl?: string | null
  captionsUrl?: string | null
  mimeType?: string | null
  alt?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const source = resolveApiUrl(url)
  const poster = resolveApiUrl(thumbnailUrl)
  const captions = resolveApiUrl(captionsUrl)

  if (source === '' || failed) {
    return (
      <div className={cn('flex size-full min-h-48 flex-col items-center justify-center gap-2 bg-muted/40 px-4 text-center text-muted-foreground', className)}>
        <Film className="size-8" aria-hidden="true" />
        <span className="text-sm">视频预览暂不可用，请稍后重试或下载原文件。</span>
      </div>
    )
  }

  return (
    // biome-ignore lint/a11y/useMediaCaption: caption resources are optional on current assets; captionsUrl is supported when available.
    <video
      className={cn('size-full bg-black object-contain', className)}
      controls
      playsInline
      preload="metadata"
      poster={poster || undefined}
      aria-label={alt ?? '视频预览'}
      onError={() => setFailed(true)}
    >
      <source src={source} type={mimeType ?? undefined} />
      {captions !== '' && <track kind="captions" src={captions} srcLang="zh" label="中文字幕" />}
    </video>
  )
}
