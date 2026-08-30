import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { subModeOf, SUB_MODE_LABELS } from './model-modes'

/**
 * 生成模型的中文描述（「百炼 · 模式 · 品牌」）。
 *
 * 百炼 SDK 目前不提供 description 字段，这里从现有字段程序化推导：
 * provider=百炼（dashscope）+ capabilities 推导的模式（文生图/图生视频…）+ 品牌名。
 * 若日后 bailian-hub 暴露真实简介，可改为读 manifest.description。
 */
export function modelDescription(model: Pick<ModelCatalogItem, 'displayName' | 'category' | 'capabilities'>): string {
  const mode = SUB_MODE_LABELS[subModeOf(model)]
  return `百炼 · ${mode} · ${model.displayName}`
}
