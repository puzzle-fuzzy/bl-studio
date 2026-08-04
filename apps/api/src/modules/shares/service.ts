import {
  GenerationRepositoryError,
  type CreateGenerationShareInput,
  type GenerationRepository,
  type GenerationShare,
  type RevokeGenerationShareInput,
} from '@bailian-studio/generation-repository'

type ShareRepository = Pick<
  GenerationRepository,
  'createGenerationShare' | 'getGenerationRecord' | 'getGenerationShareForRecord' | 'revokeGenerationShare'
>

export interface ShareUseCaseDependencies {
  readonly repository: ShareRepository
}

export type CreateShareResult =
  | { kind: 'created'; share: GenerationShare }
  | { kind: 'generation_not_found' }

export type GetShareResult =
  | { kind: 'found'; share: GenerationShare }
  | { kind: 'generation_not_found' }
  | { kind: 'share_not_found' }

export type RevokeShareResult =
  | { kind: 'revoked'; share: GenerationShare }
  | { kind: 'share_not_found' }

/**
 * Share orchestration lives here rather than in Elysia handlers. Repository
 * ownership checks and idempotency remain the source of truth; this boundary
 * only turns those outcomes into stable application results for HTTP adapters.
 */
export function createShareUseCase(deps: ShareUseCaseDependencies) {
  return {
    async create(input: CreateGenerationShareInput): Promise<CreateShareResult> {
      try {
        const share = await deps.repository.createGenerationShare(input)
        return { kind: 'created', share }
      } catch (error) {
        if (error instanceof GenerationRepositoryError && error.code === 'GENERATION_NOT_FOUND') {
          return { kind: 'generation_not_found' }
        }
        throw error
      }
    },

    async get(input: { recordId: string; userId: string }): Promise<GetShareResult> {
      const record = await deps.repository.getGenerationRecord(input.recordId)
      if (record === undefined || record.userId !== input.userId) {
        return { kind: 'generation_not_found' }
      }

      const share = await deps.repository.getGenerationShareForRecord(input)
      return share === undefined
        ? { kind: 'share_not_found' }
        : { kind: 'found', share }
    },

    async revoke(input: RevokeGenerationShareInput): Promise<RevokeShareResult> {
      const share = await deps.repository.revokeGenerationShare(input)
      return share === undefined
        ? { kind: 'share_not_found' }
        : { kind: 'revoked', share }
    },
  }
}
