export type CreativeAssetRepositoryErrorCode =
  | 'CREATIVE_PROJECT_NOT_FOUND'
  | 'CREATIVE_PROJECT_STATE_INVALID'
  | 'CREATIVE_ASSET_NOT_FOUND'
  | 'CREATIVE_ASSET_STATUS_INVALID'
  | 'CREATIVE_ASSET_ALREADY_ATTACHED'
  | 'CREATIVE_PROJECT_ASSET_NOT_FOUND'
  | 'CREATIVE_ASSET_VERSION_NOT_FOUND'
  | 'CREATIVE_ASSET_VERSION_STATE_INVALID'
  | 'CREATIVE_ASSET_REFERENCE_NOT_FOUND'
  | 'CREATIVE_ASSET_REFERENCE_INVALID'
  | 'CREATIVE_INVALID_CURSOR'
  | 'CREATIVE_DATABASE_ERROR'

export class CreativeAssetRepositoryError extends Error {
  readonly code: CreativeAssetRepositoryErrorCode
  readonly details?: unknown

  constructor(code: CreativeAssetRepositoryErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'CreativeAssetRepositoryError'
    this.code = code
    this.details = details
  }
}
