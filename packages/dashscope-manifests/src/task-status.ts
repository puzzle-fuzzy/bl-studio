/**
 * 异步任务状态分类（纯函数）。
 *
 * 直接读 manifest.transport.polling 声明的终态集合，不再依赖 SDK：
 *  - 命中 succeededValues → 'succeeded'
 *  - 命中 failedValues → 'failed'
 *  - 其余（含未知状态）→ 'pending'——pending 语义是"继续轮询"，未知状态不该在此
 *    判终态；响应边界的未知状态拦截由 response-shape.ts 负责。
 *
 * 无 polling transport 的模型（sync/stream）不会走到这里；防御性返回 'pending'。
 */
import type { FrozenModelManifest } from '@bailian-studio/model-core'

export type TaskLifecycle = 'pending' | 'succeeded' | 'failed'

export function classifyTaskStatus(
  manifest: FrozenModelManifest,
  providerStatus: string,
): TaskLifecycle {
  const polling = manifest.transport.mode === 'provider_async'
    ? manifest.transport.polling
    : undefined
  const normalized = providerStatus.toUpperCase()
  if (polling?.succeededValues.some(value => value.toUpperCase() === normalized)) return 'succeeded'
  if (polling?.failedValues.some(value => value.toUpperCase() === normalized)) return 'failed'
  return 'pending'
}
