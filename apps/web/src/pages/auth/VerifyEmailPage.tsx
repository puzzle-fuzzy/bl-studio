import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { notifyError } from '@/lib/toast'

/** 邮箱验证落地页：消费 URL fragment 中的 `#token=`，成功后建立会话。 */
export function VerifyEmailPage() {
  const verifyEmail = useAuthStore(state => state.verifyEmail)
  const navigate = useNavigate()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')

  useEffect(() => {
    const token = extractFragmentToken()
    if (token === null) {
      setStatus('error')
      const message = '验证链接缺少 token，请从邮件中打开完整链接'
      notifyError(message)
      return
    }
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error')
        notifyError(err)
      })
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex justify-center">
            {status === 'verifying' && <Loader2 className="size-10 animate-spin text-muted-foreground" />}
            {status === 'success' && <CheckCircle2 className="size-10 text-emerald-500" />}
            {status === 'error' && <XCircle className="size-10 text-destructive" />}
          </div>
          <CardTitle className="text-center">
            {status === 'verifying' ? '正在验证…' : status === 'success' ? '验证成功' : '验证失败'}
          </CardTitle>
          <CardDescription className="text-center">
            {status === 'error' ? '验证链接无效或已过期，请重新发送验证邮件。' : '你的邮箱已通过验证'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'success' && (
            <Button className="w-full" onClick={() => navigate('/create')}>
              开始创作
            </Button>
          )}
          {status === 'error' && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => navigate('/auth/check-email')}>
                重新发送验证邮件
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="hover:text-foreground">
                  返回登录
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** 从 URL fragment 提取 `#token=xxx`，并清除 hash（防止 token 进入日志/历史）。 */
function extractFragmentToken(): string | null {
  const hash = window.location.hash
  const match = /#token=([^&]+)/.exec(hash)
  const token = match?.[1] ?? null
  if (token !== null) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return token
}
