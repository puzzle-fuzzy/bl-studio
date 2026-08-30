import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { PublicSharedGeneration } from '@bailian-studio/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@bailian-studio/ui'
import { BrandMark } from '@/components/shared/BrandMark'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'
import { resolveApiUrl } from '@/lib/api'
import { generationStatusLabel } from '@/lib/labels'
import { FileText, Image as ImageIcon, Music } from 'lucide-react'

/** 公开分享页（匿名只读）：展示模型/状态/产物/输入参数。 */
export function SharedGenerationPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const [data, setData] = useState<PublicSharedGeneration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const lightboxItems: LightboxMedia[] = (data?.artifacts ?? []).map(artifact => ({
    key: artifact.id,
    kind: isLightboxKind(artifact.kind) ? artifact.kind : 'text',
    url: artifact.readUrl,
    thumbnailUrl: artifact.thumbnailUrl ?? artifact.readUrl,
    fileName: `${artifact.kind}作品`,
    text: artifact.kind === 'archive' ? '归档文件暂不支持网页内展开预览。' : undefined,
  }))

  useEffect(() => {
    if (shareId === undefined) return
    setIsLoading(true)
    setError(null)
    apiClient
      .getSharedGeneration(shareId)
      .then(setData)
      .catch(err => {
        notifyError(err)
        setError('load')
      })
      .finally(() => setIsLoading(false))
  }, [shareId])

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex h-14 items-center border-b bg-background px-6">
        <BrandMark />
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        {isLoading && <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>}
        {error !== null && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">暂时无法加载公开内容，请稍后重试。</CardContent>
          </Card>
        )}
        {data !== null && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{data.record.modelId}</span>
                  <StatusBadge status={data.record.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {data.artifacts.map((artifact, index) => {
                  const src = artifact.readUrl ?? artifact.thumbnailUrl
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      aria-label={`预览${artifact.kind}作品`}
                      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border bg-muted text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {src !== undefined && artifact.kind === 'image' ? (
                        <img src={resolveApiUrl(src)} alt="" className="size-full object-cover" loading="lazy" />
                      ) : artifact.kind === 'video' && src !== undefined ? (
                        <video src={resolveApiUrl(src)} muted playsInline preload="metadata" className="size-full object-cover" />
                      ) : artifact.kind === 'audio' ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Music className="size-8" />
                          <span className="text-xs">点击播放音频</span>
                        </div>
                      ) : artifact.kind === 'text' ? (
                        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                          <FileText className="size-4 shrink-0" />
                          文本作品
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageIcon className="size-8" />
                          <span className="text-xs">暂无预览</span>
                        </div>
                      )}
                      <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/65 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        点击预览
                      </span>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
            {previewIndex !== null && lightboxItems.length > 0 && (
              <MediaLightbox
                items={lightboxItems}
                index={previewIndex}
                onIndexChange={setPreviewIndex}
                onClose={() => setPreviewIndex(null)}
                downloadUrl={lightboxItems[previewIndex]?.url !== undefined
                  ? resolveApiUrl(lightboxItems[previewIndex]?.url ?? '')
                  : undefined}
              />
            )}
            {data.record.inputParams !== undefined && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">输入参数</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {Object.entries(data.record.inputParams).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[96px_1fr] gap-2 text-sm">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="break-words">{String(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <p className="text-center text-xs text-muted-foreground">
              状态：{generationStatusLabel(data.record.status)} · 由 Bailian Studio 生成
            </p>
          </>
        )}
      </main>
    </div>
  )
}
