/**
 * 生成事件通知监听器：连接到 Postgres 的 `generation_events` 通道，把
 * `generation_events_notify` 触发器发出的 outbox 唤醒通知解析后投递给上层。
 *
 * 该模块是 worker → API 实时事件管线的接收端：worker 落库的状态变更由
 * Postgres 触发器 pg_notify 出来，这里 LISTEN 到之后转交给 SSE hub。
 * 负载的字段收窄统一用 `in` 守卫（不做强制类型断言），与 cursor.ts 的做法
 * 保持一致——避免把任意 JSON 误当成强类型对象使用。
 */
import { createNotificationListener, type NotificationListener } from '@bailian-studio/db'

export interface GenerationEventNotification {
  id: string
  recordId: string
  userId: string
  status: string
  modelId: string
  updatedAt: string
  createdAt: string
}

/**
 * 本模块所需的最小 logger 接口。在此就地定义（而不是 import @bailian-studio/shared）
 * 是因为本包除此之外并不依赖 shared。`@bailian-studio/shared` 的 Logger 在结构上满足
 * 该接口，所以调用方可以直接把 `createLogger(...)` 传进来。
 */
export interface GenerationEventListenerLogger {
  warn(message: string, meta?: Record<string, unknown>): void
}

export interface CreateGenerationEventListenerOptions {
  connectionString: string
  onEvent: (notification: GenerationEventNotification) => void | Promise<void>
  logger?: GenerationEventListenerLogger
}

const CHANNEL = 'generation_events'

/**
 * 监听 `generation_events` Postgres 通道（由 `generation_events_notify` 触发），
 * 并把解析后的通知投递给 `onEvent`。负载字段收窄使用 `in` 守卫，不做
 * 强制类型断言，与 cursor.ts 保持一致。
 */
export async function createGenerationEventListener(
  options: CreateGenerationEventListenerOptions,
): Promise<NotificationListener> {
  const logger = options.logger
  return createNotificationListener({
    connectionString: options.connectionString,
    channel: CHANNEL,
    onNotification: payload => {
      const notification = parseNotification(payload)
      if (notification !== undefined) {
        void options.onEvent(notification)
      } else {
        logger?.warn('listen.malformed_payload', { payload })
      }
    },
  })
}

function parseNotification(payload: string): GenerationEventNotification | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'id' in parsed && 'recordId' in parsed && 'userId' in parsed && 'status' in parsed &&
    'modelId' in parsed && 'updatedAt' in parsed && 'createdAt' in parsed &&
    typeof parsed.id === 'string' &&
    typeof parsed.recordId === 'string' &&
    typeof parsed.userId === 'string' &&
    typeof parsed.status === 'string' &&
    typeof parsed.modelId === 'string' &&
    typeof parsed.updatedAt === 'string' &&
    typeof parsed.createdAt === 'string'
  ) {
    return {
      id: parsed.id,
      recordId: parsed.recordId,
      userId: parsed.userId,
      status: parsed.status,
      modelId: parsed.modelId,
      updatedAt: parsed.updatedAt,
      createdAt: parsed.createdAt,
    }
  }
  return undefined
}
