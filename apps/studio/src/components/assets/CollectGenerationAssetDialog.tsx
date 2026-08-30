import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  CreativeAssetDetail,
  CreativeAssetReferenceRole,
  CreativeAssetType,
  CreativeProject,
  CollectCreativeAssetFromGenerationRequest,
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
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'
import { ROLE_OPTIONS, TYPE_OPTIONS } from './collect-generation-asset-options'

export function CollectGenerationAssetDialog({
  open,
  onOpenChange,
  generationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  generationId: string
  onCreated: (asset: CreativeAssetDetail) => void
}) {
  const artifactsQuery = useGenerationArtifacts(generationId, open)
  const projectList = useCreativeProjectList()
  const [type, setType] = useState<CreativeAssetType>('character')
  const [projectId, setProjectId] = useState('all')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [artifactId, setArtifactId] = useState('')
  const [role, setRole] = useState<CreativeAssetReferenceRole>('front')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionRef = useRef<{ fingerprint: string; idempotencyKey: string } | undefined>(undefined)

  const projects: CreativeProject[] = projectList.data?.pages.flatMap(page => page.items) ?? []
  const imageArtifacts = useMemo(
    () => (artifactsQuery.data?.items ?? []).filter(artifact => artifact.kind === 'image' && artifact.status === 'stored'),
    [artifactsQuery.data],
  )
  const roleOptions = ROLE_OPTIONS[type]

  useEffect(() => {
    if (!open) return
  }, [generationId, open])

  useEffect(() => {
    if (artifactId === '' && imageArtifacts[0] !== undefined) setArtifactId(imageArtifacts[0].id)
  }, [artifactId, imageArtifacts])

  useEffect(() => {
    if (!roleOptions.some(option => option.value === role)) setRole(roleOptions[0]?.value ?? 'other')
  }, [role, roleOptions])

  function reset() {
    setType('character')
    setProjectId('all')
    setName('')
    setDescription('')
    setArtifactId('')
    setRole('front')
    setIsSubmitting(false)
    submissionRef.current = undefined
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isSubmitting) reset()
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (normalizedName.length === 0) {
      notifyError('请输入素材名称')
      return
    }
    if (artifactId === '') {
      notifyError('请选择一个已落存的图片产物')
      return
    }
    setIsSubmitting(true)
    try {
      const input: CollectCreativeAssetFromGenerationRequest = {
        type,
        name: normalizedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(projectId === 'all' ? {} : { projectId }),
        sourceGenerationId: generationId,
        semanticSpec: {},
        generationRecipe: { source: 'generation', generationId },
        references: [{ artifactId, role, position: 0, metadata: { source: 'generated' } }],
      }
      const fingerprint = JSON.stringify(input)
      const submission = submissionRef.current?.fingerprint === fingerprint
        ? submissionRef.current
        : { fingerprint, idempotencyKey: globalThis.crypto.randomUUID() }
      submissionRef.current = submission
      const asset = await apiClient.collectCreativeAssetFromGeneration(input, {
        idempotencyKey: submission.idempotencyKey,
      })
      onCreated(asset)
      reset()
    } catch (submitError) {
      notifyError(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100svh-2rem))] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>收录为创意资产</DialogTitle>
          <DialogDescription>选择一张已完成的图片产物，一次性创建资产和待确认版本。原生成记录仍然保留；提交失败时可安全重试。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="collect-generation-type">素材类型</Label>
              <Select value={type} onValueChange={value => setType(value as CreativeAssetType)}>
                <SelectTrigger id="collect-generation-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collect-generation-role">参考图角色</Label>
              <Select value={role} onValueChange={value => setRole(value as CreativeAssetReferenceRole)}>
                <SelectTrigger id="collect-generation-role"><SelectValue /></SelectTrigger>
                <SelectContent>{roleOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="collect-generation-project">归入项目 <span className="font-normal text-muted-foreground">（可选）</span></Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="collect-generation-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">暂不归入项目</SelectItem>
                {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="collect-generation-name">素材名称</Label>
            <Input id="collect-generation-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如：林默标准角色设定" maxLength={160} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collect-generation-description">说明 <span className="font-normal text-muted-foreground">（可选）</span></Label>
            <Textarea id="collect-generation-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="记录服装或后续使用限制" maxLength={4_000} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>图片产物</Label>
            {artifactsQuery.isPending ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">正在加载产物…</p>
            ) : imageArtifacts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">没有可收录的已落存图片产物。</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {imageArtifacts.map(artifact => <ArtifactOption key={artifact.id} artifact={artifact} selected={artifact.id === artifactId} onSelect={() => setArtifactId(artifact.id)} />)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>取消</Button>
            <Button type="submit" disabled={isSubmitting || imageArtifacts.length === 0}>{isSubmitting ? '正在收录…' : '建立待确认版本'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ArtifactOption({
  artifact,
  selected,
  onSelect,
}: {
  artifact: GenerationArtifact
  selected: boolean
  onSelect: () => void
}) {
  const previewUrl = artifact.thumbnailUrl ?? artifact.readUrl ?? artifact.sourceUrl
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
    >
      <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {previewUrl !== undefined ? <img src={previewUrl} alt="生成产物预览" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-xs text-muted-foreground">无预览</span>}
      </div>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">图片产物</span>
        <span className="block truncate text-xs text-muted-foreground">{artifact.id}</span>
      </span>
    </button>
  )
}
