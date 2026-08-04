import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandMark } from '@/components/shared/BrandMark'
import { useAuthStore } from '@/stores/auth-store'
import { userErrorMessage } from '@/lib/user-error'

/** 登录/注册页（访客路由）。登录成功按 cb 参数安全回跳。 */
export function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const login = useAuthStore(state => state.login)
  const register = useAuthStore(state => state.register)
  const isPending = useAuthStore(state => state.isPending)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const callback = searchParams.get('cb')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        const verificationRequired = await register(email, password, displayName || undefined)
        navigate(verificationRequired ? '/auth/check-email' : '/create')
        return
      }
      navigate(callback ?? '/create')
    } catch (err) {
      setError(userErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/20 p-4">
      <BrandMark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'login' ? '登录' : '注册'}</CardTitle>
          <CardDescription>
            {mode === 'login' ? '登录后即可开始创作' : '注册后请前往邮箱完成验证'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="login-display-name">昵称（可选）</Label>
                <Input
                  id="login-display-name"
                  maxLength={100}
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="login-email">邮箱</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">密码</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={256}
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>
            {error !== null && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
            </Button>
            {mode === 'login' && (
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/auth/forgot-password" className="hover:text-foreground">
                  忘记密码？
                </Link>
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              {mode === 'login' ? '还没有账号？' : '已有账号？'}
              <button
                type="button"
                className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? '去注册' : '去登录'}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
