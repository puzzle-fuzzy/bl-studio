import type {
	AdminAssetRepository,
	AdminGalleryRepository,
	AdminRepository,
	AnalyticsRepository,
	AdminTaskRepository,
} from '@bailian-studio/admin-repository'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

const calls: Array<Record<string, unknown>> = [];
const fakeAdminGalleryRepository = {
	listAdminGalleryGenerations: async (input: Record<string, unknown>) => {
		calls.push(input);
		return { items: [] };
	},
	getAdminGalleryArtifact: async () => undefined,
	listAdminGalleryRecordArtifacts: async () => [],
	setGalleryRecordHidden: async () => undefined,
	setGalleryRecordsHidden: async () => [],
	softDeleteGalleryRecords: async () => [],
	hideUserPublicWorks: async () => 0,
} as unknown as AdminGalleryRepository;

const adminRepository = {
  assets: {} as AdminAssetRepository,
  gallery: fakeAdminGalleryRepository,
	tasks: {} as AdminTaskRepository,
	analytics: {} as AnalyticsRepository,
} satisfies AdminRepository

const app = createTestApp({
	authService: createFakeAuthService(() => ({
		id: "admin-1",
		email: "admin@example.test",
		displayName: null,
		role: "admin" as const,
	})),
	generationRepository: {} as GenerationRepository,
	adminRepository,
}).app;

describe("admin gallery repository port", () => {
	it("admin gallery 路由只依赖治理 port", async () => {
		calls.length = 0;
		const response = await app.handle(
			new Request("http://localhost/api/admin/gallery?includeHidden=true", {
				headers: { cookie: "bailian_studio_session=fake-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			data: { items: [] },
		});
		expect(calls).toEqual([{ includeHidden: true }]);
	});
});
