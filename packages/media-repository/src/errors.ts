export type MediaRepositoryErrorCode =
  | 'MEDIA_JOB_NOT_FOUND'
  | 'MEDIA_JOB_INVALID_OPERATION'
  | 'MEDIA_SOURCE_ASSET_NOT_FOUND'
  | 'MEDIA_ASSEMBLY_INPUT_INVALID'
  | 'MEDIA_JOB_ALREADY_COMPLETED'
  | 'DATABASE_ERROR'

export class MediaRepositoryError extends Error {
  constructor(
    readonly code: MediaRepositoryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MediaRepositoryError'
  }
}
