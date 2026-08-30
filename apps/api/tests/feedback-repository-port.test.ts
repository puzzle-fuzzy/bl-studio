import type {
	FeedbackRepository,
	GenerationRepository,
} from "@bailian-studio/generation-repository";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../src/test-app";
import { createFakeAuthService } from "./fake-auth-service";

const calls: Array<Record<string, unknown>> = [];
const fakeFeedbackRepository = {
	submitFeedback: async () => {
		throw new Error("not used");
	},
	listFeedback: async () => ({ items: [] }),
	listMyFeedback: async (input: Record<string, unknown>) => {
		calls.push(input);
		return { items: [] };
	},
	updateFeedbackStatus: async () => {
		throw new Error("not used");
	},
} as unknown as FeedbackRepository;

const fakeGenerationRepository = {
	recordAuditEvent: async () => ({ id: "audit-1" }),
} as unknown as GenerationRepository;

const app = createTestApp({
	authService: createFakeAuthService(() => ({
		id: "user-1",
		email: "user-1@example.test",
		displayName: null,
		role: "user" as const,
	})),
	generationRepository: fakeGenerationRepository,
	feedbackRepository: fakeFeedbackRepository,
}).app;

describe("feedback repository port", () => {
	it("用户反馈路由只依赖窄 feedback port", async () => {
		calls.length = 0;
		const response = await app.handle(
			new Request("http://localhost/api/feedback?limit=10", {
				headers: { cookie: "bailian_studio_session=fake-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			data: { items: [] },
		});
		expect(calls).toEqual([{ userId: "user-1", limit: 10 }]);
	});
});
