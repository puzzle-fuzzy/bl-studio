import { generationEventNameForStatus, makeGenerationEvent, type GenerationEventName, type GenerationEventPayload, type BailianStudioSSEEvent } from '@bailian-studio/event-bus'
import {
  createGenerationEventListener,
  ensureGenerationEventsTrigger,
  type GenerationRepository,
  type GenerationEventNotification,
  type NotificationListener,
} from '@bailian-studio/generation-repository'
import { createLogger, type Logger } from '@bailian-studio/shared'

export interface GenerationSsePublisher {
  publish(event: BailianStudioSSEEvent): void
}

export interface StartGenerationEventListenerOptions {
  connectionString: string
  repository: GenerationRepository
  hub: GenerationSsePublisher
  logger?: Logger
}

/**
 * 纯映射函数，导出供单元测试使用。`GenerationEventPayload.status` 是 `string`，
 * 因此 notification.status 可以无需类型断言直接流入。
 */
export function generationEventFromNotification(
  notification: GenerationEventNotification,
): { id: string; event: GenerationEventName; data: GenerationEventPayload } {
  return {
    id: notification.id,
    ...makeGenerationEvent(
      generationEventNameForStatus(notification.status),
      {
        recordId: notification.recordId,
        userId: notification.userId,
        status: notification.status,
        modelId: notification.modelId,
        updatedAt: notification.updatedAt,
      },
    ),
  }
}

/**
 * 确保 trigger 已安装，然后监听 generation_events 并把每个事件重发布为
 * hub 中的 SSE 事件。hub 会推送给在线 SSE 订阅者，并为下一次连接保留
 * 有界的连接前缓冲。
 */
export async function startGenerationEventListener(
  options: StartGenerationEventListenerOptions,
): Promise<NotificationListener> {
  const logger = options.logger ?? createLogger('generation-event-listener')
  await ensureGenerationEventsTrigger(options.connectionString)
  let cursor = await options.repository.getLatestGenerationEvent()
  let draining: Promise<void> | undefined
  let drainRequested = false
  const drain = async (): Promise<void> => {
    if (draining !== undefined) {
      drainRequested = true
      return draining
    }
    draining = (async () => {
      do {
        // 前一次查询进行期间可能又有 NOTIFY 到达。用一个脏位保证该通知不会
        // 被 in-flight 的 promise 吞掉；下一轮严格在推进后的游标之后读取。
        drainRequested = false
        const events = await options.repository.listGenerationEvents({
          ...(cursor === undefined
            ? {}
            : {
                afterCursor: {
                  id: cursor.id,
                  createdAt: cursor.createdAt,
                },
              }),
          limit: 500,
        })
        for (const event of events) {
          options.hub.publish(generationEventFromNotification(event))
          cursor = event
        }
      } while (drainRequested)
    })().finally(() => {
      const rerun = drainRequested
      draining = undefined
      if (rerun) void drain()
    })
    return draining
  }

  const listener = await createGenerationEventListener({
    connectionString: options.connectionString,
    logger,
    onEvent: () => { void drain() },
  })
  // 消除「读取启动游标」与「注册 LISTEN」之间的竞态：该窗口内提交的所有内容
  // 都在 outbox 中，监听器就绪后会立即被 drain。
  await drain()
  return listener
}
