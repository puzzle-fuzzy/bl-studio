import { compileCreativeGeneration } from "@bailian-studio/creative-asset-compiler";
import type { CreativeAssetRepository } from "@bailian-studio/creative-asset-repository";
import {
	type CreateGenerationInput,
	type CreateGenerationResult,
	type DailyGenerationUsage,
	estimateGenerationRequest,
	type GenerationEstimate,
	type GenerationRecord,
	type GenerationRepository,
	GenerationRepositoryError,
	type RequestGenerationCancelInput,
	type RetryGenerationInput,
	type UsageRepository,
} from "@bailian-studio/generation-repository";
import { getModelById } from "@bailian-studio/dashscope-manifests";
import type { GenerationLimits } from "../../lib/limits";

export interface CreateGenerationUseCaseResult {
	result: CreateGenerationResult;
	estimate: GenerationEstimate;
	usage: DailyGenerationUsage;
}

export interface CreateGenerationUseCaseDependencies {
	repository: GenerationRepository;
	usageRepository: UsageRepository;
	limits: GenerationLimits;
	creativeAssetRepository: Pick<
		CreativeAssetRepository,
		"resolveGenerationBindings"
	>;
}

export interface GenerationLifecycleUseCases {
	cancel(input: RequestGenerationCancelInput): Promise<GenerationRecord>;
	retry(input: RetryGenerationInput): Promise<CreateGenerationResult>;
}

export interface CreateGenerationUseCase {
	prepare(input: CreateGenerationInput): Promise<CreateGenerationInput>;
	execute(input: CreateGenerationInput): Promise<CreateGenerationUseCaseResult>;
}

export interface GenerationEstimateResult {
	estimate: GenerationEstimate;
	usage: DailyGenerationUsage;
}

/**
 * generation 领域的应用层入口。
 *
 * 路由只负责认证、输入校验、审计和响应适配；涉及生成业务顺序的操作统一从
 * 这里进入，避免估价、提交和生命周期变更各自复制 repository 编排。
 */
export interface GenerationApplicationService {
	estimate(input: CreateGenerationInput): Promise<GenerationEstimateResult>;
	create(input: CreateGenerationInput): Promise<CreateGenerationUseCaseResult>;
	cancel(input: RequestGenerationCancelInput): Promise<GenerationRecord>;
	retry(input: RetryGenerationInput): Promise<CreateGenerationResult>;
}

function optionalText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length === 0 ? undefined : normalized;
}

/**
 * 把创意资产上下文编译成 generation repository 的稳定输入。
 *
 * creativeContext 是新协议的入口；没有它时保留原有 modelId + params + assetRefs
 * 请求，以便旧客户端继续工作。编译结果中的 context、assetRefs 和 params 一起
 * 进入 repository，后者会在同一事务里再次锁定并写入不可变快照。
 */
async function prepareCreativeGenerationInput(
	input: CreateGenerationInput,
	deps: CreateGenerationUseCaseDependencies,
): Promise<CreateGenerationInput> {
	const context = input.creativeContext;
	if (context === undefined) return input;

	const manifest = getModelById(input.modelId);
	if (manifest === undefined) {
		throw new GenerationRepositoryError(
			"MODEL_NOT_FOUND",
			`Model not found: ${input.modelId}`,
		);
	}

	const resolvedBindings =
		await deps.creativeAssetRepository.resolveGenerationBindings({
			userId: input.userId,
			context,
		});
	const parameterValues = Object.fromEntries(
		Object.entries(input.params).filter(
			([name]) => name !== "prompt" && name !== "negativePrompt",
		),
	);
	const prompt =
		context.prompt.length > 0
			? context.prompt
			: (optionalText(input.params.prompt) ?? "");
	const negativePrompt =
		context.negativePrompt ?? optionalText(input.params.negativePrompt);
	const compiled = compileCreativeGeneration({
		manifest,
		purpose: context.purpose,
		prompt,
		...(negativePrompt === undefined ? {} : { negativePrompt }),
		...(context.projectId === undefined
			? {}
			: { projectId: context.projectId }),
		parameterValues,
		bindings: resolvedBindings,
		recipe: context.recipe,
		capabilitySnapshot: context.capabilitySnapshot,
	});

	return {
		...input,
		modelId: compiled.modelId,
		params: compiled.params,
		assetRefs: compiled.assetRefs,
		creativeContext: compiled.creativeContext,
	};
}

