import { MessageScroller } from '@shadcn/react/message-scroller'
import {
  ArrowUp,
  FileText,
  ImageIcon,
  Lightbulb,
  LoaderCircle,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type WriterMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  time: string
  suggestions?: string[]
}

const INITIAL_MESSAGES: WriterMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      '你好，我是你的写作搭档。可以从一个模糊的念头开始，我会陪你一起找主题、搭结构，再把它写成完整内容。',
    time: '刚刚',
    suggestions: ['帮我找一个故事主题', '把这段话写得更有画面感', '为一篇文章搭一个大纲'],
  },
  {
    id: 'mock-user',
    role: 'user',
    content: '我想写一个关于“下班后重新开始”的短篇故事，希望它温暖一点，但不要太鸡汤。',
    time: '刚刚',
  },
  {
    id: 'mock-assistant',
    role: 'assistant',
    content:
      '这个主题很适合从一个具体的夜晚切入。比如：主角在深夜的便利店遇见一位正在练习拉小提琴的店员，两个人都在为“重新开始”寻找一点证据。\n\n如果你愿意，我们可以先从人物关系、故事冲突或第一段开场开始。',
    time: '刚刚',
    suggestions: ['先设计两个主角', '给我 3 个故事冲突', '直接写一个开场'],
  },
]

const MOCK_REPLIES = [
  '收到。我会先保留你的语气和意图，再给出一个可以继续修改的版本。你也可以补充受众、篇幅或想参考的风格。',
  '这个方向很有潜力。建议先确定一个具体场景，再让人物的选择推动内容往前走。需要我继续把它拆成提纲吗？',
  '我先记下这个想法。接下来可以继续完善人物、节奏和情绪曲线，右侧的图片资产面板之后也可以用来收集参考素材。',
]

