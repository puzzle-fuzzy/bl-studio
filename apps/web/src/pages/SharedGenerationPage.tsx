import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { PublicSharedGeneration } from '@bailian-studio/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BrandMark } from '@/components/shared/BrandMark'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { apiClient } from '@/lib/api'
import { resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { generationStatusLabel } from '@/lib/labels'

/** 公开分享页（匿名只读）：展示模型/状态/产物/输入参数。 */
export function SharedGenerationPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const [data, setData] = useState<PublicSharedGeneration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (shareId === undefined) return
    setIsLoading(true)
    setError(null)
    apiClient
      .getSharedGeneration(shareId)
      .then(setData)
      .catch(err => setError(userErrorMessage(err)))
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
            <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
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
                {data.artifacts.map(artifact => {
                  const src = artifact.readUrl ?? artifact.thumbnailUrl
                  return (
                    <div key={artifact.id} className="aspect-video overflow-hidden rounded-lg border">
                      {src !== undefined && artifact.kind === 'image' ? (
                        <img src={resolveApiUrl(src)} alt="" className="size-full object-cover" loading="lazy" />
                      ) : src !== undefined ? (
                        // biome-ignore lint/a11y/useMediaCaption: Generated media does not provide caption tracks.
                        <video src={resolveApiUrl(src)} controls className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">暂无预览</div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
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
