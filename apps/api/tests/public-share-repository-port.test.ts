import type {
	GenerationRepository,
	PublicShareRepository,
} from "@bailian-studio/generation-repository";
import type { StorageAdapter } from "@bailian-studio/storage";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";

const fakePublicShareRepository = {
	getPublicSharedGeneration: async () => ({
		record: { id: "record-1", status: "succeeded" },
		artifacts: [],
	}),
	getPublicSharedArtifact: async () => undefined,
} as unknown as PublicShareRepository;

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

describe("public share repository port", () => {
	it("匿名分享读取只依赖公开读取 port", async () => {
		const app = createTestApp({
			generationRepository: fakeGenerationRepository,
			publicShareRepository: fakePublicShareRepository,
			storage: fakeStorage,
		}).app;

		const response = await app.handle(
			new Request("http://localhost/api/shares/generations/share-1"),
		);
		const body = (await response.json()) as {
			success: boolean;
			data: { record: { id: string }; artifacts: unknown[] };
		};

		expect(response.status).toBe(200);
		expect(body).toEqual({
			success: true,
			data: { record: { id: "record-1", status: "succeeded" }, artifacts: [] },
		});
	});
});
