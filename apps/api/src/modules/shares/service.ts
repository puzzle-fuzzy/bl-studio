import {
	type CreateGenerationShareInput,
	GenerationRepositoryError,
	type GenerationShare,
	type RevokeGenerationShareInput,
	type ShareRepository,
} from "@bailian-studio/generation-repository";

export interface ShareUseCaseDependencies {
	readonly repository: ShareRepository;
}

export type CreateShareResult =
	| { kind: "created"; share: GenerationShare }
	| { kind: "generation_not_found" };

export type GetShareResult =
	| { kind: "found"; share: GenerationShare }
	| { kind: "generation_not_found" }
	| { kind: "share_not_found" };

export type RevokeShareResult =
	| { kind: "revoked"; share: GenerationShare }
	| { kind: "share_not_found" };

/**
 * 分享编排放在这里而非 Elysia handler 中。repository 的所有权检查与幂等性
 * 仍为事实来源；该边界只把这些结果转换为供 HTTP 适配层使用的稳定应用结果。
 */
export function createShareUseCase(deps: ShareUseCaseDependencies) {
	return {
		async create(
			input: CreateGenerationShareInput,
		): Promise<CreateShareResult> {
			try {
				const share = await deps.repository.createGenerationShare(input);
				return { kind: "created", share };
			} catch (error) {
				if (
					error instanceof GenerationRepositoryError &&
					error.code === "GENERATION_NOT_FOUND"
				) {
					return { kind: "generation_not_found" };
				}
				throw error;
			}
		},

		async get(input: {
			recordId: string;
			userId: string;
		}): Promise<GetShareResult> {
			const record = await deps.repository.getGenerationRecord(input.recordId);
			if (record === undefined || record.userId !== input.userId) {
				return { kind: "generation_not_found" };
			}

			const share = await deps.repository.getGenerationShareForRecord(input);
			return share === undefined
				? { kind: "share_not_found" }
				: { kind: "found", share };
		},

		async revoke(
			input: RevokeGenerationShareInput,
		): Promise<RevokeShareResult> {
			const share = await deps.repository.revokeGenerationShare(input);
			return share === undefined
				? { kind: "share_not_found" }
				: { kind: "revoked", share };
		},
	};
}
