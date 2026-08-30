import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MailCheck } from 'lucide-react'
import { Button } from '@bailian-studio/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@bailian-studio/ui'
import { useAuthStore } from '../../stores/auth-store'
import { notifyError } from '@bailian-studio/lib-client'

/** 注册后提示检查邮箱；支持重发验证邮件（带冷却）。 */
export function CheckEmailPage() {
  // R2-P0-01：展示用掩码（displayEmail），重发用真实邮箱（pendingVerificationEmail），二者分离。
  const pendingEmail = useAuthStore(state => state.pendingVerificationEmail)
  const pendingDisplayEmail = useAuthStore(state => state.pendingVerificationDisplayEmail)
  const resendAvailableAt = useAuthStore(state => state.pendingVerificationResendAvailableAt)
  const resend = useAuthStore(state => state.resendVerification)
  const navigate = useNavigate()

  const [clock, setClock] = useState(() => Date.now())
  const [message, setMessage] = useState<string | null>(null)
  const email = pendingEmail ?? ''
  const displayEmail = pendingDisplayEmail ?? ''
  const cooldown = resendAvailableAt === null
    ? 0
    : Math.max(0, Math.ceil((Date.parse(resendAvailableAt) - clock) / 1000))

  useEffect(() => {
    if (resendAvailableAt === null) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt])

  const handleResend = async () => {
    if (email === '' || cooldown > 0) return
    try {
      await resend(email)
      setMessage('验证邮件已重新发送，请查收')
    } catch (err) {
      notifyError(err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex justify-center">
            <MailCheck className="size-10 text-primary" />
          </div>
          <CardTitle className="text-center">请检查你的邮箱</CardTitle>
          <CardDescription className="text-center">
            我们已向{displayEmail !== '' ? `「${displayEmail}」` : '你的邮箱'}发送验证链接，请点击完成验证后再登录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {message !== null && <p className="text-center text-sm text-emerald-600">{message}</p>}
          <Button type="button" variant="outline" className="w-full" onClick={() => void handleResend()} disabled={cooldown > 0}>
            {cooldown > 0 ? `${cooldown}s 后可重发` : '重新发送验证邮件'}
          </Button>
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            <button type="button" className="hover:text-foreground" onClick={() => navigate('/login')}>
              返回登录
            </button>
            <Link to="/auth/forgot-password" className="hover:text-foreground">
              邮箱验证遇到问题？
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
