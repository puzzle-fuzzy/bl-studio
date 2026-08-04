/**
 * Repository 层的错误类型定义。
 *
 * 整个 @bailian-studio/generation-repository 对外抛出的业务错误统一为
 * GenerationRepositoryError + 具体的 GenerationRepositoryErrorCode。上层（api / worker）据此
 * 做 404/400/409 等状态码映射，而不依赖字符串匹配 message。
 */

/** Repository 错误码：每个值对应一类可被上层识别的失败语义。 */
export type GenerationRepositoryErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'INVALID_GENERATION_PARAMS'
  | 'INVALID_CURSOR'
  | 'EVENT_CURSOR_EXPIRED'
  | 'GENERATION_NOT_FOUND'
  | 'GENERATION_NOT_CANCELLABLE'
  | 'GENERATION_NOT_RETRYABLE'
  | 'GENERATION_DAILY_LIMIT_EXCEEDED'
  | 'POINTS_INSUFFICIENT'
  | 'POINTS_ACCOUNT_NOT_FOUND'
  | 'POINTS_IDEMPOTENCY_CONFLICT'
  | 'POINTS_SETTLEMENT_ANOMALY'
  | 'ARTIFACT_NOT_FOUND'
  | 'ASSET_DERIVATIVE_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DATABASE_ERROR'

/**
 * Repository 层统一错误。`code` 是给上层做控制流判断的稳定枚举，
 * `details` 携带结构化的补充信息（如参数校验错误列表），`message` 仅供人读。
 */
export class GenerationRepositoryError extends Error {
  constructor(
    public readonly code: GenerationRepositoryErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'GenerationRepositoryError'
  }
}
