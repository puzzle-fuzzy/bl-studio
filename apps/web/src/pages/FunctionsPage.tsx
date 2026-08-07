import { useEffect, useState } from 'react'
import { Clapperboard, FileAudio, Mic } from 'lucide-react'
import type { AssetItem, GenerationRecord } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useMediaJob } from '@/hooks/use-media-job'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { idempotencyKeyFor, clearIdempotencyKey } from '@/lib/idempotency'
import { resolveApiUrl } from '@/lib/api'

const SCREENPLAY_MODEL_IDS = ['qwen-omni-screenplay', 'qwen-omni-screenplay-flash']
const ASR_MODEL_IDS = ['fun-asr-v1']

/** 辅助工具：视频理解→剧本 / 提取音频 / 语音识别。 */
export function FunctionsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">辅助工具</h1>
        <p className="text-sm text-muted-foreground">围绕已有作品的最小派生工作流。</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ScreenplayTool />
        <ExtractAudioTool />
        <AsrTool />
      </div>
    </div>
  )
}

function ScreenplayTool() {
  const models = useModelCatalogStore(state => state.models)
  const model = SCREENPLAY_MODEL_IDS.map(id => selectModelById(models, id)).find(Boolean)
  return (
    <ToolCard
      icon={<Clapperboard className="size-5" />}
      title="视频理解 → 剧本"
      description="上传或选择一段视频，AI 理解后生成分镜剧本。"
      render={render => (
        <TextTool
          asset={render.asset}
          pickerOpen={render.pickerOpen}
          onPickerOpen={render.onPickerOpen}
          onAssetChange={render.onAssetChange}
          assetKindLabel="视频"
          model={model?.id}
          modelLabel={model?.displayName}
          run={(asset, modelId) => runGeneration(modelId, { videoUrl: [asset.id] })}
          renderResult={record => <GenerationResult record={record} />}
        />
      )}
    />
  )
}

function AsrTool() {
  const models = useModelCatalogStore(state => state.models)
  const model = ASR_MODEL_IDS.map(id => selectModelById(models, id)).find(Boolean)
  return (
    <ToolCard
      icon={<Mic className="size-5" />}
      title="语音识别"
      description="上传或选择一段音频，转写为文本。"
      render={render => (
        <TextTool
          asset={render.asset}
          pickerOpen={render.pickerOpen}
          onPickerOpen={render.onPickerOpen}
          onAssetChange={render.onAssetChange}
          assetKindLabel="音频"
          model={model?.id}
          modelLabel={model?.displayName}
          run={(asset, modelId) => runGeneration(modelId, { fileUrls: [asset.id] })}
          renderResult={record => <GenerationResult record={record} />}
        />
      )}
    />
  )
}

function ExtractAudioTool() {
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [jobId, setJobId] = useState<string | undefined>(undefined)
  const { job, isPolling } = useMediaJob(jobId)

  const start = async () => {
    if (asset === null) return
    try {
      const result = await apiClient.createMediaJob({
        operation: 'video.extract_audio',
        source: { assetId: asset.id, kind: 'video', fileName: asset.fileName },
        options: { format: 'mp3' },
      })
      setJobId(result.job.id)
      showMessage({ title: '已开始提取音频', tone: 'info' })
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
    }
  }

  return (
    <ToolCard
      icon={<FileAudio className="size-5" />}
      title="视频提取音频"
      description="从视频中提取音轨并保存为素材。"
      render={render => (
        <div className="space-y-3">
          <AssetSelector asset={asset} onOpen={() => setPickerOpen(true)} kindLabel="视频" />
          <AssetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} mediaKind="video" onSelect={assets => setAsset(assets[0] ?? null)} />
          <Button onClick={() => void start()} disabled={asset === null || isPolling}>
            {isPolling ? '处理中…' : '提取音频'}
          </Button>
          {job !== null && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>状态：{job.status}</p>
              {job.outputAssetId !== undefined && (
                <p className="text-xs text-muted-foreground">输出素材已保存到作品库</p>
              )}
              {job.status === 'failed' && <p className="text-destructive">提取失败</p>}
            </div>
          )}
        </div>
      )}
    />
  )
}

