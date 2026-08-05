import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { AdminAnalytics, ModelCatalogItem, ModelCost } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const CHART_CONFIG = {
  margin: { label: '毛利', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** 元 → 分。 */
function yuanToCents(yuan: string): number | null {
  const cents = Math.round(Number(yuan) * 100)
  return Number.isFinite(cents) && cents >= 0 ? cents : null
}

function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * 分析页：每模型成本毛利 + 留存漏斗。
 * 成本单价默认由 seed-model-costs 播种，管理员可在此按实际账单调整（占位值）。
 */
export function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [costs, setCosts] = useState<ModelCost[]>([])
  const [models, setModels] = useState<ModelCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [costEditOpen, setCostEditOpen] = useState(false)
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({})
  const [savingCosts, setSavingCosts] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [analyticsResult, costsResult, modelsResult] = await Promise.all([
        apiClient.adminGetAnalytics({ days }),
        apiClient.adminListModelCosts(),
        apiClient.getModels(),
      ])
      setAnalytics(analyticsResult)
      setCosts(costsResult.costs)
      setModels(modelsResult)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const costByModel = useMemo(() => {
    const map = new Map<string, number>()
    for (const cost of costs) map.set(cost.modelId, cost.unitCostCents)
    return map
  }, [costs])

  const openCostEditor = () => {
    const drafts: Record<string, string> = {}
    for (const model of models) {
      drafts[model.id] = centsToYuan(costByModel.get(model.id) ?? 0)
    }
    setCostDrafts(drafts)
    setCostEditOpen(true)
  }

  const saveCosts = async () => {
    const entries: Array<{ modelId: string; unitCostCents: number }> = []
    for (const [modelId, yuan] of Object.entries(costDrafts)) {
      const cents = yuanToCents(yuan)
      if (cents === null) continue
      if (cents !== (costByModel.get(modelId) ?? 0)) entries.push({ modelId, unitCostCents: cents })
    }
    if (entries.length === 0) {
      setCostEditOpen(false)
      return
    }
    setSavingCosts(true)
    try {
      await apiClient.adminUpdateModelCosts(entries)
      setCostEditOpen(false)
      await load()
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setSavingCosts(false)
    }
  }

  const chartData = useMemo(() => (analytics?.costMargin ?? []).map(row => ({
    model: row.label.length > 12 ? `${row.label.slice(0, 12)}…` : row.label,
    毛利: row.marginCents / 100,
  })), [analytics])

  const retentionStages = useMemo(() => {
    const r = analytics?.retention
    if (r === undefined) return []
    const base = Math.max(1, r.registered)
    return [
      { label: '注册用户', value: r.registered, pct: 100 },
      { label: '有首次生成', value: r.firstGeneration, pct: Math.round((r.firstGeneration / base) * 100) },
      { label: '有成功生成', value: r.firstSuccess, pct: Math.round((r.firstSuccess / base) * 100) },
      { label: '活跃（≥2 天生成）', value: r.activeTwoDays, pct: Math.round((r.activeTwoDays / base) * 100) },
    ]
  }, [analytics])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">运营分析</h1>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value={days}
            onChange={event => setDays(Number(event.target.value))}
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <Button size="sm" variant="outline" onClick={openCostEditor}>维护模型成本</Button>
        </div>
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Tabs defaultValue="margin">
          <TabsList>
            <TabsTrigger value="margin">成本毛利</TabsTrigger>
            <TabsTrigger value="retention">留存漏斗</TabsTrigger>
          </TabsList>
          <TabsContent value="margin" className="space-y-4 pt-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">各模型成本毛利（近 {days} 天）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-64">
                  <ChartContainer config={CHART_CONFIG} className="h-full w-full">
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="model" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="毛利" fill="var(--color-margin)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模型</TableHead>
                      <TableHead className="text-right">调用数</TableHead>
                      <TableHead className="text-right">收入（元）</TableHead>
                      <TableHead className="text-right">单位成本（元）</TableHead>
                      <TableHead className="text-right">成本（元）</TableHead>
                      <TableHead className="text-right">毛利（元）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analytics?.costMargin ?? []).map(row => (
                      <TableRow key={row.modelId}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{row.calls}</TableCell>
                        <TableCell className="text-right">{centsToYuan(row.revenueCents)}</TableCell>
                        <TableCell className="text-right">{centsToYuan(row.unitCostCents)}</TableCell>
                        <TableCell className="text-right">{centsToYuan(row.costCents)}</TableCell>
                        <TableCell className="text-right">{centsToYuan(row.marginCents)}</TableCell>
                      </TableRow>
                    ))}
                    {analytics?.costMargin.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">该窗口内暂无成功生成</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="retention" className="space-y-4 pt-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">留存漏斗（近 {days} 天注册）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {retentionStages.map((stage, index) => (
                  <div key={stage.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{index + 1}. {stage.label}</span>
                      <span className="text-muted-foreground">{stage.value} 人 · {stage.pct}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${stage.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={costEditOpen} onOpenChange={setCostEditOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>维护模型成本单价</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">成本单价用于「成本毛利」计算，按 DashScope 实际账单填写（元）。仅保存有改动的条目。</p>
            {models.map(model => (
              <div key={model.id} className="grid grid-cols-[1fr_140px] items-center gap-2">
                <Label htmlFor={`cost-${model.id}`} className="truncate text-sm font-normal">{model.displayName}</Label>
                <Input
                  id={`cost-${model.id}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={costDrafts[model.id] ?? '0.00'}
                  onChange={event => setCostDrafts(current => ({ ...current, [model.id]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostEditOpen(false)}>取消</Button>
            <Button onClick={() => void saveCosts()} disabled={savingCosts}>{savingCosts ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
