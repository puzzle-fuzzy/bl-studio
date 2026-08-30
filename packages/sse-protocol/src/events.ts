/**
 * 实时事件总线的事件类型目录。
 *
 * 在 worker→API→前端 的实时事件管线中，本包处于"协议契约"的位置：
 *  1. worker 完成或推进一次生成时，仅做一次 DB 写入（repository 状态机迁移）；
 *  2. Postgres 把状态事件写入 generation_events outbox，再以 NOTIFY 唤醒 API
 *     的 LISTEN 连接；
 *  3. API 的 event-listener 把通知重新发布到 GenerationSseHub；
 *  4. hub 把事件通过 SSE 推给前端。
 *
 * 本文件定义这条链路上流动的事件名（BailianStudioSSEEventMap）与各事件的载荷形状，
 * 同时提供生成事件相关的状态枚举、按用户划分频道的命名约定，以及"状态→事件名"
 * 的映射辅助。
 */

/**
 * 生成记录的状态枚举。
 *
 * 各状态语义：
 *  - `draft`：记录已创建但尚未提交到 provider（提交前的草稿态）。
 *  - `submitting`：已入队 generation.submit 任务，等待 worker 认领并首次调用 provider。
 *  - `processing`：repository 内部中间态——worker 已认领 submit 任务但尚未取得
 *    provider 的 polling 句柄。注意它是 repository 专用的中间值，并非 sse-protocol
 *    在线事件流中独立广播的状态（见下方 GenerationEventPayload.status 说明）。
 *  - `provider_processing`：provider 已接收任务、正在生成（worker 进入轮询阶段）。
 *  - `saving_output`：provider 已返回结果，正在持久化 artifact。
 *  - `succeeded` / `failed` / `cancelled`：三个终态。
 *
 * 注意：sse-protocol 这一层并不直接依赖此 union 做收发——线上 status 通过 DB 的
 * 文本列经 NOTIFY 流出，消费端按不透明字符串处理（见 GenerationEventPayload.status）。
 */
export type GenerationStatus =
  | 'draft'
  | 'submitting'
  | 'processing'
  | 'provider_processing'
  | 'saving_output'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/**
 * 生成类事件的载荷。
 *
 * recordId / userId 标识事件归属；modelId 用于前端区分展示；updatedAt 是 ISO 字符串，
 * 便于跨边界传递（DB 端是 Date，到这一层已序列化为字符串）。
 */
export interface GenerationEventPayload {
  recordId: string
  userId: string
  // 这里用 `string` 而非 GenerationStatus union：status 经由 DB 的 status 文本列
  // 通过 NOTIFY 流出（含 repository 专用的 `processing` 中间值），SSE 消费端对它
  // 作不透明处理——使用 string 可避免在 API listener 边界处做强制类型转换。
  status: string
  modelId: string
  updatedAt: string
  statusReason?: string
  providerTaskId?: string
}

/** 在线状态快照/变更事件的载荷：当前在线的 userId 列表。 */
export interface PresencePayload {
  userIds: string[]
}

/** 通用通知事件的载荷：消息文本与可选级别（默认按 info 处理）。 */
export interface NotificationPayload {
  message: string
  level?: 'info' | 'warning' | 'error'
  /**
   * 归属用户 id（SSE hub 按 userId 分桶推送）。携带时事件被推送到该用户的
   * generation 频道；不携带时仍可被订阅方收到（当前 hub 只路由带 userId 的事件）。
   */
  userId?: string
}

/** 导演实体发生变化时的实时失效提示。实体本身仍以 API 查询结果为准。 */
export interface DirectorEntitiesChangedPayload {
  userId: string
  /** 删除候选时服务端可能无法从删除结果中携带项目 id，前端应回退失效整个 director 查询根。 */
  projectId?: string
  candidateId: string
  reason: 'candidate_reviewed' | 'candidate_deleted'
}

