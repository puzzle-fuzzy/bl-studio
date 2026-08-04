/**
 * Bailian Studio 的基础错误类型。
 *
 * 当前真正被跨层消费的只有这条「主干」：
 *  - BailianStudioError：带 code / retryable / metadata 的结构化基类；
 *  - ErrorCode：code 的稳定字符串枚举；
 *  - ValidationError：输入校验错误（带 field），被 auth 包与 API 层使用。
 *
 * 各业务层目前各自定义自己的错误类型，并未统一继承本基类——例如
 * generation-repository 自造 RepositoryError、provider-dashscope 用 ProviderErrorInfo、
 * auth 用 AuthError。因此本文件【只保留
 * 实际被消费的主干】，不再保留没人用的 ProviderError / RepositoryError / SystemError 子类
 * 与 create*Error 工厂：那些只会造成「文档宣称统一、代码实际分裂」的误导，并和各层自造的
 * 同名类互相 shadow（例如本文件曾经的 RepositoryError 与 generation-repository 的同名类）。
 *
 * 若未来要做跨层统一的重试分类，可把各层错误类迁到继承 BailianStudioError，届时再把对应子类
 * 加回来。
 */

/**
 * 错误码枚举（稳定字符串）。当前仅 VALIDATION_* 被主干使用；其余类别保留为占位，
 * 供未来统一错误体系时复用。
 */
export enum ErrorCode {
  // 校验相关错误
  VALIDATION_INVALID_INPUT = 'VALIDATION_INVALID_INPUT',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_VALUE = 'VALIDATION_INVALID_VALUE',
  VALIDATION_TYPE_ERROR = 'VALIDATION_TYPE_ERROR',
}

/**
 * 所有 Bailian Studio 错误的基类。
 *
 * 携带结构化字段：
 *  - code：来自 ErrorCode 的稳定错误码，供日志、SSE、前端做条件分支使用；
 *  - retryable：是否建议重试；
 *  - metadata：自由结构的附加上下文，用于排障（如 provider 响应片段、SQL 状态码等）。
 */
export class BailianStudioError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public metadata?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'BailianStudioError'
    // 跳过本构造栈帧，使堆栈从「错误抛出点」开始而非这里，提升可读性。
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      metadata: this.metadata,
    }
  }
}

/**
 * 输入校验错误。携带 field 字段指向首个出错字段，便于 API 层把详细错误
 * 直接回传给前端做表单提示。
 */
export class ValidationError extends BailianStudioError {
  constructor(
    message: string,
    public field?: string,
    metadata?: Record<string, unknown>
  ) {
    super(ErrorCode.VALIDATION_INVALID_INPUT, message, false, metadata)
    this.name = 'ValidationError'
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
    }
  }
}
