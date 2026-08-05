import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuthStore } from '@/stores/admin-auth-store'

/** 管理后台登录：仅邮箱/密码（复用主站会话）。 */
export function LoginPage() {
  const navigate = useNavigate()
  const login = useAdminAuthStore(state => state.login)
  const lastError = useAdminAuthStore(state => state.lastError)
  const isPending = useAdminAuthStore(state => state.isPending)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate('/users', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>管理后台登录</CardTitle>
          <CardDescription>请使用管理员账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">邮箱</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">密码</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>
            {(error !== null || lastError !== null) && (
              <p className="text-sm text-destructive">{error ?? lastError}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '请稍候…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
