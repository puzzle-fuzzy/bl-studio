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

  if (kind === 'image' && src !== undefined && src !== null && src !== '' && !failed) {
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
