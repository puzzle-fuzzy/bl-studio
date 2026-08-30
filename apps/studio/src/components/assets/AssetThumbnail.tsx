import { useState } from 'react'
import { FileText, Film, FileArchive, Image as ImageIcon, Music } from 'lucide-react'
import { resolveApiUrl } from '@/lib/api'
import { kindLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** 资产缩略图：按 kind 渲染；图片加载失败降级为图标。 */
export function AssetThumbnail({
  kind,
  url,
  thumbnailUrl,
  alt,
  className,
}: {
  kind: string
  url?: string | null
  thumbnailUrl?: string | null
  alt?: string
  className?: string
}) {
  const src = thumbnailUrl ?? url
  const [failed, setFailed] = useState(false)

  // 图片与视频都可渲染位图缩略图：视频的 src 应为 OSS video/snapshot 抽帧图；
  // 若只有原始视频 URL（缩略图未就绪），<img> 加载失败会回退到 kind 图标。
  const renderable = src !== undefined && src !== null && src !== '' && !failed
  if (renderable && (kind === 'image' || kind === 'video')) {
    return (
      <img
        src={resolveApiUrl(src)}
        alt={alt ?? kindLabel(kind)}
        loading="lazy"
        className={cn('size-full object-cover', className)}
        onError={() => setFailed(true)}
      />
    )
  }

  return <KindIcon kind={kind} className={className} />
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon =
    kind === 'video' ? Film
      : kind === 'audio' ? Music
        : kind === 'text' ? FileText
          : kind === 'archive' ? FileArchive
            : ImageIcon
  return (
    <div className={cn('flex size-full items-center justify-center bg-muted/40 text-muted-foreground', className)}>
      <Icon className="size-6" />
    </div>
  )
}
