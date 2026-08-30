import type {
	GenerationRepository,
	UsageRepository,
} from "@bailian-studio/generation-repository";
import type { StorageAdapter } from "@bailian-studio/storage";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";
import { createFakeAuthService } from "./fake-auth-service";

describe("usage repository port", () => {
	it("用户用量路由只依赖 UsageRepository", async () => {
		const calls: unknown[] = [];
		const usageRepository: UsageRepository = {
			getGenerationUsage: async (input) => {
				calls.push(input);
				return {
					attemptCount: 2,
					successfulCount: 1,
					generationCount: 2,
					estimatedCents: 120,
					chargedCents: 100,
					providerCostCents: 80,
				};
			},
		};
		const app = createTestApp({
			authService: createFakeAuthService(() => ({
				id: "user-1",
				email: "user@example.test",
				displayName: "User",
				role: "user",
			})),
			generationRepository: {} as GenerationRepository,
			usageRepository,
			storage: {
				provider: "local",
				keyPrefix: "",
				writeObject: async (input) => ({
					provider: "local",
					key: input.key,
					byteSize: input.body.byteLength,
				}),
				createReadUrl: async (input) =>
					`/signed/${input.key}?ttl=${input.expiresInSeconds}`,
			} satisfies StorageAdapter,
		}).app;

		const response = await app.handle(
			new Request("http://localhost/api/usage", {
				headers: { cookie: "bailian_studio_session=fake-token" },
			}),
		);
		const body = (await response.json()) as {
			data: {
				usage: {
					attemptCount: number;
					period: { since: string; until: string };
				};
			};
		};

		expect(response.status).toBe(200);
		expect(body.data.usage.attemptCount).toBe(2);
		expect(body.data.usage.period.until).toMatch(/T00:00:00\.000Z$/);
		expect(calls).toHaveLength(1);
	});
});
