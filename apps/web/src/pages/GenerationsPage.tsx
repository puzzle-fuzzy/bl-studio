import { GenerationsPanel } from '@/components/generations/GenerationsPanel'
import { useGenerationsStore } from '@/stores/generations-store'

/** 渲染队列页：状态筛选 + 虚拟滚动列表 + SSE 实时更新。 */
export function GenerationsPage() {
  const activeCount = useGenerationsStore(state =>
    state.records.filter(record => ['submitting', 'processing', 'provider_processing', 'saving_output'].includes(record.status)).length,
  )

  return (
    <div className="mx-auto flex w-full max-w-[1660px] flex-col gap-5">
      <header className="border-b border-border/70 pb-5">
        <h1 className="text-2xl font-semibold">生成任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeCount > 0 ? `${activeCount} 个任务进行中，实时更新。` : '当前没有进行中的任务。'}
        </p>
      </header>
      <GenerationsPanel variant="page" />
    </div>
  )
}
