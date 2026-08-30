export type AdminRepositoryErrorCode =
  | 'ADMIN_INVALID_CURSOR'
  | 'ADMIN_GENERATION_NOT_FOUND'
  | 'ADMIN_DATABASE_ERROR'

/** admin 跨域读模型的稳定错误契约，不复用 generation 生命周期错误。 */
export class AdminRepositoryError extends Error {
  constructor(
    public readonly code: AdminRepositoryErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AdminRepositoryError'
  }
}
