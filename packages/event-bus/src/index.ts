/**
 * @bailian-studio/event-bus 的公共出口（barrel re-export）。
 *
 * 暴露的公共表面分两类：
 *  - 事件目录与生成事件辅助：GenerationStatus 状态枚举、BailianStudioSSEEventMap 事件目录、
 *    generationChannel（按用户划分的 SSE 频道命名）、generationEventNameForStatus
 *    （状态→事件名映射）、makeGenerationEvent（强类型事件构造器）；
 *  - SSE 线路编码：encodeSSE 与 SseMessage。
 *
 * 该包被 apps/api 的 SSE hub 与 event-listener 复用；
 * 它本身是 leaf 包，仅依赖类型，不引入 DB / provider / React / Elysia。
 */
export { generationChannel, generationEventNameForStatus, makeDirectorEvent, makeGenerationEvent } from './events'
export { encodeSSE, type SseMessage } from './sse'
export type {
  GenerationEventData,
  GenerationEventName,
  GenerationEventPayload,
  GenerationStatus,
  DirectorEntitiesChangedPayload,
  DirectorEventData,
  DirectorEventName,
  NotificationPayload,
  PresencePayload,
  BailianStudioSSEEvent,
  BailianStudioSSEEventMap,
} from './events'
