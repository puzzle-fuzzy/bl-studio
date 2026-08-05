import { useState } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNotificationsStore } from '@/stores/notifications-store'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'

const KIND_LABELS: Record<string, string> = {
  feedback: '意见反馈',
  bug: '问题反馈',
  suggestion: '功能建议',
  complaint: '投诉',
}

/** 意见反馈弹窗：类型 + 内容 → POST /api/feedback。 */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [kind, setKind] = useState('feedback')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (content.trim().length === 0) {
      setError('请填写反馈内容')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.submitFeedback({ kind: kind as 'feedback' | 'bug' | 'suggestion' | 'complaint', content: content.trim() })
      setContent('')
      setKind('feedback')
      onOpenChange(false)
      showMessage({ title: '已提交，感谢反馈', tone: 'success' })
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
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
