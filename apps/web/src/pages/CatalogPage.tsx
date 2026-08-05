import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useModelCatalogStore } from '@/stores/model-catalog-store'
import { categoryLabel } from '@/lib/labels'
import { modelDescription } from '@/lib/model-description'

const CATEGORIES = ['all', 'image', 'video', 'audio', 'text'] as const
type Category = (typeof CATEGORIES)[number]

/** 全部模型：分类 Tab + 模型卡片（中文描述 + 去创作）。 */
export function CatalogPage() {
  const models = useModelCatalogStore(state => state.models)
  const load = useModelCatalogStore(state => state.load)
  const navigate = useNavigate()
  const [category, setCategory] = useState<Category>('all')

  useEffect(() => {
    void load()
  }, [load])

  const filtered = category === 'all' ? models : models.filter(model => model.category === category)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">全部模型</h1>
        <p className="text-sm text-muted-foreground">
          当前可用生成模型 {models.length} 个，全部由百炼契约驱动。
        </p>
      </div>

      <Tabs value={category} onValueChange={value => setCategory(value as Category)}>
        <TabsList className="flex w-full max-w-xl">
          {CATEGORIES.map(item => (
            <TabsTrigger key={item} value={item} className="flex-1">
              {item === 'all' ? '全部' : categoryLabel(item)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(model => (
          <Card key={model.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                {model.displayName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">{modelDescription(model)}</p>
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                className="w-full"
                onClick={() => navigate(`/create?select=${encodeURIComponent(model.id)}`)}
              >
                使用此模型
                <ArrowRight data-icon />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
