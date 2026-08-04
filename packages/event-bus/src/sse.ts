/**
 * SSE 线路格式的编码器。
 *
 * 这是 worker→API→前端 实时管线的最后一站：API 的 GenerationSseHub
 * 把每个事件交给 encodeSSE 序列化为符合 SSE 协议规范的文本块，再写入 SSE 响应流。
 * 编码规则遵循 WHATWG Server-Sent Events 规约：
 *  - `event: <name>\n` 指明事件类型；
 *  - `data:` 行按 JSON 序列化后的 `\n` 分段，每段前缀 `data: `（多行 data 的标准写法，
 *    保证 JSON 中的换行不会被前端 EventSource 误切断）；
 *  - 末尾追加一个空行（`\n\n`）作为事件块结束符，触发前端派发。
 *
 * 生成管线的各类事件复用同一个编码器，区别仅在事件名。
 */
import type { BailianStudioSSEEvent } from './events'

/**
 * encodeSSE 实际消费的结构形态。
 *
 * 生成管线使用强类型的 BailianStudioSSEEvent 联合（事件名受限于 BailianStudioSSEEventMap 的 key）；
 * 因此这里把参数声明为开放的结构形态（任意 event 字符串 + 任意 data），而非封闭的联合。
 */
export interface SseMessage {
  /** Browser reconnect cursor. Omitted for connection/heartbeat messages. */
  id?: string
  event: string
  data: unknown
}

/**
 * 把单个事件编码为一段符合 SSE 规范的文本块。
 *
 * 步骤：先 JSON.stringify(data)，再按 `\n` 切行（每行各自带一个 `data:` 前缀，
 * 防止 JSON 内换行被 EventSource 切成多事件），最后拼上 `event:` 头与空行结束符。
 */
export function encodeSSE(message: SseMessage): string {
  const json = JSON.stringify(message.data)
  const dataLines = json.split('\n').map(line => `data: ${line}`).join('\n')
  const idLine = message.id === undefined ? '' : `id: ${message.id}\n`
  return `${idLine}event: ${message.event}\n${dataLines}\n\n`
}

export type { BailianStudioSSEEvent }
