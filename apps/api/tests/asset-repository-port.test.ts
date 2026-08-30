import type {
	AssetRepository,
	GenerationRepository,
	UnifiedAssetItem,
} from "@bailian-studio/generation-repository";
import type { StorageAdapter } from "@bailian-studio/storage";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";
import { createFakeAuthService } from "./fake-auth-service";

const fakeAssetRepository = {
	listUnifiedAssets: async (
		userId: string,
		input: Record<string, unknown>,
	) => ({
		items: [
			{
				id: "asset-1",
				kind: "image",
				source: "upload",
				createdAt: "2026-08-30T00:00:00.000Z",
			} satisfies UnifiedAssetItem,
		],
		...(userId === "user-1" && input.sort === "title"
			? {}
			: { nextCursor: "unexpected" }),
	}),
	createUserAsset: async () => undefined,
	getUserAsset: async () => undefined,
	softDeleteUserAsset: async () => false,
} as unknown as AssetRepository;

const fakeGenerationRepository = {
	recordAuditEvent: async () => ({ id: "audit-1" }),
} as unknown as GenerationRepository;

const fakeStorage: StorageAdapter = {
	provider: "local",
	keyPrefix: "",
	writeObject: async (input) => ({
		provider: "local",
		key: input.key,
		byteSize: input.body.byteLength,
	}),
	createReadUrl: async (input) =>
		`/signed/${input.key}?ttl=${input.expiresInSeconds}`,
};

describe("asset repository port", () => {
	it("资产列表只依赖窄 asset port", async () => {
		const app = createTestApp({
			authService: createFakeAuthService(() => ({
				id: "user-1",
				email: "user-1@example.test",
				displayName: null,
				role: "user" as const,
			})),
			generationRepository: fakeGenerationRepository,
			assetRepository: fakeAssetRepository,
			storage: fakeStorage,
		}).app;

		const response = await app.handle(
			new Request("http://localhost/api/assets?sort=title", {
				headers: { cookie: "bailian_studio_session=fake-token" },
			}),
		);
		const body = (await response.json()) as {
			success: boolean;
			data: { items: unknown[]; nextCursor?: string };
		};

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.data.items).toHaveLength(1);
		expect(body.data.nextCursor).toBeUndefined();
	});
});