/**
 * 创建生成记录的应用层编排。
 *
 * HTTP 路由仍负责认证、请求校验、审计与响应整形。此 use case 拥有业务顺序：
 * 先估算，再读取当日用量，执行限额校验，最后通过 repository 事务创建记录与
 * 持久化的提交任务。
 */
export function createGenerationUseCase(
	deps: CreateGenerationUseCaseDependencies,
): CreateGenerationUseCase {
	const service = createGenerationApplicationService(deps);
	return {
		prepare(input) {
			return prepareCreativeGenerationInput(input, deps);
		},
		execute: service.create,
	};
}

export function createGenerationApplicationService(
	deps: CreateGenerationUseCaseDependencies,
): GenerationApplicationService {
	const lifecycle = createGenerationLifecycleUseCases(
		deps.repository,
		deps.limits,
	);
	return {
		async estimate(
			input: CreateGenerationInput,
		): Promise<GenerationEstimateResult> {
			const prepared = await prepareCreativeGenerationInput(input, deps);
			const estimate = estimatePreparedGeneration(prepared);
			const usage = await getDailyGenerationUsage(
				deps.usageRepository,
				prepared.userId,
			);
			return { estimate, usage };
		},
		async create(
			input: CreateGenerationInput,
		): Promise<CreateGenerationUseCaseResult> {
			const prepared = await prepareCreativeGenerationInput(input, deps);
			const estimate = estimatePreparedGeneration(prepared);
			const usage = await getDailyGenerationUsage(
				deps.usageRepository,
				prepared.userId,
			);
			enforceDailyGenerationLimits(estimate, usage, deps.limits);
			const result = await deps.repository.createGeneration({
				...prepared,
				quota: deps.limits,
			});
			return { result, estimate, usage };
		},
		cancel: lifecycle.cancel,
		retry: lifecycle.retry,
	};
}

function estimatePreparedGeneration(
	input: CreateGenerationInput,
): GenerationEstimate {
	return estimateGenerationRequest({
		modelId: input.modelId,
		params: input.params,
		...(input.assetRefs !== undefined ? { assetRefs: input.assetRefs } : {}),
	});
}

/**
 * 用户驱动的生命周期变更的应用层入口。
 * 所有权、可重试性与状态流转仍是 repository 的不变量；
 * HTTP 层只提供经过认证与 schema 校验的输入，并整形响应/审计事件。
 */
export function createGenerationLifecycleUseCases(
	repository: GenerationRepository,
	limits?: GenerationLimits,
): GenerationLifecycleUseCases {
	return {
		cancel: (input) => repository.requestGenerationCancel(input),
		retry: (input) =>
			repository.retryGeneration({
				...input,
				...(limits !== undefined ? { quota: limits } : {}),
			}),
	};
}

export async function getDailyGenerationUsage(
	repository: UsageRepository,
	userId: string,
): Promise<DailyGenerationUsage> {
	const now = new Date();
	const since = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
	return repository.getGenerationUsage({
		userId,
		since: since.toISOString(),
		until: until.toISOString(),
	});
}

export function enforceDailyGenerationLimits(
	estimate: GenerationEstimate,
	usage: DailyGenerationUsage,
	limits: GenerationLimits,
): void {
	const limitDetails = {
		attemptCount: usage.attemptCount,
		successfulCount: usage.successfulCount,
		generationCount: usage.attemptCount,
		estimatedCents: usage.estimatedCents,
		requestedCents: estimate.costEstimate,
		dailyQuotaMode: limits.dailyQuotaMode,
		...(limits.dailyTaskLimit !== undefined
			? { dailyTaskLimit: limits.dailyTaskLimit }
			: {}),
		...(limits.dailyCostLimitCents !== undefined
			? { dailyCostLimitCents: limits.dailyCostLimitCents }
			: {}),
	};

	const quotaCount =
		limits.dailyQuotaMode === "successful"
			? usage.successfulCount
			: usage.attemptCount;
	if (
		limits.dailyTaskLimit !== undefined &&
		quotaCount >= limits.dailyTaskLimit
	) {
		throw new GenerationRepositoryError(
			"GENERATION_DAILY_LIMIT_EXCEEDED",
			"Daily generation task limit exceeded",
			limitDetails,
		);
	}
	if (
		limits.dailyCostLimitCents !== undefined &&
		usage.estimatedCents + estimate.costEstimate > limits.dailyCostLimitCents
	) {
		throw new GenerationRepositoryError(
			"GENERATION_DAILY_LIMIT_EXCEEDED",
			"Daily generation cost limit exceeded",
			limitDetails,
		);
	}
}
