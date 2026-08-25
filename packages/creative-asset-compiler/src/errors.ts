export type CreativeAssetCompilerErrorCode =
  | 'CREATIVE_COMPILER_MODEL_UNAVAILABLE'
  | 'CREATIVE_COMPILER_PROMPT_UNSUPPORTED'
  | 'CREATIVE_COMPILER_PROMPT_REFERENCE_INVALID'
  | 'CREATIVE_COMPILER_PARAMETER_CONFLICT'
  | 'CREATIVE_COMPILER_ASSET_VERSION_NOT_APPROVED'
  | 'CREATIVE_COMPILER_BINDING_INVALID'
  | 'CREATIVE_COMPILER_REFERENCE_SELECTION_INVALID'
  | 'CREATIVE_COMPILER_REFERENCE_KIND_INVALID'
  | 'CREATIVE_COMPILER_MEDIA_PARAMETER_NOT_FOUND'
  | 'CREATIVE_COMPILER_MEDIA_PARAMETER_AMBIGUOUS'
  | 'CREATIVE_COMPILER_MODEL_VALIDATION_FAILED'

export class CreativeAssetCompilerError extends Error {
  readonly code: CreativeAssetCompilerErrorCode
  readonly details?: unknown

  constructor(code: CreativeAssetCompilerErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'CreativeAssetCompilerError'
    this.code = code
    this.details = details
  }
}
