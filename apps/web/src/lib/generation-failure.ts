import type { GenerationRecord } from '@bailian-studio/api-client'

/**
 * 把一条失败的生成记录收敛为可在详情页展示的失败信息。
 *
 * 数据来自两个字段：
 *  - `statusReason`：任务状态机写入的简述（可能为英文 provider 原文）；
 *  - `errorJson`：结构化的 { code, message, category, retriable, details }，
 *    其中 message 是 provider 返回的错误原文。
 *
 * 这里保持「原文可查」——失败详情页是排障面，用户需要看到 provider 到底
 * 说了什么，而不是被一层本地化文案遮住。展示层再决定如何排版。
 */
export interface GenerationFailureView {
  /** provider 错误原文（errorJson.message）。 */
  message: string | undefined
  /** 状态机写入的简述；与 message 相同时去重。 */
  statusReason: string | undefined
  /** provider 错误码（如 InvalidParameter）。 */
  code: string | undefined
  /** 错误分类（validation/provider/network/timeout…）。 */
  category: string | undefined
  /** 是否可重试。 */
  retriable: boolean | undefined
  /** provider 原始细节（部分错误携带，如任务失败时的 output.code/message）。 */
  details: Record<string, unknown> | undefined
}

export function describeGenerationFailure(record: GenerationRecord): GenerationFailureView {
  const error = record.errorJson
  return {
    message: error?.message,
    statusReason:
      record.statusReason !== undefined && record.statusReason !== error?.message
        ? record.statusReason
        : undefined,
    code: error?.code,
    category: error?.category,
    retriable: error?.retriable,
    details: error?.details,
  }
}
