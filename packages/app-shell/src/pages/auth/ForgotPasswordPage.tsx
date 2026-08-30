import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@bailian-studio/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { useAuthStore } from '../../stores/auth-store'
import { notifyError } from '@bailian-studio/lib-client'

/** 忘记密码：提交邮箱后显示统一提示（防账号枚举）。 */
export function ForgotPasswordPage() {
  const forgotPassword = useAuthStore(state => state.forgotPassword)
  const [email, setEmail] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsPending(true)
    try {
      await forgotPassword(email)
      setSubmitted(true)
    } catch (err) {
      notifyError(err)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>重置密码</CardTitle>
          <CardDescription>输入注册邮箱，我们将发送重置链接（30 分钟内有效）。</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-center text-sm text-muted-foreground">
              如果该邮箱已注册，你会收到一封重置邮件，请查收。
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">邮箱</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? '发送中…' : '发送重置链接'}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/login" className="hover:text-foreground">
              返回登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
