import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../", import.meta.url);
const apiEntry = readFileSync(
	new URL("apps/api/src/index.ts", repositoryRoot),
	"utf8",
);
const workerEntry = readFileSync(
	new URL("apps/worker/src/index.ts", repositoryRoot),
	"utf8",
);
const runtimeSource = readFileSync(
	new URL("packages/persistence-runtime/src/index.ts", repositoryRoot),
	"utf8",
);

describe("process persistence composition", () => {
	it("keeps API and Worker entrypoints on the shared persistence runtime", () => {
		expect(apiEntry).toMatch(
			/from ['"]@bailian-studio\/persistence-runtime['"]/,
		);
		expect(apiEntry).toContain("createApiPersistenceRuntime");
		expect(workerEntry).toMatch(
			/from ['"]@bailian-studio\/persistence-runtime['"]/,
		);
		expect(workerEntry).toContain("createWorkerPersistenceRuntime");

		for (const source of [apiEntry, workerEntry]) {
			expect(source).not.toMatch(
				/create(?:AuthService|CreditLedger|DirectorRepository|CreativeAssetRepository|MediaRepository|GenerationRepository)FromUrl/,
			);
		}
	});

	it("creates one database handle per process runtime and closes it idempotently", () => {
		expect(runtimeSource.match(/createDb\(/g)).toHaveLength(1);
		expect(runtimeSource).toContain(
			"const db = createSharedDatabase(options.databaseUrl, options.databasePoolMax)",
		);
		expect(runtimeSource).toContain("function closeOnce(db: BailianStudioDb)");
		expect(runtimeSource).toContain("const taskQueueTransactionStore = createTaskQueueTransactionStore()");
		expect(runtimeSource).toContain("const creativeGenerationContextStore = createCreativeGenerationContextStore()");
		expect(runtimeSource).toMatch(
			/createGenerationRepository\(\{\s*db,\s*taskQueueTransactionStore,\s*creativeGenerationContextStore,?\s*\}\)/s,
		);
		expect(runtimeSource).toMatch(
			/createDirectorRepository\(\{\s*db,\s*taskQueueTransactionStore,?\s*\}\)/s,
		);
		expect(runtimeSource).toContain("createCreativeAssetRepository({ db })");
		expect(runtimeSource).toContain("createMediaRepository({ db, taskQueueTransactionStore })");
		expect(runtimeSource).toMatch(
			/createAuthService\(\s*\{\s*db,\s*\.\.\.withoutDatabaseRuntimeOptions\(options\),?\s*\}\s*\)/s,
		);
		expect(runtimeSource).toContain("createCreditLedger({ db })");
		expect(runtimeSource).toContain(
			"assetRepository: createAssetRepository({ db, taskQueueTransactionStore })",
		);
		expect(runtimeSource).toContain("const shareRepository = createShareRepository(db)");
		expect(runtimeSource).toContain("publicShareRepository: shareRepository");
		expect(runtimeSource).toContain("auditRepository: createAuditRepository(db)");
	});
});
