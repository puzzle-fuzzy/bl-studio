import type {
	GenerationRepository,
	PromptLibraryRepository,
} from "@bailian-studio/generation-repository";
import type { StorageAdapter } from "@bailian-studio/storage";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";
import { createFakeAuthService } from "./fake-auth-service";

const fakeAuthService = createFakeAuthService(() => ({
	id: "user-1",
	email: "user-1@example.test",
	displayName: null,
	role: "user" as const,
}));

const prompt = {
	id: "prompt-1",
	userId: "user-1",
	name: "电影感",
	modelId: "qwen-image",
	prompt: "电影感街景",
	params: { size: "1024*1024" },
	createdAt: "2026-08-30T00:00:00.000Z",
	updatedAt: "2026-08-30T00:00:00.000Z",
};

const listInputs: Array<Record<string, unknown>> = [];
const fakePromptLibraryRepository = {
	listPromptLibrary: async (input: Record<string, unknown>) => {
		listInputs.push(input);
		return { items: [prompt] };
	},
	createPromptLibraryItem: async () => prompt,
	updatePromptLibraryItem: async () => prompt,
	deletePromptLibraryItem: async () => undefined,
} as unknown as PromptLibraryRepository;

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

const app = createTestApp({
	authService: fakeAuthService,
	generationRepository: fakeGenerationRepository,
	promptLibraryRepository: fakePromptLibraryRepository,
	storage: fakeStorage,
}).app;

function authed(path: string): Request {
	return new Request(`http://localhost${path}`, {
		headers: { cookie: "bailian_studio_session=fake-token" },
	});
}

describe("prompt library repository port", () => {
	it("提示词库路由只依赖窄 prompt library port", async () => {
		listInputs.length = 0;
		const response = await app.handle(authed("/api/prompt-library?q=电影"));
		const body = (await response.json()) as {
			success: boolean;
			data: { items: unknown[] };
		};

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.data.items).toHaveLength(1);
		expect(listInputs).toEqual([{ userId: "user-1", q: "电影" }]);
	});
});
