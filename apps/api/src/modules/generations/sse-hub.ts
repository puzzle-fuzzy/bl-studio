import { encodeSSE, generationChannel, type BailianStudioSSEEvent } from '@bailian-studio/event-bus'

type Listener = (chunk: string) => void

export interface GenerationSseSubscription {
  buffered: string[]
  unsubscribe: () => void
}

/**
 * 每个 channel 缓冲的事件上限。无在线订阅者时事件进缓冲，等首次连接 drain；
 * 一个长期不重连的用户若不断有生成完成，无上限缓冲会无限堆积在内存里。
 * 超出上限时丢弃最旧的事件，避免单个用户的慢连接造成无限增长。
 */
const BUFFER_CAP = 64

export class GenerationSseHub {
  private readonly buffers = new Map<string, string[]>()
  private readonly seenEventIds = new Set<string>()
  /**
   * 长连接订阅者：channel → 监听器集合。SSE 端点在连接打开时 subscribe，
   * 连接关闭/取消时调用返回的 unsubscribe。publish 时除了写缓冲（兼容旧的一次性
   * drain 路径），还实时推送给活跃监听器，从而让 EventSource 保持打开并即时收到事件。
   */
  private readonly listeners = new Map<string, Set<Listener>>()

  publish(event: BailianStudioSSEEvent): void {
    if (!event.event.startsWith('generation.')) return
    if (event.id !== undefined) {
      if (this.seenEventIds.has(event.id)) return
      this.seenEventIds.add(event.id)
      // Keep deduplication bounded; durable replay is still governed by the
      // client's Last-Event-ID and the repository outbox.
      if (this.seenEventIds.size > 10_000) {
        const oldest = this.seenEventIds.values().next().value
        if (typeof oldest === 'string') this.seenEventIds.delete(oldest)
      }
    }
    const data = event.data as { userId?: unknown }
    if (typeof data.userId !== 'string') return

    const channel = generationChannel(data.userId)
    const encoded = encodeSSE(event)

    // 关键语义：事件只走「其中一条」交付路径，不重复。
    //  - 若该 channel 当前有在线订阅者：实时推送给它们，且【不写入缓冲】——
    //    否则订阅者断线重连后 drain 会把已经实时收到的同一事件再发一遍，
    //    导致前端重复失效与陈旧事件重放。
    //  - 若没有在线订阅者：写入缓冲，供「先 publish 后连接」的事件在首次连接时
    //    被 drain 一次性取走。
    const channelListeners = this.listeners.get(channel)
    if (channelListeners !== undefined && channelListeners.size > 0) {
      for (const listener of channelListeners) listener(encoded)
      return
    }

    const existing = this.buffers.get(channel) ?? []
    existing.push(encoded)
    // Cap per-channel buffer so a perpetually-absent subscriber can't grow it
    // without bound; drop the oldest event when over the cap.
    if (existing.length > BUFFER_CAP) existing.shift()
    this.buffers.set(channel, existing)
  }

  drain(userId: string): string[] {
    const channel = generationChannel(userId)
    const events = this.buffers.get(channel) ?? []
    this.buffers.delete(channel)
    return [...events]
  }

  /**
   * 订阅某用户的 SSE 频道，返回取消订阅函数。
   * 调用方应在 ReadableStream 的 cancel 回调里调用返回值，避免监听器泄漏。
   */
  subscribe(userId: string, listener: Listener): () => void {
    const channel = generationChannel(userId)
    const listeners = this.listeners.get(channel) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(channel, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(channel)
    }
  }

  /**
   * Atomically attach a listener and take the events that arrived before the
   * connection opened. JavaScript runs this synchronous section without
   * interleaving a publish, so an event cannot fall between drain and
   * subscribe during SSE setup.
   */
  subscribeAndDrain(userId: string, listener: Listener): GenerationSseSubscription {
    const unsubscribe = this.subscribe(userId, listener)
    return { buffered: this.drain(userId), unsubscribe }
  }

  clear(): void {
    this.buffers.clear()
    this.listeners.clear()
    this.seenEventIds.clear()
  }
}
