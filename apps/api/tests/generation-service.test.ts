import type { CreativeAssetRepository } from "@bailian-studio/creative-asset-repository";
import { getModelById } from "@bailian-studio/dashscope-manifests";
import type {
	DailyGenerationUsage,
	GenerationEstimate,
	GenerationRepository,
	UsageRepository,
} from "@bailian-studio/generation-repository";
import { describe, expect, it, vi } from "vitest";
import {
	createGenerationApplicationService,
	createGenerationUseCase,
	enforceDailyGenerationLimits,
} from "../src/modules/generations/service";

const estimate: GenerationEstimate = {
	modelId: "qwen-image",
	provider: "dashscope",
	providerModel: "qwen-image",
	category: "image",
	params: { prompt: "fixture" },
	costEstimate: 20,
	currency: "CNY",
};

const usage: DailyGenerationUsage = {
	attemptCount: 2,
	successfulCount: 0,
	generationCount: 2,
	estimatedCents: 40,
	chargedCents: 0,
	providerCostCents: 0,
};

const modelResolver = { getModelById };

describe("generation creative asset preparation", () => {
	it("compiles approved asset bindings into the stable generation input", async () => {
		const resolveGenerationBindings = vi
			.fn<CreativeAssetRepository["resolveGenerationBindings"]>()
			.mockResolvedValue([
				{
					assetVersionId: "version-character-1",
					assetVersionStatus: "approved",
					assetType: "character",
					role: "character",
					position: 0,
					referenceIds: ["reference-front-1"],
					references: [
						{
							id: "reference-front-1",
							userAssetId: "user-image-1",
							mediaKind: "image",
							role: "front",
						},
					],
				},
			]);
		const useCase = createGenerationUseCase({
			repository: {} as GenerationRepository,
			usageRepository: {} as UsageRepository,
			limits: { dailyQuotaMode: "attempts" },
			modelResolver,
			creativeAssetRepository: { resolveGenerationBindings },
		});

		const prepared = await useCase.prepare({
			userId: "user-1",
			modelId: "qwen-image-edit",
			params: {
				prompt: "让 @图1 站在雨中",
				n: 1,
			},
			creativeContext: {
				protocolVersion: 1,
				purpose: "shot_image",
				projectId: "project-1",
				prompt: "让 @图1 站在雨中",
				assetBindings: [
					{
						assetVersionId: "version-character-1",
						role: "character",
						position: 0,
						referenceIds: ["reference-front-1"],
					},
				],
				recipe: { source: "service-test" },
				capabilitySnapshot: { uiVersion: "test" },
			},
		});

		expect(resolveGenerationBindings).toHaveBeenCalledWith({
			userId: "user-1",
			context: expect.objectContaining({ projectId: "project-1" }),
		});
		expect(prepared.params).toMatchObject({
			prompt: "让 <<<image_1>>> 站在雨中",
			n: 1,
		});
		expect(prepared.params).not.toHaveProperty("image");
		expect(prepared.assetRefs).toEqual({ image: ["user-image-1"] });
		expect(prepared.creativeContext?.modelId).toBe("qwen-image-edit");
		expect(
			prepared.creativeContext?.capabilitySnapshot.compilerProtocolVersion,
		).toBe(1);
	});
});

describe("generation application service", () => {
	it("uses the injected model resolver for model lookup", async () => {
		const getModelById = vi.fn().mockReturnValue(undefined);
		const service = createGenerationApplicationService({
			repository: {} as GenerationRepository,
			usageRepository: {} as UsageRepository,
			limits: { dailyQuotaMode: "attempts" },
			modelResolver: { getModelById },
			creativeAssetRepository: {} as CreativeAssetRepository,
		});

		await expect(service.estimate({
			userId: "user-1",
			modelId: "provider-owned-model",
			params: { prompt: "fixture", n: 1 },
		})).rejects.toThrow(/Unknown model/);
		expect(getModelById).toHaveBeenCalledWith("provider-owned-model");
	});

	it("owns estimate preparation and daily usage lookup", async () => {
		const getGenerationUsage = vi
			.fn<UsageRepository["getGenerationUsage"]>()
			.mockResolvedValue(usage);
		const repository = {} as GenerationRepository;
		const service = createGenerationApplicationService({
			repository,
			usageRepository: { getGenerationUsage },
			limits: { dailyQuotaMode: "attempts" },
			modelResolver,
			creativeAssetRepository: {} as CreativeAssetRepository,
		});

		const result = await service.estimate({
			userId: "user-1",
			modelId: "qwen-image",
			params: { prompt: "fixture", n: 1 },
		});

		expect(result.estimate).toMatchObject({
			modelId: "qwen-image",
			provider: "dashscope",
		});
		expect(result.usage).toEqual(usage);
		expect(getGenerationUsage).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "user-1" }),
		);
	});

	it("enforces the quota before creating a generation record", async () => {
		const createGeneration = vi
			.fn<GenerationRepository["createGeneration"]>()
			.mockResolvedValue({
				record: {},
				task: {},
				event: {},
			} as never);
		const repository = {
			createGeneration,
		} as unknown as GenerationRepository;
		const usageRepository: UsageRepository = {
			getGenerationUsage: vi.fn().mockResolvedValue(usage),
		};
		const service = createGenerationApplicationService({
			repository,
			usageRepository,
			limits: { dailyTaskLimit: 2, dailyQuotaMode: "attempts" },
			modelResolver,
			creativeAssetRepository: {} as CreativeAssetRepository,
		});

		await expect(
			service.create({
				userId: "user-1",
				modelId: "qwen-image",
				params: { prompt: "fixture", n: 1 },
			}),
		).rejects.toThrow(/Daily generation task limit exceeded/);
		expect(createGeneration).not.toHaveBeenCalled();
	});
});

describe("generation quota policy", () => {
	it("uses attemptCount by default so failed attempts cannot bypass a quota", () => {
		expect(() =>
			enforceDailyGenerationLimits(estimate, usage, {
				dailyTaskLimit: 2,
				dailyQuotaMode: "attempts",
			}),
		).toThrow(/Daily generation task limit exceeded/);
	});

	it("can explicitly count successful generations instead", () => {
		expect(() =>
			enforceDailyGenerationLimits(estimate, usage, {
				dailyTaskLimit: 2,
				dailyQuotaMode: "successful",
			}),
		).not.toThrow();
	});
});