// ── 共享小部件 ─────────────────────────────────────────────

function ToolCard({
  icon,
  title,
  description,
  render,
}: {
  icon: React.ReactNode
  title: string
  description: string
  render: (ctx: {
    asset: AssetItem | null
    pickerOpen: boolean
    onPickerOpen: (open: boolean) => void
    onAssetChange: (asset: AssetItem | null) => void
  }) => React.ReactNode
}) {
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {render({ asset, pickerOpen, onPickerOpen: setPickerOpen, onAssetChange: setAsset })}
      </CardContent>
    </Card>
  )
}

function AssetSelector({
  asset,
  onOpen,
  kindLabel: label,
}: {
  asset: AssetItem | null
  onOpen: () => void
  kindLabel: string
}) {
  return (
    <button type="button" onClick={onOpen} className="flex h-24 w-full items-center gap-3 rounded-lg border border-dashed p-3 hover:border-primary/50">
      {asset !== null ? (
        <>
          <span className="size-14 overflow-hidden rounded-md border">
            <AssetThumbnail kind={asset.kind} url={asset.url} thumbnailUrl={asset.thumbnailUrl} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{asset.fileName ?? '已选择素材'}</span>
            <span className="block text-xs text-muted-foreground">点击更换</span>
          </span>
        </>
      ) : (
        <span className="w-full text-center text-sm text-muted-foreground">点击选择{label}素材</span>
      )}
    </button>
  )
}

function TextTool({
  asset,
  pickerOpen,
  onPickerOpen,
  onAssetChange,
  assetKindLabel,
  model,
  modelLabel,
  run,
  renderResult,
}: {
  asset: AssetItem | null
  pickerOpen: boolean
  onPickerOpen: (open: boolean) => void
  onAssetChange: (asset: AssetItem | null) => void
  assetKindLabel: string
  model: string | undefined
  modelLabel: string | undefined
  run: (asset: AssetItem, modelId: string) => Promise<GenerationRecord>
  renderResult: (record: GenerationRecord) => React.ReactNode
}) {
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [result, setResult] = useState<GenerationRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (asset === null || model === undefined) return
    setBusy(true)
    try {
      // run 回调负责把所选素材按模型 manifest 的媒体参数名组装为 assetRefs，
      // 幂等指纹也在其中处理（与 CreatePage 提交路径一致）。
      const record = await run(asset, model)
      setResult(record)
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <AssetSelector asset={asset} onOpen={() => onPickerOpen(true)} kindLabel={assetKindLabel} />
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={onPickerOpen}
        mediaKind={assetKindLabel === '视频' ? 'video' : 'audio'}
        onSelect={assets => onAssetChange(assets[0] ?? null)}
      />
      <Button onClick={() => void submit()} disabled={asset === null || busy || model === undefined}>
        {busy ? '处理中…' : model === undefined ? '模型暂不可用' : '开始分析'}
      </Button>
      {modelLabel !== undefined && <p className="text-xs text-muted-foreground">模型：{modelLabel}</p>}
      {result !== null && renderResult(result)}
    </div>
  )
}

async function runGeneration(modelId: string, assetRefs: Record<string, string[]>): Promise<GenerationRecord> {
  const payload = { modelId, params: {}, assetRefs }
  const idempotencyKey = idempotencyKeyFor(payload)
  const response = await apiClient.createGeneration({ ...payload, idempotencyKey })
  clearIdempotencyKey(payload)
  return response.record
}

function GenerationResult({ record }: { record: GenerationRecord }) {
  const text = record.outputResult?.artifacts?.find(artifact => artifact.text !== undefined)?.text
  const media = record.outputResult?.artifacts?.find(artifact => artifact.kind !== 'text')
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs text-muted-foreground">状态：{record.status}</p>
      {text !== undefined && (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm">{text}</p>
      )}
      {media?.sourceUrl !== undefined && (
        <img src={resolveApiUrl(media.sourceUrl)} alt="" className="mt-2 max-h-48 rounded-md object-contain" />
      )}
      {record.status === 'failed' && <p className="text-sm text-destructive">生成失败</p>}
    </div>
  )
}
