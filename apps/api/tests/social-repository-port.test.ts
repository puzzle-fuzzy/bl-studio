import type {
	GenerationRepository,
	SocialRepository,
} from "@bailian-studio/generation-repository";
import type { StorageAdapter } from "@bailian-studio/storage";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";
import { createFakeAuthService } from "./fake-auth-service";

describe("gallery social repository port", () => {
	it("routes gallery reads through the narrow social dependency", async () => {
		const calls: unknown[] = [];
		const socialRepository = {
			listGalleryGenerations: async (input: unknown) => {
				calls.push(input);
				return { items: [] };
			},
		} as unknown as SocialRepository;
		const generationRepository = {} as GenerationRepository;
		const app = createTestApp({
			authService: createFakeAuthService(() => ({
				id: "viewer-1",
				email: "viewer@example.test",
				displayName: "Viewer",
				role: "user",
			})),
			generationRepository,
			socialRepository,
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
			new Request("http://localhost/api/gallery", {
				headers: { cookie: "bailian_studio_session=fake-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual(expect.objectContaining({ viewerId: "viewer-1" }));
	});
});