export function WritingPage() {
  const [messages, setMessages] = useState<WriterMessage[]>(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')
  const [isResponding, setIsResponding] = useState(false)
  const responseTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (responseTimer.current !== null) window.clearTimeout(responseTimer.current)
    }
  }, [])

  const submitDraft = () => {
    const content = draft.trim()
    if (content.length === 0 || isResponding) return

    setMessages(current => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        time: '刚刚',
      },
    ])
    setDraft('')
    setIsResponding(true)
    responseTimer.current = window.setTimeout(() => {
      setMessages(current => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: MOCK_REPLIES[current.length % MOCK_REPLIES.length] ?? '',
          time: '刚刚',
        },
      ])
      setIsResponding(false)
      responseTimer.current = null
    }, 850)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitDraft()
    }
  }

  const handleSuggestion = (suggestion: string) => {
    setDraft(suggestion)
  }

  const handleNewConversation = () => {
    if (responseTimer.current !== null) {
      window.clearTimeout(responseTimer.current)
      responseTimer.current = null
    }
    setMessages(INITIAL_MESSAGES.slice(0, 1))
    setDraft('')
    setIsResponding(false)
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-2rem)] min-h-0 w-full max-w-[1500px] flex-col gap-5">
      <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <PenLine className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">写作</h1>
              <Badge variant="secondary">对话草稿</Badge>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              把零散的灵感交给写作搭档，一起完成构思、改写和成稿。
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleNewConversation}>
          <Plus data-icon="inline-start" />
          新建对话
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_auto_minmax(280px,320px)]">
        <section aria-labelledby="writing-chat-title" className="flex min-h-0 min-w-0 flex-col lg:pr-6">
          <div className="flex shrink-0 items-center justify-between py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 id="writing-chat-title" className="truncate text-sm font-medium">
                  未命名写作对话
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  写作搭档已准备好
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="更多对话操作" disabled>
              <MoreHorizontal />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <MessageScroller.Provider autoScroll defaultScrollPosition="end" scrollPreviousItemPeek={56}>
              <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <MessageScroller.Viewport aria-label="写作对话内容" className="min-h-0 flex-1 overflow-y-auto">
                  <MessageScroller.Content className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
                    {messages.map(message => (
                      <MessageScroller.Item
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === 'user'}
                        className={cn('flex w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'flex max-w-[min(92%,46rem)] items-start gap-3',
                            message.role === 'user' && 'flex-row-reverse',
                          )}
                        >
                          <div
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground',
                              message.role === 'user' ? 'bg-foreground text-background' : 'bg-muted',
                            )}
                          >
                            {message.role === 'user' ? <span className="text-xs font-semibold">我</span> : <Sparkles className="size-4" />}
                          </div>
                          <div className={cn('flex min-w-0 flex-col gap-1.5', message.role === 'user' && 'items-end')}>
                            <div
                              className={cn(
                                'whitespace-pre-wrap text-sm leading-7',
                                message.role === 'user'
                                  ? 'rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-primary-foreground'
                                  : 'max-w-2xl text-foreground',
                              )}
                            >
                              {message.content}
                            </div>
                            <span className="px-1 text-[11px] text-muted-foreground">{message.time}</span>
                            {message.suggestions !== undefined && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {message.suggestions.map(suggestion => (
                                  <Button
                                    key={suggestion}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 rounded-full bg-background text-xs"
                                    onClick={() => handleSuggestion(suggestion)}
                                  >
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </MessageScroller.Item>
                    ))}

                    {isResponding && (
                      <MessageScroller.Item messageId="typing-indicator" className="flex w-full justify-start">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                            <Sparkles className="size-4" />
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" />
                            正在整理你的想法…
                          </div>
                        </div>
                      </MessageScroller.Item>
                    )}
                  </MessageScroller.Content>
                </MessageScroller.Viewport>
                <MessageScroller.Button
                  direction="end"
                  aria-label="回到最新消息"
                  className="absolute bottom-4 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  <ArrowUp className="rotate-180" />
                </MessageScroller.Button>
              </MessageScroller.Root>
            </MessageScroller.Provider>

            <Separator />
            <form
              onSubmit={handleSubmit}
              className="sticky bottom-0 shrink-0 bg-background/95 px-4 pb-4 pt-3 backdrop-blur-sm md:px-5"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl bg-muted/30 p-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/20">
                <Textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="告诉我你想写什么…"
                  aria-label="写作内容"
                  rows={3}
                  className="min-h-20 resize-none border-0 bg-transparent px-1 py-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                  disabled={isResponding}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="添加附件" disabled>
                      <Paperclip />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="写作提示" disabled>
                      <Lightbulb />
                    </Button>
                    <span className="hidden text-xs text-muted-foreground sm:inline">Enter 发送 · Shift + Enter 换行</span>
                  </div>
                  <Button type="submit" size="icon" aria-label="发送消息" disabled={draft.trim().length === 0 || isResponding}>
                    <ArrowUp />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <Separator orientation="vertical" className="hidden h-full lg:block" />
        <Separator className="my-4 lg:hidden" />

        <aside aria-labelledby="writing-assets-title" className="flex min-h-0 flex-col lg:pl-6">
          <div className="flex shrink-0 items-start justify-between py-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ImageIcon className="size-4" />
              </div>
              <div>
                <h2 id="writing-assets-title" className="text-sm font-medium">
                  图片资产
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">后续用于收集对话中的视觉素材</p>
              </div>
            </div>
            <Badge variant="outline">即将接入</Badge>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 py-3">
            <div className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-2xl bg-muted/20 px-6 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm">
                <ImageIcon className="size-6" />
              </div>
              <h3 className="text-sm font-medium">这里还没有图片资产</h3>
              <p className="mt-2 max-w-56 text-xs leading-5 text-muted-foreground">
                后续可以在这里查看对话生成的配图、参考图和已收藏的灵感素材。
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-5" disabled>
                <Paperclip data-icon="inline-start" />
                添加图片
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3 py-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileText className="size-3.5" />
                <span>资产会与当前对话关联</span>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="资产面板说明" disabled>
                <MoreHorizontal />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
