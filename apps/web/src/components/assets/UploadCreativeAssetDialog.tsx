import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  CreativeAssetDetail,
  CreativeAssetReferenceRole,
  CreativeAssetType,
  CreativeProject,
} from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'

const TYPE_OPTIONS: Array<{ value: CreativeAssetType; label: string }> = [
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'style', label: '风格' },
]

const ROLE_OPTIONS: Record<CreativeAssetType, Array<{ value: CreativeAssetReferenceRole; label: string }>> = {
  character: [
    { value: 'front', label: '正面' },
    { value: 'three_quarter', label: '三分之四侧面' },
    { value: 'side', label: '侧面' },
    { value: 'back', label: '背面' },
    { value: 'full_body', label: '全身' },
    { value: 'medium', label: '中景' },
    { value: 'face_closeup', label: '面部特写' },
  ],
  environment: [
    { value: 'wide', label: '广角' },
    { value: 'medium', label: '中景' },
    { value: 'detail', label: '细节' },
    { value: 'other', label: '其他' },
  ],
  prop: [
    { value: 'isolated', label: '孤立物体' },
    { value: 'detail', label: '细节' },
    { value: 'interaction', label: '交互状态' },
    { value: 'other', label: '其他' },
  ],
  style: [
    { value: 'style_board', label: '风格板' },
    { value: 'other', label: '其他' },
  ],
}

export function UploadCreativeAssetDialog({
  open,
  onOpenChange,
  projects,
  projectId,
  defaultType = 'character',
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: CreativeProject[]
  projectId?: string
  defaultType?: CreativeAssetType
  onCreated: (asset: CreativeAssetDetail) => void
}) {
  const [type, setType] = useState<CreativeAssetType>(defaultType)
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? 'all')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState<CreativeAssetReferenceRole>(ROLE_OPTIONS[defaultType][0]?.value ?? 'other')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleOptions = useMemo(() => ROLE_OPTIONS[type], [type])

  useEffect(() => {
    if (!roleOptions.some(option => option.value === role)) {
      setRole(roleOptions[0]?.value ?? 'other')
    }
  }, [role, roleOptions])

  useEffect(() => {
    if (!open) return
    setType(defaultType)
    setSelectedProjectId(projectId ?? 'all')
  }, [defaultType, open, projectId])

  function reset() {
    setName('')
    setDescription('')
    setFile(null)
    setProgress(0)
    setError(null)
    setIsSubmitting(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isSubmitting) reset()
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (normalizedName.length === 0) {
      setError('请输入素材名称')
      return
    }
    if (file === null) {
      setError('请选择一张 PNG、JPG 或 WebP 图片')
      return
    }

    setIsSubmitting(true)
    setProgress(0)
    setError(null)
    let uploadedAssetId: string | undefined
    let creativeAssetId: string | undefined
    try {
      const uploaded = await apiClient.uploadAsset({
        file,
        kind: 'image',
        onProgress: (loaded, total) => setProgress(total > 0 ? Math.round((loaded / total) * 70) : 0),
      })
      uploadedAssetId = uploaded.id

      const created = await apiClient.createCreativeAsset({
        type,
        name: normalizedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(selectedProjectId === 'all' ? {} : { projectId: selectedProjectId }),
      })
      creativeAssetId = created.id
      const versioned = await apiClient.createCreativeAssetVersion(created.id, {
        semanticSpec: {},
        generationRecipe: {
          source: 'upload',
          fileName: file.name,
          mimeType: file.type,
        },
      })
      const version = versioned.versions[0]
      if (version === undefined) throw new Error('素材版本创建失败')
      const asset = await apiClient.addCreativeAssetReference(version.id, {
        userAssetId: uploaded.id,
        role,
        metadata: { source: 'uploaded' },
      })
      setProgress(100)
      onCreated(asset)
      reset()
    } catch (submitError) {
      if (creativeAssetId !== undefined) await apiClient.archiveCreativeAsset(creativeAssetId).catch(() => undefined)
      if (uploadedAssetId !== undefined) await apiClient.deleteAsset(uploadedAssetId).catch(() => undefined)
      setError(userErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100svh-2rem))] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>上传并建立素材</DialogTitle>
          <DialogDescription>
            上传的图片会先进入通用资产库，再创建一个待确认的创意资产版本。确认版本前不会参与稳定引用。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="creative-upload-type">素材类型</Label>
              <Select value={type} onValueChange={value => setType(value as CreativeAssetType)}>
                <SelectTrigger id="creative-upload-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="creative-upload-role">参考图角色</Label>
              <Select value={role} onValueChange={value => setRole(value as CreativeAssetReferenceRole)}>
                <SelectTrigger id="creative-upload-role"><SelectValue /></SelectTrigger>
                <SelectContent>{roleOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="creative-upload-project">归入项目 <span className="font-normal text-muted-foreground">（可选）</span></Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger id="creative-upload-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">暂不归入项目</SelectItem>
                {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="creative-upload-name">素材名称</Label>
            <Input id="creative-upload-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如：林默正面标准像" maxLength={160} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creative-upload-description">说明 <span className="font-normal text-muted-foreground">（可选）</span></Label>
            <Textarea id="creative-upload-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="记录服装、光线、使用限制等信息" maxLength={4_000} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creative-upload-file">参考图</Label>
            <Input
              id="creative-upload-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={event => setFile(event.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">当前仅接入 PNG、JPG、WebP 图片作为创意资产参考图。</p>
          </div>
          {isSubmitting && <progress className="h-2 w-full accent-primary" value={progress} max={100} aria-label={`上传进度 ${progress}%`} />}
          {error !== null && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? `正在建立… ${progress}%` : '上传并建立版本'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
