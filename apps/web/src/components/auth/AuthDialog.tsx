import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolvePostLoginRedirect } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { useAuthDialogStore } from '@/stores/auth-dialog-store'
import { canResendVerification } from '@/lib/user-error'
import { notifyError } from '@/lib/toast'

/** 全局登录/注册弹窗（模式可切换，登录后安全回跳）。 */
export function AuthDialog() {
  const isOpen = useAuthDialogStore(state => state.isOpen)
  const mode = useAuthDialogStore(state => state.mode)
  const callback = useAuthDialogStore(state => state.callback)
  const close = useAuthDialogStore(state => state.close)
  const switchMode = useAuthDialogStore(state => state.switchMode)
  const login = useAuthStore(state => state.login)
  const register = useAuthStore(state => state.register)
  const resendVerification = useAuthStore(state => state.resendVerification)
  const isPending = useAuthStore(state => state.isPending)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [verificationResendAvailable, setVerificationResendAvailable] = useState(false)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [isResending, setIsResending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setVerificationResendAvailable(false)
    try {
      if (mode === 'login') {
        await login(email, password)
        // P1-11：cb 回跳过白名单校验，非法值 fail-closed 回退 /create。
        const target = resolvePostLoginRedirect(callback, '/create', [window.location.origin])
        close()
        navigate(target)
      } else {
        const requiresVerification = await register(email, password, displayName || undefined)
        close()
        if (requiresVerification) {
          navigate('/auth/check-email')
        } else {
          navigate('/create')
        }
      }
      setEmail('')
      setPassword('')
      setDisplayName('')
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
      close()
      navigate('/auth/check-email')
    } catch (err) {
      notifyError(err)
    } finally {
      setIsResending(false)
    }
  }

  const showResend = email.trim() !== '' && verificationResendAvailable

  const handleOpenChange = (open: boolean) => {
    if (!open) close()
  }

  return (
    <Dialog open={isOpen || verificationRequired} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? '登录' : '注册'}</DialogTitle>
          <DialogDescription>
            {verificationRequired
              ? '请前往注册邮箱完成验证后登录。'
              : mode === 'login'
                ? '登录后即可开始创作。'
                : '注册后请前往邮箱完成验证。'}
          </DialogDescription>
        </DialogHeader>
        {verificationRequired ? (
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => {
                setVerificationRequired(false)
                navigate('/auth/check-email')
              }}
            >
              前往验证邮箱
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setVerificationRequired(false)}>
              返回登录
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-display-name">昵称（可选）</Label>
                <Input
                  id="auth-display-name"
                  maxLength={100}
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">邮箱</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-password">密码</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={256}
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>
            {showResend && (
              <Button type="button" variant="outline" className="w-full" disabled={isResending} onClick={() => void handleResend()}>
                {isResending ? '发送中…' : '如果账号尚未验证，重发验证邮件'}
              </Button>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
            </Button>
            {mode === 'login' && (
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/auth/forgot-password')}
              >
                忘记密码？
              </button>
            )}
            <p className="text-center text-sm text-muted-foreground">
              {mode === 'login' ? '还没有账号？' : '已有账号？'}
              <button
                type="button"
                className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? '去注册' : '去登录'}
              </button>
            </p>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              注册即表示你同意
              <Link to="/terms" className="mx-1 underline underline-offset-2" onClick={close}>服务条款</Link>
              和
              <Link to="/privacy" className="ml-1 underline underline-offset-2" onClick={close}>隐私政策</Link>。
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
