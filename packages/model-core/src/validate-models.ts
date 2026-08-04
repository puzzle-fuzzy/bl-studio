#!/usr/bin/env bun
/**
 * 手动巡检脚本：导入 MODEL_REGISTRY 并打印总数、按类别分布、关键模型命中情况。
 *
 * 用途是在新增或修改 manifest 后做一次人工 sanity check——它不是测试、不做
 * 断言，只看控制台输出。registry.ts 自身的加载时断言（唯一性 + 一致性）才是
 * 真正的硬性校验；本脚本只是辅助可视化。
 *
 * 运行：`bun run packages/model-core/src/validate-models.ts`
 */
import { MODEL_REGISTRY, listModels, getModelById } from './registry'

console.log('=== 模型注册验证 ===\n')

console.log('总模型数量:', MODEL_REGISTRY.length)
console.log('已启用模型数量:', listModels().length)
console.log('')

const byCategory = MODEL_REGISTRY.reduce((acc, m) => {
  acc[m.category] = (acc[m.category] || 0) + 1
  return acc
}, {} as Record<string, number>)

console.log('按类别统计:')
Object.entries(byCategory).forEach(([category, count]) => {
  console.log(`  ${category}: ${count}个`)
})
console.log('')

console.log('验证关键模型:')
const keyModels = [
  'qwen-image',
  'qwen-image-2.0-pro',
  'wanx-2.7-image-pro',
  'wanx-text-to-video',
  'vidu-text-to-video-pro',
  'wanx-2.7-text-to-video',
  'fun-music-v1',
  'paraformer-v1'
]

keyModels.forEach(id => {
  const model = getModelById(id)
  console.log(`  ${id}: ${model ? '✓ 找到' : '✗ 未找到'}`)
})

console.log('\n=== 验证完成 ===')
