import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Gift, Loader2, Minus } from 'lucide-react'
import type { AdminUser, AssetItem, CreditBalance } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { UserAvatar } from '@/components/layout/user-avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function assetToLightboxMedia(asset: AssetItem): LightboxMedia {
  return {
    key: asset.id,
    kind: isLightboxKind(asset.kind) ? asset.kind : 'text',
    url: asset.url ?? asset.downloadUrl,
    thumbnailUrl: asset.thumbnailUrl ?? asset.url ?? asset.downloadUrl,
    fileName: asset.fileName ?? asset.id,
    text: asset.text ?? (asset.kind === 'archive' ? `文件类型：${asset.mimeType ?? '归档文件'}` : undefined),
  }
}

export function UserDetailPage() {
  const { userId = '' } = useParams()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [assetCursor, setAssetCursor] = useState<string | undefined>(undefined)
  const [assetsLoadingMore, setAssetsLoadingMore] = useState(false)
  const [preview, setPreview] = useState<{ index: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [roleBusy, setRoleBusy] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantCents, setGrantCents] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [deductOpen, setDeductOpen] = useState(false)
  const [deductCents, setDeductCents] = useState('')
  const [deductReason, setDeductReason] = useState('')
  const [deductBusy, setDeductBusy] = useState(false)
  const [deductError, setDeductError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [detail, assetPage] = await Promise.all([
        apiClient.adminGetUser(userId),
        apiClient.adminListUserAssets(userId, { limit: 50 }),
      ])
      setUser(detail.user)
      setBalance(detail.balance)
      setAssets(assetPage.items)
      setAssetCursor(assetPage.nextCursor)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [userId])

  // P1-15：大账户资产可继续翻页，不再被首屏 50 条截断无法完整审计。
  const loadMoreAssets = async () => {
    if (assetCursor === undefined || assetsLoadingMore) return
    setAssetsLoadingMore(true)
    try {
      const page = await apiClient.adminListUserAssets(userId, { limit: 50, cursor: assetCursor })
      setAssets(current => [...current, ...page.items])
      setAssetCursor(page.nextCursor)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setAssetsLoadingMore(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  const handleRoleChange = async (role: 'user' | 'admin') => {
    if (user === null || role === user.role) return
    setRoleBusy(true)
    setError(null)
    try {
      const updated = await apiClient.adminUpdateUser(user.id, { role })
      setUser(updated)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setRoleBusy(false)
    }
  }

  const handleGrant = async () => {
    const amountCents = Number(grantCents)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setGrantError('请输入有效的积分数量')
      return
    }
    setGrantBusy(true)
    setGrantError(null)
    try {
      const result = await apiClient.adminGrantPoints(userId, {
        amountCents,
        reason: grantReason.trim() || '管理员赠送',
        idempotencyKey: crypto.randomUUID(),
      })
      setBalance(result.balance)
      setGrantOpen(false)
      setGrantCents('')
      setGrantReason('')
    } catch (err) {
      setGrantError(userErrorMessage(err))
    } finally {
      setGrantBusy(false)
    }
  }

  const handleDeduct = async () => {
    const amountCents = Number(deductCents)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setDeductError('请输入有效的积分数量')
      return
    }
    setDeductBusy(true)
    setDeductError(null)
    try {
      // 扣除 = 负向调整；余额不足时服务端会返回 POINTS_INSUFFICIENT。
      const result = await apiClient.adminAdjustPoints(userId, {
        amountCents: -amountCents,
        reason: deductReason.trim() || '管理员扣除',
        idempotencyKey: crypto.randomUUID(),
      })
      setBalance(result.balance)
      setDeductOpen(false)
      setDeductCents('')
      setDeductReason('')
    } catch (err) {
      setDeductError(userErrorMessage(err))
    } finally {
      setDeductBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (user === null) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/users"><ArrowLeft data-icon />返回</Link>
        </Button>
        <p className="text-sm text-destructive">{error ?? '用户不存在'}</p>
      </div>
    )
  }

  const previewItems = assets.map(assetToLightboxMedia)
  const currentPreviewAsset = preview === null ? undefined : assets[preview.index]

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/users"><ArrowLeft data-icon />返回</Link>
      </Button>
      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserAvatar userId={user.id} name={user.displayName} size="sm" className="shrink-0" />
            {user.email}
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role === 'admin' ? '管理员' : '用户'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">昵称</p>
              <p className="text-sm">{user.displayName ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">邮箱验证时间</p>
              <p className="text-sm">{user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : '未验证'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">注册时间</p>
              <p className="text-sm">{formatDate(user.createdAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">最近更新</p>
              <p className="text-sm">{formatDate(user.updatedAt)}</p>
            </div>
          </div>

          <div className="flex items-end gap-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select value={user.role} onValueChange={role => void handleRoleChange(role as 'user' | 'admin')} disabled={roleBusy}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGrantOpen(true)}>
                <Gift data-icon />
                赠送积分
              </Button>
              <Button variant="outline" onClick={() => setDeductOpen(true)}>
                <Minus data-icon />
                扣除积分
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t pt-4 text-center">
            {/* P1-09：账本字段即积分（1 积分 = 1 分），不再除 100 —— 之前把 5000 积分显示成 50。 */}
            <div>
              <p className="text-xs text-muted-foreground">可用积分</p>
              <p className="text-lg font-semibold">{balance?.availableCents ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">冻结积分</p>
              <p className="text-lg font-semibold">{balance?.reservedCents ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总积分</p>
              <p className="text-lg font-semibold">{balance?.totalCents ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>资产（{assets.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">该用户暂无资产</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
                {assets.map((asset, index) => (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => setPreview({ index })}
                    className="group relative aspect-square overflow-hidden rounded-md border text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    title={asset.fileName ?? asset.id}
                    aria-label={`预览资产 ${asset.fileName ?? asset.id}`}
                  >
                    {(asset.kind === 'image' || asset.kind === 'video') && (asset.thumbnailUrl ?? asset.url ?? asset.downloadUrl) ? (
                      <img
                        src={resolveApiUrl(asset.thumbnailUrl ?? asset.url ?? asset.downloadUrl)}
                        alt={asset.fileName ?? asset.id}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                        {asset.kind}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {assetCursor !== undefined && (
                <div className="flex justify-center pt-3">
                  <Button variant="outline" size="sm" disabled={assetsLoadingMore} onClick={() => void loadMoreAssets()}>
                    {assetsLoadingMore ? <Loader2 className="size-4 animate-spin" /> : '加载更多'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {preview !== null && previewItems.length > 0 && (
        <MediaLightbox
          items={previewItems}
          index={preview.index}
          onIndexChange={index => setPreview({ index })}
          onClose={() => setPreview(null)}
          downloadUrl={currentPreviewAsset?.downloadUrl !== undefined || currentPreviewAsset?.url !== undefined
            ? resolveApiUrl(currentPreviewAsset.downloadUrl ?? currentPreviewAsset.url ?? '')
            : undefined}
        />
      )}

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>赠送积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-amount">积分数量（1 元 = 100 积分）</Label>
              <Input id="grant-amount" type="number" min={1} step={1} value={grantCents} onChange={event => setGrantCents(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">备注（可选）</Label>
              <Input id="grant-reason" value={grantReason} onChange={event => setGrantReason(event.target.value)} />
            </div>
            {grantError !== null && <p className="text-sm text-destructive">{grantError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>取消</Button>
            <Button onClick={() => void handleGrant()} disabled={grantBusy}>
              {grantBusy ? <Loader2 className="size-4 animate-spin" /> : '赠送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deductOpen} onOpenChange={setDeductOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>扣除积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deduct-amount">扣除数量（1 元 = 100 积分，不能超过可用积分）</Label>
              <Input id="deduct-amount" type="number" min={1} step={1} value={deductCents} onChange={event => setDeductCents(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deduct-reason">备注（可选）</Label>
              <Input id="deduct-reason" value={deductReason} onChange={event => setDeductReason(event.target.value)} />
            </div>
            {deductError !== null && <p className="text-sm text-destructive">{deductError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeductOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => void handleDeduct()} disabled={deductBusy}>
              {deductBusy ? <Loader2 className="size-4 animate-spin" /> : '扣除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
