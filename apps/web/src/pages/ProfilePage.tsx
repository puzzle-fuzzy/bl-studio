import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/ui/user-avatar'
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { userErrorMessage } from '@/lib/user-error'

const AVATAR_RULES = '支持 PNG / JPEG / WEBP 格式，大小不超过 2MB；未上传时使用自动生成的标识头像。'
const PASSWORD_RULES = '密码长度为 8–256 个字符'

/**
 * 个人信息页（/settings）：头像 / 昵称+邮箱 / 修改密码 三张标准设置卡片。
 * 各卡片独立保存与 loading；邮箱只读（用于登录与找回密码，不可修改）。
 * 所有操作走 auth-store，成功后即时同步侧栏与全局 user。
 */
export function ProfilePage() {
  const user = useAuthStore(state => state.user)
  const updateProfile = useAuthStore(state => state.updateProfile)
  const uploadAvatar = useAuthStore(state => state.uploadAvatar)
  const removeAvatar = useAuthStore(state => state.removeAvatar)
  const unlinkGithub = useAuthStore(state => state.unlinkGithub)
  const showMessage = useNotificationsStore(state => state.showMessage)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [unlinkingGithub, setUnlinkingGithub] = useState(false)

  // 头像/昵称更新后 store 的 user 会刷新，这里同步输入框初值。
  useEffect(() => {
    if (user !== null) setDisplayName(user.displayName ?? '')
  }, [user])

  if (user === null) return null

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateProfile(displayName.trim())
      showMessage({ title: '昵称已更新', tone: 'success' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleUploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 允许连续选择同一个文件。
    event.target.value = ''
    if (file === undefined) return
    setUploadingAvatar(true)
    try {
      await uploadAvatar(file)
      showMessage({ title: '头像已更新', tone: 'success' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    try {
      await removeAvatar()
      showMessage({ title: '已恢复默认头像', tone: 'success' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">个人信息</h1>
        <p className="text-sm text-muted-foreground">管理你的头像、昵称与登录密码。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>头像</CardTitle>
          <CardDescription>{AVATAR_RULES}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <UserAvatar userId={user.id} name={user.displayName} className="size-16" />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleUploadAvatar}
            />
            <Button size="sm" variant="outline" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
              {uploadingAvatar ? <Loader2 className="size-4 animate-spin" /> : '更换头像'}
            </Button>
            {user.hasAvatar && (
              <Button size="sm" variant="ghost" disabled={uploadingAvatar} onClick={() => void handleRemoveAvatar()}>
                移除头像
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>个人信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-display-name">昵称</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              maxLength={100}
              placeholder="怎么称呼你？"
              onChange={event => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">邮箱</Label>
            <Input id="profile-email" value={user.email} disabled />
            <p className="text-xs text-muted-foreground">邮箱用于登录与找回密码，不可修改。</p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile || displayName.trim().length === 0}
            >
              {savingProfile ? <Loader2 className="size-4 animate-spin" /> : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">密码</p>
            <p className="text-sm text-muted-foreground">
              {user.passwordAuthEnabled ? PASSWORD_RULES : '当前账号尚未设置邮箱密码。'}
            </p>
          </div>
          {user.passwordAuthEnabled ? (
            <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
              修改密码
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/auth/forgot-password">通过邮箱设置</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {user.githubLinked && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-6">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-sm text-muted-foreground">已绑定 GitHub 登录。</p>
            </div>
            <Button
              variant="outline"
              disabled={unlinkingGithub || !user.passwordAuthEnabled}
              onClick={() => {
                setUnlinkingGithub(true)
                void unlinkGithub()
                  .then(() => showMessage({ title: 'GitHub 已解绑', tone: 'success' }))
                  .catch(err => showMessage({ title: userErrorMessage(err), tone: 'warning' }))
                  .finally(() => setUnlinkingGithub(false))
              }}
            >
              {unlinkingGithub ? <Loader2 className="size-4 animate-spin" /> : '解绑 GitHub'}
            </Button>
          </CardContent>
        </Card>
      )}

      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </div>
  )
}
