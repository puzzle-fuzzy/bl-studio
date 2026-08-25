import { useEffect, useState } from 'react'
import { Loader2, MessageSquare, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VirtualScrollArea } from '@/components/ui/virtual-scroll-area'
import { useNotificationsStore } from '@/stores/notifications-store'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'
import type { UserFeedback } from '@bailian-studio/api-client'

const KIND_LABELS: Record<string, string> = {
  feedback: '意见反馈',
  bug: '问题反馈',
  suggestion: '功能建议',
  complaint: '投诉',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'destructive',
  reviewing: 'secondary',
  resolved: 'default',
  closed: 'outline',
}

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

/** 意见反馈弹窗：类型 + 内容 → POST /api/feedback；下方展示本人历史提交记录。 */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [kind, setKind] = useState('feedback')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [history, setHistory] = useState<UserFeedback[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // 打开弹窗时拉取我的反馈历史（提交后关闭，下次打开自动刷新）。
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHistoryLoading(true)
    apiClient
      .listMyFeedback({ limit: 20 })
      .then(page => {
        if (!cancelled) setHistory(page.items)
      })
      .catch(err => {
        if (!cancelled) notifyError(err)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const handleSubmit = async () => {
    if (content.trim().length === 0) {
      notifyError('请填写反馈内容')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.submitFeedback({ kind: kind as 'feedback' | 'bug' | 'suggestion' | 'complaint', content: content.trim() })
      setContent('')
      setKind('feedback')
      onOpenChange(false)
      showMessage({ title: '已提交，感谢反馈', tone: 'success' })
    } catch (err) {
      notifyError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <MessageSquare data-icon className="size-4" />
            意见反馈
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>类型</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-content">内容</Label>
            <Textarea
              id="feedback-content"
              rows={5}
              maxLength={2000}
              value={content}
              onChange={event => setContent(event.target.value)}
              placeholder="告诉我们你的建议或遇到的问题…"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <History data-icon className="size-4" />
            我的提交记录
          </p>
          {historyLoading ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> 加载中…
            </p>
          ) : history.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">还没有提交过反馈，你的历史记录会显示在这里。</p>
          ) : (
            <VirtualScrollArea className="max-h-52">
              <div className="space-y-2 pr-3 pb-1">
                {history.map(item => {
                  return (
                    <div key={item.id} className="rounded-md border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{KIND_LABELS[item.kind] ?? item.kind}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      </div>
                      <p className="mt-1 text-sm line-clamp-3 whitespace-pre-wrap wrap-break-word">{item.content}</p>
                      <Badge variant={STATUS_VARIANTS[item.status] ?? 'secondary'} className="mt-1.5">
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </VirtualScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : '提交'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
