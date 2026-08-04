import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { List } from 'react-window'
import { Button } from '@/components/ui/button'
import type { GenerationRecord } from '@bailian-studio/api-client'
import { GenerationListItem } from '@/components/generations/GenerationListItem'
import { GenerationStatusFilter } from '@/components/generations/GenerationStatusFilter'
import { useGenerationsStore } from '@/stores/generations-store'

/**
 * 任务面板。embedded 形态展示最近任务（创作页侧栏）；page 形态为完整渲染队列
 * （状态筛选 + react-window 虚拟滚动 + 加载更多）。
 */
export function GenerationsPanel({ variant = 'embedded' }: { variant?: 'embedded' | 'page' }) {
  const navigate = useNavigate()
  const records = useGenerationsStore(state => state.records)
  const hasLoaded = useGenerationsStore(state => state.hasLoaded)
  const isLoading = useGenerationsStore(state => state.isLoading)
  const load = useGenerationsStore(state => state.load)

  useEffect(() => {
    if (!hasLoaded && !isLoading) void load()
  }, [hasLoaded, isLoading, load])

  const open = (id: string) => navigate(`/generations/${id}`)

  if (variant === 'embedded') {
    const recent = records.slice(0, 5)
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">最近任务</p>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {isLoading ? '加载中…' : '还没有生成任务，开始你的第一个创作吧'}
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map(record => (
              <GenerationListItem key={record.id} record={record} onOpen={open} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return <PageVariant />
}

function PageVariant() {
  const navigate = useNavigate()
  const records = useGenerationsStore(state => state.records)
  const nextCursor = useGenerationsStore(state => state.nextCursor)
  const isLoadingMore = useGenerationsStore(state => state.isLoadingMore)
  const loadMore = useGenerationsStore(state => state.loadMore)
  const setViewFilters = useGenerationsStore(state => state.setViewFilters)

  const open = (id: string) => navigate(`/generations/${id}`)

  return (
    <div className="space-y-3">
      <GenerationStatusFilter onFiltersChange={setViewFilters} />
      <div className="h-[calc(100vh-16rem)] min-h-64 overflow-hidden rounded-lg border">
        <List<TaskRowProps>
          rowCount={records.length}
          rowHeight={80}
          rowComponent={TaskRow}
          rowProps={{ records, onOpen: open }}
          overscanCount={6}
          className="h-full"
        />
      </div>
      {nextCursor !== undefined && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
            {isLoadingMore ? '加载中…' : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  )
}

interface TaskRowProps {
  records: readonly GenerationRecord[]
  onOpen: (id: string) => void
}

function TaskRow({ index, style, records, onOpen }: { index: number; style: CSSProperties } & TaskRowProps) {
  const record = records[index]
  if (record === undefined) return null
  return (
    <div style={style} className="px-1.5 pb-1.5">
      <GenerationListItem record={record} onOpen={onOpen} className="h-full" />
    </div>
  )
}

/** 用 ResizeObserver 测量容器宽高（供需要像素列宽的场景，如 Library 网格）。 */
export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect !== undefined) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}
