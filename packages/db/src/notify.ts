/**
 * Postgres LISTEN/NOTIFY transport：实时事件管道的底层装配。
 *
 * 本模块是 worker→API 的状态变更实时推送链路的基础设施（见 CLAUDE.md
 * "Live event pipeline (SSE)"）：
 *
 *  1. generation repository 在同一事务边界内写 generation_records 与
 *     generation_events，并负责安装 generation trigger；
 *  2. API 进程通过 createNotificationListener 在独立连接上 `LISTEN
 *     generation_events`，通知只作为唤醒信号，实际事件从 outbox 追读；
 *  3. SSE 端点通过 Last-Event-ID 从 generation_events 做断线补偿。
 *
 * 该机制让 worker 完全不必感知 API 的存在，无需 WebSocket 或额外 RPC。
 */

import postgres from 'postgres'

/**
 * LISTEN 连接句柄。close() 关闭底层连接，结束监听并释放资源。
 */
export interface NotificationListener {
  close(): Promise<void>
}

export interface CreateNotificationListenerOptions {
  /** Postgres 连接串。 */
  connectionString: string
  /** 要监听的 NOTIFY 通道名，例如 `generation_events`。 */
  channel: string
  /** 收到通知时的回调，入参为 pg_notify 的原始 payload 字符串。 */
  onNotification: (payload: string) => void
}

/**
 * 开启一条专用 LISTEN 连接并阻塞监听指定通道。
 *
 * postgres-js 的 `listen` 自带连接管理（独占一条连接）且断线自动重连，因此
 * 这里把连接池上限设为 1 即可。`max: 1` 是必须的——LISTEN 是长连接独占行为，
 * 多余连接既无用也浪费。监听期间 channel 上每条通知都会触发 onNotification；
 * close() 调用 `sql.end()` 终止连接，从而停止监听。
 *
 * 失败语义：若 `sql.listen` 在建连阶段就抛错（如通道名非法、权限不足），
 * 主动 end 掉连接后再向上抛，避免泄漏一条已建立但未注册回调的连接。
 */
export async function createNotificationListener(
  options: CreateNotificationListenerOptions,
): Promise<NotificationListener> {
  const sql = postgres(options.connectionString, { max: 1 })
  try {
    await sql.listen(options.channel, options.onNotification)
  } catch (error) {
    await sql.end()
    throw error
  }
  return {
    async close() {
      await sql.end()
    },
  }
}
