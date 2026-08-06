import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/ui/user-avatar'
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
  const changePassword = useAuthStore(state => state.changePassword)
  const showMessage = useNotificationsStore(state => state.showMessage)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

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

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    setPasswordError(null)
    setChangingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      showMessage({ title: '密码已修改', tone: 'success', description: '其他设备将需要重新登录' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(userErrorMessage(err))
    } finally {
      setChangingPassword(false)
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
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>{PASSWORD_RULES}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-current">当前密码</Label>
              <Input
                id="profile-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-new">新密码</Label>
              <Input
                id="profile-new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={256}
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-confirm">确认新密码</Label>
              <Input
                id="profile-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            {passwordError !== null && <p className="text-sm text-destructive">{passwordError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? <Loader2 className="size-4 animate-spin" /> : '保存'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
