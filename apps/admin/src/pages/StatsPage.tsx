import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import type { AdminStatsOverview } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Card, CardContent, CardHeader, CardTitle } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@bailian-studio/ui'

const OTHER_KEY = '__other__'
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

interface CallRow {
  hour: string
  [key: string]: string | number
}

export function StatsPage() {
  // Batch 0c 参考模式：useQuery 替代 useState/useEffect/cancelled 样板。
  // 缓存键 ['admin','stats','overview'] 供批量操作后的 invalidateQueries 复用。
  const { data: overview, isPending, error } = useQuery({
    queryKey: ['admin', 'stats', 'overview'],
    queryFn: () => apiClient.adminGetStatsOverview(),
  })

  const callsView = useMemo(() => (overview === null || overview === undefined ? null : buildCallsView(overview)), [overview])
  const registrations = useMemo(
    () => (overview === null || overview === undefined ? [] : buildRegistrationsData(overview.registrationsByDay)),
    [overview],
  )

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (overview === null || overview === undefined) {
    return <p className="text-sm text-destructive">{error !== null ? userErrorMessage(error) : '统计加载失败'}</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">调用统计</h1>
      {error !== null && <p className="text-sm text-destructive">{userErrorMessage(error)}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="今日调用" value={overview.todayCalls} />
        <StatCard label="今日新增注册" value={overview.todayNewUsers} />
        <StatCard label="总用户数" value={overview.totalUsers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>今日各模型调用趋势（按小时）</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.todayCalls === 0 || callsView === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">今日暂无调用</p>
          ) : (
            <ChartContainer config={callsView.config} className="aspect-auto h-72 w-full">
              <AreaChart data={callsView.data} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {callsView.top.map(modelId => (
                  <Area
                    key={modelId}
                    dataKey={modelId}
                    type="monotone"
                    stackId="1"
                    fill={`var(--color-${modelId})`}
                    fillOpacity={0.6}
                    stroke={`var(--color-${modelId})`}
                  />
                ))}
                <Area
                  dataKey={OTHER_KEY}
                  type="monotone"
                  stackId="1"
                  fill={`var(--color-${OTHER_KEY})`}
                  fillOpacity={0.6}
                  stroke={`var(--color-${OTHER_KEY})`}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>每日新增注册（近 14 天）</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={REGISTRATIONS_CONFIG} className="aspect-auto h-64 w-full">
            <AreaChart data={registrations} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <defs>
                <linearGradient id="fill-registrations" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Area dataKey="count" type="monotone" fill="url(#fill-registrations)" stroke="var(--color-count)" />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>今日各模型调用明细</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.callsByModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">今日暂无调用</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead className="text-right">今日调用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.callsByModel.map(row => (
                  <TableRow key={row.modelId}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const REGISTRATIONS_CONFIG: ChartConfig = {
  count: { label: '新增注册', color: 'hsl(var(--chart-1))' },
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  )
}

/**
 * 把后端扁平数据（byHour: {hour, modelId, count}）pivot 成面积图数据：
 * x = UTC 小时（0..当前小时），按今日调用量取 Top 5 模型为独立 series，
 * 其余并入「其他」。area 图为堆叠。
 */
function buildCallsView(overview: AdminStatsOverview): { top: string[]; data: CallRow[]; config: ChartConfig } {
  const currentHour = new Date().getUTCHours()
  const hours = Array.from({ length: currentHour + 1 }, (_, i) => i)

  const totalByModel = new Map<string, number>()
  for (const row of overview.callsByModel) totalByModel.set(row.modelId, row.count)
  const ranked = [...totalByModel.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 5).map(([modelId]) => modelId)
  const labelByModel = new Map(overview.callsByModel.map(row => [row.modelId, row.label]))

  const byHourIndex = new Map<string, Map<number, number>>()
  for (const row of overview.callsByHour) {
    let perHour = byHourIndex.get(row.modelId)
    if (perHour === undefined) {
      perHour = new Map()
      byHourIndex.set(row.modelId, perHour)
    }
    perHour.set(row.hour, (perHour.get(row.hour) ?? 0) + row.count)
  }

  const data: CallRow[] = hours.map(hour => {
    const row: CallRow = { hour: `${String(hour).padStart(2, '0')}:00` }
    for (const modelId of top) row[modelId] = byHourIndex.get(modelId)?.get(hour) ?? 0
    let other = 0
    for (const [modelId, perHour] of byHourIndex) {
      if (!top.includes(modelId)) other += perHour.get(hour) ?? 0
    }
    row[OTHER_KEY] = other
    return row
  })

  const config: ChartConfig = {}
  top.forEach((modelId, index) => {
    config[modelId] = { label: labelByModel.get(modelId) ?? modelId, color: CHART_COLORS[index] }
  })
  config[OTHER_KEY] = { label: '其他', color: 'hsl(var(--muted-foreground))' }

  return { top, data, config }
}

/** 近 14 天逐日注册数（缺失日补 0，保证面积图连续）。 */
function buildRegistrationsData(registrationsByDay: Array<{ date: string; count: number }>): Array<{ date: string; count: number }> {
  const countByDate = new Map(registrationsByDay.map(row => [row.date, row.count]))
  const now = new Date()
  const days: Array<{ date: string; count: number }> = []
  for (let offset = 13; offset >= 0; offset--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset))
    const date = day.toISOString().slice(0, 10)
    days.push({ date: date.slice(5), count: countByDate.get(date) ?? 0 })
  }
  return days
}