/**
 * 全平台 SSE 事件目录：事件名 → 载荷形状的映射。
 *
 * 其中 generation.* 由生成管线发布；connected / heartbeat 由 SSE 连接建立时
 * 与保活心跳发送；presence.* 与 notification 为预留的通用通道。
 */
export interface BailianStudioSSEEventMap {
  connected: { serverTime: string }
  heartbeat: { serverTime: string }
  'generation.status': GenerationEventPayload
  'generation.completed': GenerationEventPayload
  'generation.failed': GenerationEventPayload
  'generation.cancelled': GenerationEventPayload
  'presence.snapshot': PresencePayload
  'presence.changed': PresencePayload
  notification: NotificationPayload
  'director.entities.changed': DirectorEntitiesChangedPayload
}

/**
 * 由 BailianStudioSSEEventMap 派生的"判别联合"：每个事件名与对应载荷打包成的
 * `{ event, data }` 形状的总和。这是生成管线在 TS 层面的强类型事件表达。
 */
export type BailianStudioSSEEvent = {
  [EventName in keyof BailianStudioSSEEventMap]: { id?: string; event: EventName; data: BailianStudioSSEEventMap[EventName] }
}[keyof BailianStudioSSEEventMap]

/** 所有 generation.* 事件名的提取联合。 */
export type GenerationEventName = Extract<keyof BailianStudioSSEEventMap, `generation.${string}`>
/** 按事件名查表得到的载荷类型。 */
export type GenerationEventData<TEvent extends GenerationEventName> = BailianStudioSSEEventMap[TEvent]

/** 所有 director.* 事件名的提取联合。 */
export type DirectorEventName = Extract<keyof BailianStudioSSEEventMap, `director.${string}`>
/** 按事件名查表得到的导演事件载荷类型。 */
export type DirectorEventData<TEvent extends DirectorEventName> = BailianStudioSSEEventMap[TEvent]

/** 类型安全的导演事件构造器。导演事件不进入 generation_events outbox，只作实时失效提示。 */
export function makeDirectorEvent<TEvent extends DirectorEventName>(
  event: TEvent,
  data: DirectorEventData<TEvent>,
): { event: TEvent; data: DirectorEventData<TEvent> } {
  return { event, data }
}

/**
 * 构造某个用户专属的 generation 频道名。
 *
 * GenerationSseHub 按 `generation:<userId>` 分桶缓存事件，SSE 端点连接时只 drain
 * 当前会话用户对应的那一桶——通过把频道名锚定在 userId 上，避免跨用户泄漏事件。
 */
export function generationChannel(userId: string): string {
  return `generation:${userId}`
}

/**
 * 类型安全的生成事件构造器：传入事件名与对应载荷，返回强类型的 `{ event, data }`。
 * 调用方无需手动写 as 断言即可获得正确的载荷类型推导。
 */
export function makeGenerationEvent<TEvent extends GenerationEventName>(
  event: TEvent,
  data: GenerationEventData<TEvent>,
): { event: TEvent; data: GenerationEventData<TEvent> } {
  return { event, data }
}

/**
 * 把一个 status 字符串映射为 SSE 上应当发出的生成事件名。
 *
 * 三个终态（succeeded/failed/cancelled）映射到专用事件，方便前端按事件名直接
 * 路由到完成/失败/取消的处理分支；其余所有状态——包括「记录刚创建」的初始态
 * 与所有过渡态（draft/submitting/processing/provider_processing/saving_output
 * 等）——一律映射到通用的 `generation.status`，由前端按需读取 payload.status
 * 细分。创建事件没有独立的名字（P2-21）：创建即首个 status 事件，从 outbox
 * 流出，listener 与 POST 路由用同一名字发布，hub 再按事件 id 去重。
 */
export function generationEventNameForStatus(status: string): GenerationEventName {
  switch (status) {
    case 'succeeded': return 'generation.completed'
    case 'failed': return 'generation.failed'
    case 'cancelled': return 'generation.cancelled'
    default: return 'generation.status'
  }
}
