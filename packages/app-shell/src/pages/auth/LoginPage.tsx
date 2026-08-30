import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { resolvePostLoginRedirect } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Separator } from '@bailian-studio/ui'
import { LoginWordmark } from '../../auth/LoginWordmark'
// import { LiquidSandBackground } from '../../auth/LiquidSandBackground'
import { useAuthStore } from '../../stores/auth-store'
import { canResendVerification } from '@bailian-studio/lib-client'
import { notifyError } from '@bailian-studio/lib-client'

/** GitHub Octocat 图标（lucide 已移除品牌图标，内联 SVG）。 */
function GithubMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

/** GitHub OAuth 失败码 → 用户可读提示。 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: '你已取消 GitHub 授权，可继续使用邮箱登录。',
  invalid_state: 'GitHub 授权校验未通过，请重试。',
  login_failed: 'GitHub 登录失败，请重试或使用邮箱登录。',
}

/** 登录/注册页（访客路由）。登录成功按 cb 参数安全回跳。 */
export function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const login = useAuthStore(state => state.login)
  const register = useAuthStore(state => state.register)
  const resendVerification = useAuthStore(state => state.resendVerification)
  const isPending = useAuthStore(state => state.isPending)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [verificationResendAvailable, setVerificationResendAvailable] = useState(false)
  const [isResending, setIsResending] = useState(false)

  const callback = searchParams.get('cb')
  const oauthErrorCode = searchParams.get('oauth_error')
  const oauthError = oauthErrorCode !== null ? (OAUTH_ERROR_MESSAGES[oauthErrorCode] ?? 'GitHub 登录失败，请重试。') : null

  useEffect(() => {
    if (oauthError !== null) notifyError(oauthError)
  }, [oauthError])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setVerificationResendAvailable(false)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        const verificationRequired = await register(email, password, displayName || undefined)
        navigate(verificationRequired ? '/auth/check-email' : '/create')
        return
      }
      // P1-11：cb 回跳过白名单校验（防开放重定向），非法值 fail-closed 回退 /create。
      navigate(resolvePostLoginRedirect(callback, '/create', [window.location.origin]))
    } catch (err) {
      notifyError(err)
      setVerificationResendAvailable(mode === 'login' || canResendVerification(err))
    }
  }

  const handleResend = async () => {
    if (email.trim() === '') return
    setIsResending(true)
    try {
      await resendVerification(email)
      navigate('/auth/check-email')
    } catch (err) {
      notifyError(err)
    } finally {
      setIsResending(false)
    }
  }

  const showResend = email.trim() !== '' && verificationResendAvailable

  return (
    <div className="login-page auth-page">
      {/* 暂时关闭流动背景，测试完成后可恢复这一行。 */}
      {/* <LiquidSandBackground /> */}
      <div className="login-page__veil" aria-hidden="true" />
      <main className="login-page__content">
        <div className="login-page__form-wrap">
          <div className="login-wordmark-wrap mb-5 flex justify-center">
            <LoginWordmark />
          </div>
          <Card className="login-card w-full max-w-sm">
            <CardHeader className="gap-2 pb-5">
              <CardTitle className="text-xl">{mode === 'login' ? '账户访问' : '创建账户'}</CardTitle>
              <CardDescription>
                {mode === 'login' ? '登录工作台，继续整理你的短剧素材。' : '创建账户，开始管理你的短剧素材。'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === 'register' && (
                  <div className="space-y-2">
                    <Label htmlFor="login-display-name">昵称（可选）</Label>
                    <Input
                      id="login-display-name"
                      maxLength={100}
                      className="h-auto py-2"
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="login-email">邮箱地址</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    className="h-auto py-2"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="login-password">密码</Label>
                    {mode === 'login' && (
                      <Link
                        to="/auth/forgot-password"
                        title="找回密码"
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        忘记密码？
                      </Link>
                    )}
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={8}
                    maxLength={256}
                    className="h-auto py-2"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-5">
                  {showResend && (
                    <Button type="button" variant="outline" className="h-auto w-full py-2" disabled={isResending} onClick={() => void handleResend()}>
                      {isResending ? '发送中…' : '如果账号尚未验证，重发验证邮件'}
                    </Button>
                  )}
                  <Button type="submit" className="h-auto w-full py-2" disabled={isPending} title={mode === 'login' ? '登录工作台' : '创建账户'}>
                    {isPending ? '请稍候…' : mode === 'login' ? '登录工作台' : '创建账户'}
                  </Button>
                  {mode === 'login' && (
                    <>
                      <div className="flex items-center gap-3">
                        <Separator className="flex-1" />
                        <span className="text-xs text-muted-foreground">或</span>
                        <Separator className="flex-1" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto w-full py-2"
                        title="使用 GitHub 登录"
                        disabled={isPending}
                        onClick={() => window.location.assign('/api/auth/github')}
                      >
                        <GithubMark data-icon />
                        使用 GitHub 登录
                      </Button>
                    </>
                  )}
                  <p className="text-center text-sm text-muted-foreground">
                    {mode === 'login' ? '还没有账号？' : '已有账号？'}
                    <button
                      type="button"
                      title={mode === 'login' ? '切换到注册' : '切换到登录'}
                      className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                      onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                    >
                      {mode === 'login' ? '去注册' : '去登录'}
                    </button>
                  </p>
                  {mode === 'register' && (
                    <p className="text-center text-xs leading-5 text-muted-foreground">
                      注册即表示你同意
                      <Link to="/terms" title="服务条款" className="mx-1 underline underline-offset-2">服务条款</Link>
                      和
                      <Link to="/privacy" title="隐私政策" className="ml-1 underline underline-offset-2">隐私政策</Link>。
                    </p>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
