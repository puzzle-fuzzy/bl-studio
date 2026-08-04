import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { userErrorMessage } from '@/lib/user-error'

/** 重置密码：消费 URL fragment 中的 `#token=`，设置新密码后跳转登录。 */
export function ResetPasswordPage() {
  const resetPassword = useAuthStore(state => state.resetPassword)
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [missingToken, setMissingToken] = useState(false)

  useEffect(() => {
    if (extractFragmentToken() === null) setMissingToken(true)
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const token = extractFragmentToken()
    if (token === null) {
      setMissingToken(true)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setError(null)
    setIsPending(true)
    try {
      await resetPassword(token, newPassword)
      navigate('/login?reset=1')
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>设置新密码</CardTitle>
          <CardDescription>重置链接 30 分钟内有效，新密码长度 8–256 个字符。</CardDescription>
        </CardHeader>
        <CardContent>
          {missingToken ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">重置链接缺少 token，请从邮件中打开完整链接。</p>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/auth/forgot-password" className="hover:text-foreground">
                  重新获取重置链接
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-new">新密码</Label>
                <Input
                  id="reset-new"
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
                <Label htmlFor="reset-confirm">确认新密码</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              {error !== null && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? '提交中…' : '重置密码'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function extractFragmentToken(): string | null {
  const match = /#token=([^&]+)/.exec(window.location.hash)
  const token = match?.[1] ?? null
  if (token !== null) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return token
}
