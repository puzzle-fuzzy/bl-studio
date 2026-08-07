import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { resolveApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/** 全屏遮罩里的媒体项（详情页产物 / 作品库素材统一描述）。 */
export interface LightboxMedia {
  key: string
  kind: 'image' | 'video' | 'audio' | 'text'
  url?: string
  thumbnailUrl?: string
  fileName?: string
  text?: string
}

/** 把任意 kind 归一为 LightboxMedia.kind；未知类型（如 archive）回退为 image。 */
export function isLightboxKind(kind: string): kind is LightboxMedia['kind'] {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text'
}

/**
 * 多图全屏查看：黑色遮罩，当前项大图 + 底部横向缩略图行 + 左右箭头 + 键盘
 * ←/→ 循环切换（Esc / 点击遮罩关闭）；可选下载按钮。
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  downloadUrl,
}: {
  items: readonly LightboxMedia[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  downloadUrl?: string
}) {
  const count = items.length
  const current = items[index]
  const url = current?.url !== undefined ? resolveApiUrl(current.url) : undefined

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count)
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, count, onClose, onIndexChange])

  const stop = (event: React.MouseEvent) => event.stopPropagation()

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center bg-black/90 px-6 pt-8 pb-6"
      onClick={onClose}
    >
      {/* 标题 */}
      <div className="mb-2 flex max-w-full items-center gap-2 text-sm text-white/90">
        <span className="max-w-72 truncate">{current?.fileName ?? '预览'}</span>
        {count > 1 && <span className="shrink-0 text-white/60">{index + 1} / {count}</span>}
      </div>

      {/* 大图区域：媒体居中，下载按钮竖排在图片右侧（圆形纯图标）。 */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-5" onClick={stop}>
        {current?.kind === 'image' && url !== undefined && (
          <img src={url} alt="" className="max-h-full max-w-[calc(100%-4rem)] object-contain" />
        )}
        {current?.kind === 'video' && url !== undefined && (
          <video src={url} controls autoPlay className="max-h-full max-w-[calc(100%-4rem)]" />
        )}
        {current?.kind === 'audio' && url !== undefined && (
          <audio src={url} controls autoPlay className="w-full max-w-lg" />
        )}
        {current?.kind === 'text' && (
          <p className="max-h-full max-w-2xl overflow-y-auto whitespace-pre-wrap text-sm text-white/90">
            {current.text ?? '(空文本)'}
          </p>
        )}
        {downloadUrl !== undefined && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            download
            onClick={stop}
            aria-label="下载"
            title="下载"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20"
          >
            <Download className="size-5" />
          </a>
        )}
      </div>

      {/* 左右箭头（多图时） */}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={event => {
              stop(event)
              onIndexChange((index - 1 + count) % count)
            }}
            className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={event => {
              stop(event)
              onIndexChange((index + 1) % count)
            }}
            className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {/* 缩略图行（多图时） */}
      {count > 1 && (
        <div className="mt-4 flex max-w-full items-center gap-2 overflow-x-auto pb-1" onClick={stop}>
          {items.map((item, itemIndex) => (
            <button
              key={item.key}
              type="button"
              aria-label={`切换到第 ${itemIndex + 1} 张`}
              onClick={() => onIndexChange(itemIndex)}
              className={cn(
                'size-14 shrink-0 overflow-hidden rounded-md border-2 transition-all',
                itemIndex === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <img
                src={resolveApiUrl(item.thumbnailUrl ?? item.url ?? '')}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
    </div>
  )
}
