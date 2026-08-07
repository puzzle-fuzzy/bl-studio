/**
 * model-core 领域错误。manifest 驱动的校验与解析层用此类型向调用方（provider 执行层、
 * generation-repository）报告可识别的契约问题，替代已删除的
 * BailianStudioBailianAdapterError。
 *
 * 定价与参数校验本身不抛错（保守回退）；本错误只用于"结构断言"路径——响应形状
 * 不符、端点解析失败等必须让调用方明确知道的异常。
 */
export class ModelCoreError extends Error {
  readonly code: string
  readonly details: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ModelCoreError'
    this.code = code
    this.details = details
  }
}
