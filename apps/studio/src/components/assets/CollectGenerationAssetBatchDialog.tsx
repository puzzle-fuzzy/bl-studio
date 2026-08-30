import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import type {
  CreativeAssetCollectionBatchResult,
  CreativeAssetReferenceRole,
  CreativeAssetType,
  CreativeProject,
  GenerationArtifact,
} from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Textarea } from '@bailian-studio/ui'
import { useGenerationArtifacts } from '@/hooks/use-generation-artifacts'
import { useCreativeProjectList } from '@/hooks/use-creative-projects'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { buildCollectGenerationBatchRequest, MAX_GENERATION_ASSET_BATCH_SIZE } from '@/lib/collect-generation-batch'
import { notifyError } from '@/lib/toast'
import { ROLE_OPTIONS, TYPE_OPTIONS } from './collect-generation-asset-options'

export function CollectGenerationAssetBatchDialog({
  open,
  onOpenChange,
  generationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  generationId: string
  onCreated: (batch: CreativeAssetCollectionBatchResult) => void
}) {
  const artifactsQuery = useGenerationArtifacts(generationId, open)
  const projectList = useCreativeProjectList()
  const [type, setType] = useState<CreativeAssetType>('character')
  const [projectId, setProjectId] = useState('all')
  const [namePrefix, setNamePrefix] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState<CreativeAssetReferenceRole>('front')
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<ReadonlySet<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionRef = useRef<{ fingerprint: string; idempotencyKey: string } | undefined>(undefined)

  const projects: CreativeProject[] = projectList.data?.pages.flatMap(page => page.items) ?? []
  const imageArtifacts = useMemo(
    () => (artifactsQuery.data?.items ?? []).filter(artifact => artifact.kind === 'image' && artifact.status === 'stored'),
    [artifactsQuery.data],
  )
  const selectedArtifacts = useMemo(
    () => imageArtifacts.filter(artifact => selectedArtifactIds.has(artifact.id)),
    [imageArtifacts, selectedArtifactIds],
  )
  const roleOptions = ROLE_OPTIONS[type]
  const selectableArtifacts = imageArtifacts.slice(0, MAX_GENERATION_ASSET_BATCH_SIZE)
  const allSelectableArtifactsSelected = selectableArtifacts.length > 0
    && selectableArtifacts.every(artifact => selectedArtifactIds.has(artifact.id))

  useEffect(() => {
    if (!open) return
    setSelectedArtifactIds(new Set())
    setNamePrefix('')
    setDescription('')
    submissionRef.current = undefined
  }, [generationId, open])

  useEffect(() => {
    if (!roleOptions.some(option => option.value === role)) setRole(roleOptions[0]?.value ?? 'other')
  }, [role, roleOptions])

  function reset() {
    setType('character')
    setProjectId('all')
    setNamePrefix('')
    setDescription('')
    setRole('front')
    setSelectedArtifactIds(new Set())
    setIsSubmitting(false)
    submissionRef.current = undefined
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isSubmitting) reset()
    onOpenChange(nextOpen)
  }

  function toggleArtifact(artifactId: string) {
    setSelectedArtifactIds(current => {
      const next = new Set(current)
      if (next.has(artifactId)) {
        next.delete(artifactId)
        return next
      }
      if (next.size >= MAX_GENERATION_ASSET_BATCH_SIZE) {
        notifyError(`一次最多收录 ${MAX_GENERATION_ASSET_BATCH_SIZE} 个图片产物`)
        return current
      }
      next.add(artifactId)
      return next
    })
  }

  function toggleAll() {
    setSelectedArtifactIds(allSelectableArtifactsSelected
      ? new Set()
      : new Set(selectableArtifacts.map(artifact => artifact.id)))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedArtifacts.length === 0) {
      notifyError('请至少选择一个已落存的图片产物')
      return
    }
    setIsSubmitting(true)
    try {
      const input = buildCollectGenerationBatchRequest({
        generationId,
        artifactIds: selectedArtifacts.map(artifact => artifact.id),
        type,
        role,
        ...(projectId === 'all' ? {} : { projectId }),
        namePrefix,
        description,
      })
      const fingerprint = JSON.stringify(input)
      const submission = submissionRef.current?.fingerprint === fingerprint
        ? submissionRef.current
        : { fingerprint, idempotencyKey: globalThis.crypto.randomUUID() }
      submissionRef.current = submission
      const batch = await apiClient.collectCreativeAssetFromGenerationBatch(input, {
        idempotencyKey: submission.idempotencyKey,
      })
      onCreated(batch)
      reset()
    } catch (submitError) {
      notifyError(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(820px,calc(100svh-2rem))] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>批量收录为创意资产</DialogTitle>
          <DialogDescription>
            从本次生成中选择多张已落存图片，按产物顺序创建待确认资产版本。所有资产共享下方的类型、角色、项目和说明；名称会自动追加 01、02 等序号。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="collect-generation-batch-type">素材类型</Label>
              <Select value={type} onValueChange={value => setType(value as CreativeAssetType)}>
                <SelectTrigger id="collect-generation-batch-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collect-generation-batch-role">参考图角色</Label>
              <Select value={role} onValueChange={value => setRole(value as CreativeAssetReferenceRole)}>
                <SelectTrigger id="collect-generation-batch-role"><SelectValue /></SelectTrigger>
                <SelectContent>{roleOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="collect-generation-batch-project">归入项目 <span className="font-normal text-muted-foreground">（可选）</span></Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="collect-generation-batch-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">暂不归入项目</SelectItem>
                {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="collect-generation-batch-name">素材名称前缀</Label>
              <Input id="collect-generation-batch-name" value={namePrefix} onChange={event => setNamePrefix(event.target.value)} placeholder="例如：林默标准角色设定" maxLength={150} autoFocus />
              <p className="text-xs text-muted-foreground">示例：林默标准角色设定 01、林默标准角色设定 02</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collect-generation-batch-description">说明 <span className="font-normal text-muted-foreground">（可选）</span></Label>
              <Textarea id="collect-generation-batch-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="记录服装或后续使用限制" maxLength={4_000} rows={3} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>图片产物</Label>
              {imageArtifacts.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                  {allSelectableArtifactsSelected ? '清空选择' : imageArtifacts.length > MAX_GENERATION_ASSET_BATCH_SIZE ? `选择前 ${MAX_GENERATION_ASSET_BATCH_SIZE} 个` : '全选'}
                </Button>
              )}
            </div>
            {artifactsQuery.isPending ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">正在加载产物…</p>
            ) : imageArtifacts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">没有可收录的已落存图片产物。</p>
            ) : (
              <div className="grid max-h-[min(440px,50svh)] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                {imageArtifacts.map((artifact, index) => (
                  <BatchArtifactOption
                    key={artifact.id}
                    artifact={artifact}
                    index={index}
                    selected={selectedArtifactIds.has(artifact.id)}
                    onSelect={() => toggleArtifact(artifact.id)}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground" aria-live="polite">
              已选择 {selectedArtifacts.length} 个，最多 {MAX_GENERATION_ASSET_BATCH_SIZE} 个。仅展示已落存的图片产物。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>取消</Button>
            <Button type="submit" disabled={isSubmitting || selectedArtifacts.length === 0}>{isSubmitting ? '正在批量收录…' : `建立 ${selectedArtifacts.length} 个待确认版本`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BatchArtifactOption({
  artifact,
  index,
  selected,
  onSelect,
}: {
  artifact: GenerationArtifact
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const previewUrl = artifact.thumbnailUrl ?? artifact.readUrl ?? artifact.storageUrl ?? artifact.sourceUrl
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${selected ? '取消选择' : '选择'}图片产物 ${index + 1}`}
      title={`${selected ? '取消选择' : '选择'}图片产物 ${index + 1}`}
      className={`group relative overflow-hidden rounded-xl border text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}
    >
      <div className="aspect-[4/3] bg-muted">
        {previewUrl !== undefined ? (
          <img src={resolveApiUrl(previewUrl)} alt={`图片产物 ${index + 1} 预览`} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">无预览</div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium">图片产物 {String(index + 1).padStart(2, '0')}</p>
        <p className="truncate text-xs text-muted-foreground">{artifact.id}</p>
      </div>
      {selected && (
        <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </button>
  )
}
