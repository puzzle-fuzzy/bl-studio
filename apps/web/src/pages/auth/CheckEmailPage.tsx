import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { userErrorMessage } from '@/lib/user-error'

/** 注册后提示检查邮箱；支持重发验证邮件（带冷却）。 */
export function CheckEmailPage() {
  const pendingEmail = useAuthStore(state => state.pendingVerificationEmail)
  const resend = useAuthStore(state => state.resendVerification)
  const navigate = useNavigate()

  const [cooldown, setCooldown] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const email = pendingEmail ?? ''

  const handleResend = async () => {
    if (email === '' || cooldown > 0) return
    setError(null)
    try {
      await resend(email)
      setMessage('验证邮件已重新发送，请查收')
      setCooldown(60)
      const timer = setInterval(() => {
        setCooldown(current => {
          if (current <= 1) {
            clearInterval(timer)
            return 0
          }
          return current - 1
        })
      }, 1000)
    } catch (err) {
      setError(userErrorMessage(err))
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
            我们已向{email !== '' ? `「${email}」` : '你的邮箱'}发送验证链接，请点击完成验证后再登录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {message !== null && <p className="text-center text-sm text-emerald-600">{message}</p>}
          {error !== null && <p className="text-center text-sm text-destructive">{error}</p>}
          <Button variant="outline" className="w-full" onClick={() => void handleResend()} disabled={cooldown > 0}>
            {cooldown > 0 ? `${cooldown}s 后可重发` : '重新发送验证邮件'}
          </Button>
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            <button className="hover:text-foreground" onClick={() => navigate('/login')}>
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
