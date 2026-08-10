import {
	type BailianStudioDb,
	type BailianStudioDbTransaction,
	directorAssets,
	directorCharacters,
	directorLocations,
	directorPhaseRuns,
	directorPhaseStates,
	directorProjects,
	directorScriptVersions,
	directorShots,
	taskRecords,
	userAssets,
} from "@bailian-studio/db";
import {
	DIRECTOR_PHASES,
	type DirectorPhase,
	type DirectorPhaseRun,
	type DirectorPhaseState,
	type DirectorCharacter,
	type DirectorAsset,
	type DirectorLocation,
	type DirectorShot,
	type DirectorProjectDetail,
	type DirectorProjectProgress,
	type DirectorProjectStatus,
	type DirectorScriptVersion,
} from "@bailian-studio/shared";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { DirectorRepositoryError } from "./errors";
import type {
	CreateDirectorProjectRepositoryInput,
	DirectorProjectRepositoryDetail,
	DirectorProjectRepositorySummary,
	DirectorRepository,
	GetDirectorProjectRepositoryInput,
	ListDirectorProjectsRepositoryInput,
	ListDirectorProjectsResult,
	UpdateDirectorProjectRepositoryInput,
	AttachDirectorAssetRepositoryInput,
	DetachDirectorAssetRepositoryInput,
	UpdateDirectorShotRepositoryInput,
	StartDirectorShotVideoRepositoryInput,
	MarkDirectorShotVideoFailedRepositoryInput,
	FinalizeDirectorShotVideoRepositoryInput,
} from "./types";

interface ProjectCursor {
	createdAt: string;
	id: string;
}

function encodeCursor(cursor: ProjectCursor): string {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): ProjectCursor {
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(value, "base64url").toString("utf8"),
		);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
			typeof (parsed as { id?: unknown }).id !== "string"
		) {
			throw new Error("invalid cursor shape");
		}
		const timestamp = Date.parse((parsed as { createdAt: string }).createdAt);
		if (!Number.isFinite(timestamp))
			throw new Error("invalid cursor timestamp");
		return parsed as ProjectCursor;
	} catch {
		throw new DirectorRepositoryError(
			"DIRECTOR_INVALID_CURSOR",
			"Invalid director project cursor",
		);
	}
}

function toPhaseState(
	row: typeof directorPhaseStates.$inferSelect,
	lastRunId: string | null = null,
): DirectorPhaseState {
	return {
		phase: row.phase as DirectorPhase,
		status: row.status as DirectorPhaseState["status"],
		version: row.version,
		activeRunId: row.activeRunId,
		lastRunId,
		lastError: row.lastErrorJson,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toPhaseRun(
	row: typeof directorPhaseRuns.$inferSelect,
): DirectorPhaseRun {
	return {
		id: row.id,
		projectId: row.projectId,
		scriptVersionId: row.scriptVersionId,
		phase: row.phase as DirectorPhase,
		status: row.status as DirectorPhaseRun["status"],
		version: row.version,
		taskId: row.taskId,
		outputSummary: row.outputSummaryJson,
		error: row.errorJson,
		staleAt: row.staleAt?.toISOString() ?? null,
		staleReason: row.staleReason,
		createdAt: row.createdAt.toISOString(),
		startedAt: row.startedAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toScriptVersion(
	row: typeof directorScriptVersions.$inferSelect,
): DirectorScriptVersion {
	return {
		id: row.id,
		version: row.version,
		storyText: row.storyText,
		synopsis: row.synopsis,
		createdAt: row.createdAt.toISOString(),
	};
}

function toCharacter(
	row: typeof directorCharacters.$inferSelect,
): DirectorCharacter {
	return {
		id: row.id,
		sourceRunId: row.sourceRunId,
		name: row.name,
		role: row.role,
		description: row.description,
		traits: row.traitsJson,
		referenceAssetIds: row.referenceAssetIdsJson,
		metadata: row.metadataJson,
		locked: row.locked,
		version: row.version,
		staleAt: row.staleAt?.toISOString() ?? null,
		staleReason: row.staleReason,
	};
}

function toLocation(
	row: typeof directorLocations.$inferSelect,
): DirectorLocation {
	return {
		id: row.id,
		sourceRunId: row.sourceRunId,
		name: row.name,
		description: row.description,
		atmosphere: row.atmosphere,
		referenceAssetIds: row.referenceAssetIdsJson,
		metadata: row.metadataJson,
		locked: row.locked,
		version: row.version,
		staleAt: row.staleAt?.toISOString() ?? null,
		staleReason: row.staleReason,
	};
}

function toDirectorAsset(
	row: typeof directorAssets.$inferSelect,
): DirectorAsset {
	return {
		id: row.id,
		projectId: row.projectId,
		sourceRunId: row.sourceRunId,
		kind: row.kind as DirectorAsset["kind"],
		ownerType: row.ownerType as DirectorAsset["ownerType"],
		ownerId: row.ownerId,
		assetId: row.assetId,
		version: row.version,
		metadata: row.metadataJson,
		staleAt: row.staleAt?.toISOString() ?? null,
		staleReason: row.staleReason,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toShot(row: typeof directorShots.$inferSelect): DirectorShot {
	return {
		id: row.id,
		projectId: row.projectId,
		sourceRunId: row.sourceRunId,
		sequence: row.sequence,
		sceneNumber: row.sceneNumber,
		slugline: row.slugline,
		narrative: row.narrative,
		camera: row.cameraJson,
		durationSeconds: row.durationSeconds,
		environmentPrompt: row.environmentPrompt,
		videoPrompt: row.videoPrompt,
		negativePrompt: row.negativePrompt,
		dialogue: row.dialogueJson,
		referenceAssetIds: row.referenceAssetIdsJson,
		continuity: row.continuityJson,
		status: row.status as DirectorShot["status"],
		videoGenerationId: row.videoGenerationId,
		activeVideoAssetId: row.activeVideoAssetId,
		version: row.version,
		staleAt: row.staleAt?.toISOString() ?? null,
		staleReason: row.staleReason,
		error: row.errorJson,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toWorkerPhaseRun(
	row: typeof directorPhaseRuns.$inferSelect,
) {
	return { ...toPhaseRun(row), inputSnapshot: row.inputSnapshotJson };
}

function projectProgress(
	states: DirectorPhaseState[],
): DirectorProjectProgress {
	return {
		completed: states.filter((state) => state.status === "completed").length,
		total: DIRECTOR_PHASES.length,
		currentPhase:
			states.find((state) => state.status !== "completed")?.phase ?? null,
	};
}

function toProjectDetail(
	row: typeof directorProjects.$inferSelect,
	phaseRows: Array<typeof directorPhaseStates.$inferSelect>,
	scriptVersion: typeof directorScriptVersions.$inferSelect,
	characterRows: Array<typeof directorCharacters.$inferSelect>,
	locationRows: Array<typeof directorLocations.$inferSelect>,
	assetRows: Array<typeof directorAssets.$inferSelect>,
	shotRows: Array<typeof directorShots.$inferSelect>,
	phaseRunRows: Array<typeof directorPhaseRuns.$inferSelect> = [],
): DirectorProjectRepositoryDetail {
	const latestRunByPhase = new Map<string, string>();
	for (const run of phaseRunRows) {
		if (!latestRunByPhase.has(run.phase)) latestRunByPhase.set(run.phase, run.id);
	}
	const phases = phaseRows
		.map((phaseRow) => toPhaseState(phaseRow, latestRunByPhase.get(phaseRow.phase) ?? null))
		.sort(
			(a, b) =>
				DIRECTOR_PHASES.indexOf(a.phase) - DIRECTOR_PHASES.indexOf(b.phase),
		);
	const detail: DirectorProjectDetail = {
		id: row.id,
		title: row.title,
		storyText: row.storyText,
		synopsis: row.synopsis,
		status: row.status as DirectorProjectStatus,
		settings: row.settingsJson,
		scriptVersion: toScriptVersion(scriptVersion),
		characters: characterRows.map(toCharacter),
		locations: locationRows.map(toLocation),
		assets: assetRows.map(toDirectorAsset),
		shots: shotRows.map(toShot),
		phases,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
	return detail;
}

function recordArray(value: unknown, key: string): Array<Record<string, unknown>> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
	const items = (value as Record<string, unknown>)[key];
	if (!Array.isArray(items)) return [];
	return items.filter(
		(item): item is Record<string, unknown> =>
			typeof item === "object" && item !== null && !Array.isArray(item),
	);
}

function stringField(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function nullableStringField(value: unknown): string | null {
	const result = stringField(value);
	return result.length > 0 ? result : null;
}

function stringArrayField(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function numberField(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function objectField(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

async function materializePhaseOutput(
	tx: BailianStudioDbTransaction,
	run: typeof directorPhaseRuns.$inferSelect,
	outputSummary: Record<string, unknown>,
	now: Date,
): Promise<void> {
	if (run.phase === "characters") {
		const records = recordArray(outputSummary.characters, "characters");
		if (records.length === 0) return;
		await tx
			.update(directorCharacters)
			.set({ staleAt: now, staleReason: "superseded_by_phase_run", updatedAt: now })
			.where(
				and(
					eq(directorCharacters.projectId, run.projectId),
					eq(directorCharacters.locked, false),
					isNull(directorCharacters.staleAt),
				),
			);
		await tx.insert(directorCharacters).values(
			records.map((record) => ({
				id: crypto.randomUUID(),
				projectId: run.projectId,
				sourceRunId: run.id,
				name: stringField(record.name),
				role: stringField(record.role),
				description: stringField(record.description),
				traitsJson: stringArrayField(record.traits),
				referenceAssetIdsJson: [],
				metadataJson: {
					goal: stringField(record.goal),
					conflict: stringField(record.conflict),
					arc: stringField(record.arc),
					visualSignature: stringField(record.visualSignature),
				},
				locked: false,
				version: run.version,
				createdBy: run.createdBy,
				updatedBy: run.updatedBy,
				createdAt: now,
				updatedAt: now,
			})),
		);
		return;
	}

	if (run.phase === "locations") {
		const records = recordArray(outputSummary.locations, "locations");
		if (records.length === 0) return;
		await tx
		.update(directorLocations)
		.set({ staleAt: now, staleReason: "superseded_by_phase_run", updatedAt: now })
		.where(
			and(
				eq(directorLocations.projectId, run.projectId),
				eq(directorLocations.locked, false),
				isNull(directorLocations.staleAt),
			),
		);
		await tx.insert(directorLocations).values(
		records.map((record) => ({
			id: crypto.randomUUID(),
			projectId: run.projectId,
			sourceRunId: run.id,
			name: stringField(record.name),
			description: stringField(record.description),
			atmosphere: stringField(record.atmosphere),
			referenceAssetIdsJson: [],
			metadataJson: {
				narrativeFunction: stringField(record.narrativeFunction),
				timeOfDay: stringField(record.timeOfDay),
				visualAnchors: stringArrayField(record.visualAnchors),
				continuityNotes: stringArrayField(record.continuityNotes),
			},
			locked: false,
			version: run.version,
			createdBy: run.createdBy,
			updatedBy: run.updatedBy,
			createdAt: now,
			updatedAt: now,
		})),
		);
		return;
	}

	if (run.phase !== "storyboard") return;
	const shotRecords = recordArray(outputSummary.shots, "shots");
	if (shotRecords.length === 0) return;
	await tx
		.update(directorShots)
		.set({ staleAt: now, staleReason: "superseded_by_phase_run", updatedAt: now })
		.where(
			and(
				eq(directorShots.projectId, run.projectId),
				ne(directorShots.status, "locked"),
				isNull(directorShots.staleAt),
			),
		);
	await tx.insert(directorShots).values(
		shotRecords.map((record, index) => ({
			id: crypto.randomUUID(),
			projectId: run.projectId,
			sourceRunId: run.id,
			sequence: numberField(record.sequence) ?? index + 1,
			sceneNumber: numberField(record.sceneNumber),
			slugline: nullableStringField(record.slugline),
			narrative: stringField(record.narrative),
			cameraJson: objectField(record.camera),
			durationSeconds: numberField(record.durationSeconds),
			environmentPrompt: nullableStringField(record.environmentPrompt),
			videoPrompt: nullableStringField(record.videoPrompt),
			negativePrompt: nullableStringField(record.negativePrompt),
			dialogueJson: { lines: Array.isArray(record.dialogue) ? record.dialogue : [] },
			referenceAssetIdsJson: [],
			continuityJson: {
				...objectField(record.continuity),
				referenceKeys: stringArrayField(record.referenceKeys),
			},
			status: "needs_review",
			version: run.version,
			createdBy: run.createdBy,
			updatedBy: run.updatedBy,
			createdAt: now,
			updatedAt: now,
		})),
	);
}

function toProjectSummary(
	row: typeof directorProjects.$inferSelect,
	phaseRows: Array<typeof directorPhaseStates.$inferSelect>,
): DirectorProjectRepositorySummary {
	const states = phaseRows.map((row) => toPhaseState(row));
	return {
		id: row.id,
		title: row.title,
		status: row.status as DirectorProjectStatus,
		progress: projectProgress(states),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

async function phaseRowsForProjects(
	db: BailianStudioDb,
	projectIds: string[],
): Promise<Array<typeof directorPhaseStates.$inferSelect>> {
	if (projectIds.length === 0) return [];
	return db
		.select()
		.from(directorPhaseStates)
		.where(inArray(directorPhaseStates.projectId, projectIds));
}

export function createDirectorRepository({
	db,
}: {
	db: BailianStudioDb;
}): DirectorRepository {
	return {
		async createProject(input: CreateDirectorProjectRepositoryInput) {
			const now = new Date();
			const projectId = crypto.randomUUID();
			await db.transaction(async (tx) => {
				await tx.insert(directorProjects).values({
					id: projectId,
					userId: input.userId,
					title: input.title,
					storyText: input.storyText,
					synopsis: input.synopsis ?? null,
					status: "draft",
					settingsJson: {},
					createdBy: input.userId,
					updatedBy: input.userId,
					createdAt: now,
					updatedAt: now,
				});
				await tx.insert(directorScriptVersions).values({
					id: crypto.randomUUID(),
					projectId,
					version: 1,
					storyText: input.storyText,
					synopsis: input.synopsis ?? null,
					createdBy: input.userId,
					createdAt: now,
					updatedAt: now,
				});
				await tx.insert(directorPhaseStates).values(
					DIRECTOR_PHASES.map((phase, index) => ({
						id: crypto.randomUUID(),
						projectId,
						phase,
						status: index === 0 ? "ready" : "not_started",
						version: 0,
						createdBy: input.userId,
						updatedBy: input.userId,
						createdAt: now,
						updatedAt: now,
					})),
				);
			});

			const project = await this.getProject({
				userId: input.userId,
				projectId,
			});
			if (project === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_DATABASE_ERROR",
					"Created director project could not be reloaded",
				);
			}
			return project;
		},

		async listProjects(
			input: ListDirectorProjectsRepositoryInput,
		): Promise<ListDirectorProjectsResult> {
			const cursor =
				input.cursor === undefined ? undefined : decodeCursor(input.cursor);
			const cursorDate =
				cursor === undefined ? undefined : new Date(cursor.createdAt);
			const projectFilter =
				cursor === undefined
					? and(
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						)
					: and(
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
							sql`(${directorProjects.createdAt} < ${cursorDate} or (${directorProjects.createdAt} = ${cursorDate} and ${directorProjects.id} < ${cursor.id}))`,
						);
			const rows = await db
				.select()
				.from(directorProjects)
				.where(projectFilter)
				.orderBy(desc(directorProjects.createdAt), desc(directorProjects.id))
				.limit(input.limit + 1);
			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const phases = await phaseRowsForProjects(
				db,
				items.map((row) => row.id),
			);
			const phaseByProject = new Map<
				string,
				Array<typeof directorPhaseStates.$inferSelect>
			>();
			for (const row of phases) {
				const current = phaseByProject.get(row.projectId) ?? [];
				current.push(row);
				phaseByProject.set(row.projectId, current);
			}
			const result: ListDirectorProjectsResult = {
				items: items.map((row) =>
					toProjectSummary(row, phaseByProject.get(row.id) ?? []),
				),
			};
			if (hasMore) {
				const last = items.at(-1);
				if (last !== undefined)
					result.nextCursor = encodeCursor({
						createdAt: last.createdAt.toISOString(),
						id: last.id,
					});
			}
			return result;
		},

		async getProject(input: GetDirectorProjectRepositoryInput) {
			const rows = await db
				.select()
				.from(directorProjects)
				.where(
					and(
						eq(directorProjects.id, input.projectId),
						eq(directorProjects.userId, input.userId),
						isNull(directorProjects.deletedAt),
					),
				)
				.limit(1);
			const row = rows[0];
			if (row === undefined) return undefined;
			const phases = await db
				.select()
				.from(directorPhaseStates)
				.where(eq(directorPhaseStates.projectId, row.id));
			const [scriptVersion] = await db
				.select()
				.from(directorScriptVersions)
				.where(eq(directorScriptVersions.projectId, row.id))
				.orderBy(desc(directorScriptVersions.version))
				.limit(1);
			if (scriptVersion === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_DATABASE_ERROR",
					`Director project has no screenplay version: ${row.id}`,
				);
			}
			const characterRows = await db
				.select()
				.from(directorCharacters)
				.where(
					and(
						eq(directorCharacters.projectId, row.id),
						isNull(directorCharacters.deletedAt),
					),
				)
				.orderBy(desc(directorCharacters.createdAt), desc(directorCharacters.id));
			const locationRows = await db
				.select()
				.from(directorLocations)
				.where(
					and(
						eq(directorLocations.projectId, row.id),
						isNull(directorLocations.deletedAt),
					),
				)
				.orderBy(desc(directorLocations.createdAt), desc(directorLocations.id));
			const assetRows = await db
				.select()
				.from(directorAssets)
				.where(
					and(
						eq(directorAssets.projectId, row.id),
						isNull(directorAssets.deletedAt),
					),
				)
				.orderBy(desc(directorAssets.createdAt), desc(directorAssets.id));
			const shotRows = await db
				.select()
				.from(directorShots)
				.where(
					and(
						eq(directorShots.projectId, row.id),
						isNull(directorShots.deletedAt),
					),
				)
				.orderBy(directorShots.sequence, desc(directorShots.createdAt), desc(directorShots.id));
			const runs = await db
				.select()
				.from(directorPhaseRuns)
				.where(eq(directorPhaseRuns.projectId, row.id))
				.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id));
			return toProjectDetail(row, phases, scriptVersion, characterRows, locationRows, assetRows, shotRows, runs);
		},

		async updateProject(input: UpdateDirectorProjectRepositoryInput) {
			const patch = input.patch;
			const now = new Date();
			await db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (current === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}

				const scriptChanged =
					(patch.storyText !== undefined && patch.storyText !== current.storyText) ||
					(patch.synopsis !== undefined && patch.synopsis !== current.synopsis);
				if (scriptChanged) {
					const [activeRun] = await tx
						.select({ id: directorPhaseRuns.id })
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								inArray(directorPhaseRuns.status, ["pending", "running"]),
							),
						)
						.limit(1);
					if (activeRun !== undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PROJECT_ACTIVE_RUN",
							"Project content cannot change while a director phase is running",
						);
					}
				}

				await tx
					.update(directorProjects)
					.set({
						...(patch.title !== undefined ? { title: patch.title } : {}),
						...(patch.storyText !== undefined ? { storyText: patch.storyText } : {}),
						...(patch.synopsis !== undefined ? { synopsis: patch.synopsis } : {}),
						updatedBy: input.userId,
						updatedAt: now,
					})
					.where(eq(directorProjects.id, input.projectId));

				if (scriptChanged) {
					const [latestScriptVersion] = await tx
						.select({ version: directorScriptVersions.version })
						.from(directorScriptVersions)
						.where(eq(directorScriptVersions.projectId, input.projectId))
						.orderBy(desc(directorScriptVersions.version))
						.limit(1);
					if (latestScriptVersion === undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_DATABASE_ERROR",
							`Director project has no screenplay version: ${input.projectId}`,
						);
					}
					await tx.insert(directorScriptVersions).values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						version: latestScriptVersion.version + 1,
						storyText: patch.storyText ?? current.storyText,
						synopsis:
							patch.synopsis === undefined
								? current.synopsis
								: patch.synopsis,
						createdBy: input.userId,
						createdAt: now,
						updatedAt: now,
					});
					const stalePatch = {
						staleAt: now,
						staleReason: "project_content_changed",
						updatedAt: now,
					};
					await tx
						.update(directorPhaseRuns)
						.set(stalePatch)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								isNull(directorPhaseRuns.staleAt),
							),
						);
					await tx
						.update(directorCharacters)
						.set(stalePatch)
						.where(
							and(
								eq(directorCharacters.projectId, input.projectId),
								isNull(directorCharacters.staleAt),
							),
						);
					await tx
						.update(directorLocations)
						.set(stalePatch)
						.where(
							and(
								eq(directorLocations.projectId, input.projectId),
								isNull(directorLocations.staleAt),
							),
						);
					await tx
						.update(directorAssets)
						.set(stalePatch)
						.where(
							and(
								eq(directorAssets.projectId, input.projectId),
								isNotNull(directorAssets.sourceRunId),
								isNull(directorAssets.staleAt),
							),
						);
					await tx
						.update(directorShots)
						.set(stalePatch)
						.where(
							and(
								eq(directorShots.projectId, input.projectId),
								isNull(directorShots.staleAt),
							),
						);
					await tx
						.update(directorPhaseStates)
						.set({
							status: "not_started",
							activeRunId: null,
							lastErrorJson: null,
							updatedBy: input.userId,
							updatedAt: now,
						})
						.where(eq(directorPhaseStates.projectId, input.projectId));
					await tx
						.update(directorPhaseStates)
						.set({ status: "ready", updatedBy: input.userId, updatedAt: now })
						.where(
							and(
								eq(directorPhaseStates.projectId, input.projectId),
								eq(directorPhaseStates.phase, DIRECTOR_PHASES[0]),
							),
						);
				}
			});
			const project = await this.getProject({
				userId: input.userId,
				projectId: input.projectId,
			});
			if (project === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_PROJECT_NOT_FOUND",
					`Director project not found: ${input.projectId}`,
				);
			}
			return project;
		},

		async attachAsset(input: AttachDirectorAssetRepositoryInput) {
			const now = new Date();
			return db.transaction(async (tx) => {
				const [project] = await tx
					.select({ id: directorProjects.id })
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}

				const [userAsset] = await tx
					.select()
					.from(userAssets)
					.where(
						and(
							eq(userAssets.id, input.assetId),
							eq(userAssets.userId, input.userId),
							isNull(userAssets.deletedAt),
						),
					)
					.limit(1);
				if (userAsset === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_ASSET_NOT_FOUND",
						`User asset not found: ${input.assetId}`,
					);
				}
				if (userAsset.kind !== "image") {
					throw new DirectorRepositoryError(
						"DIRECTOR_ASSET_KIND_NOT_SUPPORTED",
						"Only image assets can be used as character or location references",
					);
				}

				const expectedOwnerType =
					input.kind === "character_reference"
						? "character"
						: input.kind === "location_reference"
							? "location"
							: null;
				const ownerType = input.ownerType ?? null;
				const ownerId = input.ownerId ?? null;
				if (
					ownerType !== expectedOwnerType ||
					(ownerType === null ? ownerId !== null : ownerId === null)
				) {
					throw new DirectorRepositoryError(
						"DIRECTOR_ASSET_OWNER_INVALID",
						`Asset kind ${input.kind} does not match its owner`,
					);
				}

				const ownerFilter = ownerType === null
					? isNull(directorAssets.ownerType)
					: eq(directorAssets.ownerType, ownerType);
				const ownerIdFilter = ownerId === null
					? isNull(directorAssets.ownerId)
					: eq(directorAssets.ownerId, ownerId);
				const activeBindingFilter = and(
					eq(directorAssets.projectId, input.projectId),
					eq(directorAssets.kind, input.kind),
					eq(directorAssets.assetId, input.assetId),
					ownerFilter,
					ownerIdFilter,
					isNull(directorAssets.deletedAt),
				);
				const [existing] = await tx
					.select()
					.from(directorAssets)
					.where(activeBindingFilter)
					.limit(1);
				if (existing !== undefined) return toDirectorAsset(existing);

				if (ownerType === "character") {
					const [owner] = await tx
						.select()
						.from(directorCharacters)
						.where(
							and(
								eq(directorCharacters.id, ownerId as string),
								eq(directorCharacters.projectId, input.projectId),
								isNull(directorCharacters.deletedAt),
							),
						)
						.limit(1);
					if (owner === undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_ASSET_OWNER_NOT_FOUND",
							`Director character not found: ${ownerId}`,
						);
					}
					await tx
						.update(directorCharacters)
						.set({
							referenceAssetIdsJson: [...new Set([...owner.referenceAssetIdsJson, input.assetId])],
							updatedBy: input.userId,
							updatedAt: now,
						})
						.where(eq(directorCharacters.id, owner.id));
				} else if (ownerType === "location") {
					const [owner] = await tx
						.select()
						.from(directorLocations)
						.where(
							and(
								eq(directorLocations.id, ownerId as string),
								eq(directorLocations.projectId, input.projectId),
								isNull(directorLocations.deletedAt),
							),
						)
						.limit(1);
					if (owner === undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_ASSET_OWNER_NOT_FOUND",
							`Director location not found: ${ownerId}`,
						);
					}
					await tx
						.update(directorLocations)
						.set({
							referenceAssetIdsJson: [...new Set([...owner.referenceAssetIdsJson, input.assetId])],
							updatedBy: input.userId,
							updatedAt: now,
						})
						.where(eq(directorLocations.id, owner.id));
				}

				const [created] = await tx
					.insert(directorAssets)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						sourceRunId: null,
						kind: input.kind,
						ownerType,
						ownerId,
						assetId: input.assetId,
						version: 1,
						metadataJson: input.metadata ?? {},
						createdBy: input.userId,
						updatedBy: input.userId,
						createdAt: now,
						updatedAt: now,
					})
					.returning();
				if (created === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_DATABASE_ERROR",
						"Director asset binding could not be created",
					);
				}
				return toDirectorAsset(created);
			});
		},

		async detachAsset(input: DetachDirectorAssetRepositoryInput) {
			const now = new Date();
			await db.transaction(async (tx) => {
				const [project] = await tx
					.select({ id: directorProjects.id })
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}
				const [binding] = await tx
					.select()
					.from(directorAssets)
					.where(
						and(
							eq(directorAssets.id, input.directorAssetId),
							eq(directorAssets.projectId, input.projectId),
							isNull(directorAssets.deletedAt),
						),
					)
					.limit(1);
				if (binding === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_ASSET_NOT_FOUND",
						`Director asset binding not found: ${input.directorAssetId}`,
					);
				}
				await tx
					.update(directorAssets)
					.set({ deletedAt: now, deletedBy: input.userId, updatedBy: input.userId, updatedAt: now })
					.where(eq(directorAssets.id, binding.id));

				if (binding.ownerType !== "character" && binding.ownerType !== "location") return;
				if (binding.ownerId === null || binding.assetId === null) return;
				const sibling = and(
					eq(directorAssets.projectId, input.projectId),
					eq(directorAssets.ownerType, binding.ownerType),
					eq(directorAssets.ownerId, binding.ownerId),
					eq(directorAssets.assetId, binding.assetId),
					isNull(directorAssets.deletedAt),
				);
				const activeSiblings = await tx.select({ id: directorAssets.id }).from(directorAssets).where(sibling).limit(1);
				if (activeSiblings.length > 0) return;
				if (binding.ownerType === "character") {
					const [owner] = await tx
						.select()
						.from(directorCharacters)
						.where(
							and(
								eq(directorCharacters.id, binding.ownerId),
								eq(directorCharacters.projectId, input.projectId),
								isNull(directorCharacters.deletedAt),
							),
						)
						.limit(1);
					if (owner !== undefined) {
						await tx
							.update(directorCharacters)
							.set({
								referenceAssetIdsJson: owner.referenceAssetIdsJson.filter((assetId) => assetId !== binding.assetId),
								updatedBy: input.userId,
								updatedAt: now,
							})
							.where(eq(directorCharacters.id, owner.id));
					}
				} else {
					const [owner] = await tx
						.select()
						.from(directorLocations)
						.where(
							and(
								eq(directorLocations.id, binding.ownerId),
								eq(directorLocations.projectId, input.projectId),
								isNull(directorLocations.deletedAt),
							),
						)
						.limit(1);
					if (owner !== undefined) {
						await tx
							.update(directorLocations)
							.set({
								referenceAssetIdsJson: owner.referenceAssetIdsJson.filter((assetId) => assetId !== binding.assetId),
								updatedBy: input.userId,
								updatedAt: now,
							})
							.where(eq(directorLocations.id, owner.id));
					}
				}
			});
			const project = await this.getProject({ userId: input.userId, projectId: input.projectId });
			if (project === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_PROJECT_NOT_FOUND",
					`Director project not found: ${input.projectId}`,
				);
			}
			return project;
		},

		async updateShot(input: UpdateDirectorShotRepositoryInput) {
			const now = new Date();
			const updated = await db.transaction(async (tx) => {
				const [project] = await tx
					.select({ id: directorProjects.id })
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}
				const [current] = await tx
					.select()
					.from(directorShots)
					.where(
						and(
							eq(directorShots.id, input.shotId),
							eq(directorShots.projectId, input.projectId),
							isNull(directorShots.deletedAt),
						),
					)
					.limit(1);
				if (current === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_NOT_FOUND",
						`Director shot not found: ${input.shotId}`,
					);
				}

				const patch = input.patch;
				if (patch.expectedVersion !== undefined && patch.expectedVersion !== current.version) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_VERSION_CONFLICT",
						"This storyboard shot changed after the prompt suggestion was generated; refresh and review it again",
					);
				}
				const hasContentPatch = patch.narrative !== undefined
					|| patch.camera !== undefined
					|| patch.durationSeconds !== undefined
					|| patch.referenceAssetIds !== undefined
					|| patch.environmentPrompt !== undefined
					|| patch.videoPrompt !== undefined
					|| patch.negativePrompt !== undefined
					|| patch.dialogue !== undefined
					|| patch.continuity !== undefined;
				if (hasContentPatch) {
					const [activeRun] = await tx
						.select({ id: directorPhaseRuns.id })
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								inArray(directorPhaseRuns.status, ["pending", "running"]),
							),
						)
						.limit(1);
					if (activeRun !== undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PROJECT_ACTIVE_RUN",
							"Storyboard shot content cannot change while a director phase is running",
						);
					}
				}
				if (current.status === "generating" && hasContentPatch) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_GENERATING",
						"A storyboard shot cannot be edited while its video is generating",
					);
				}
				if (current.status === "locked" && (hasContentPatch || patch.status !== "needs_review")) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_LOCKED",
						"Locked director shots must be unlocked before editing",
					);
				}
				const nextStatus = patch.status ?? "needs_review";
				const referenceAssetIds = patch.referenceAssetIds ?? current.referenceAssetIdsJson;
				if (patch.referenceAssetIds !== undefined || nextStatus === "ready" || nextStatus === "locked") {
					const referenceRows = referenceAssetIds.length === 0
						? []
						: await tx
							.select({ id: directorAssets.id, kind: directorAssets.kind, staleAt: directorAssets.staleAt })
							.from(directorAssets)
							.where(
								and(
									eq(directorAssets.projectId, input.projectId),
									inArray(directorAssets.id, [...new Set(referenceAssetIds)]),
									isNull(directorAssets.deletedAt),
								),
							)
					if (referenceRows.length !== new Set(referenceAssetIds).size) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_REFERENCE_INVALID",
							"Every storyboard reference must point to an active asset binding in this project",
						);
					}
					if (referenceRows.some((row) => !["uploaded_reference", "character_reference", "location_reference"].includes(row.kind))) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_REFERENCE_INVALID",
							"Only image reference bindings can be used by a storyboard shot",
						);
					}
					const referenceKeys = stringArrayField(objectField(current.continuityJson).referenceKeys);
					if ((nextStatus === "ready" || nextStatus === "locked") && current.staleAt !== null) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_REFERENCE_INVALID",
							"Stale storyboard shots cannot be confirmed for video generation",
						);
					}
					if ((nextStatus === "ready" || nextStatus === "locked") && referenceKeys.length > 0 && referenceAssetIds.length === 0) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_REFERENCE_INVALID",
							"Resolve the suggested storyboard references before confirming this shot",
						);
					}
					if ((nextStatus === "ready" || nextStatus === "locked") && referenceRows.some((row) => row.staleAt !== null)) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_REFERENCE_INVALID",
							"Stale asset bindings cannot be used for video generation",
						);
					}
				}
				const [next] = await tx
					.update(directorShots)
					.set({
						...(patch.narrative !== undefined ? { narrative: patch.narrative } : {}),
						...(patch.camera !== undefined ? { cameraJson: patch.camera } : {}),
						...(patch.durationSeconds !== undefined ? { durationSeconds: patch.durationSeconds } : {}),
						...(patch.referenceAssetIds !== undefined ? { referenceAssetIdsJson: [...new Set(patch.referenceAssetIds)] } : {}),
						...(patch.environmentPrompt !== undefined ? { environmentPrompt: patch.environmentPrompt } : {}),
						...(patch.videoPrompt !== undefined ? { videoPrompt: patch.videoPrompt } : {}),
						...(patch.negativePrompt !== undefined ? { negativePrompt: patch.negativePrompt } : {}),
						...(patch.dialogue !== undefined ? { dialogueJson: patch.dialogue } : {}),
						...(patch.continuity !== undefined ? { continuityJson: patch.continuity } : {}),
						...(hasContentPatch ? { videoGenerationId: null, errorJson: null } : {}),
						status: nextStatus,
						version: current.version + 1,
						updatedBy: input.userId,
						updatedAt: now,
					})
					.where(eq(directorShots.id, current.id))
					.returning();
				if (hasContentPatch) {
					const continuityInputChanged = patch.narrative !== undefined
						|| patch.camera !== undefined
						|| patch.durationSeconds !== undefined
						|| patch.referenceAssetIds !== undefined
						|| patch.dialogue !== undefined
						|| patch.continuity !== undefined;
					const invalidatedPhases: DirectorPhase[] = continuityInputChanged
						? ["continuity", "rebuild", "dialogue", "videos", "bgm", "assemble"]
						: ["rebuild", "dialogue", "videos", "bgm", "assemble"];
					const firstInvalidatedPhase: DirectorPhase = continuityInputChanged ? "continuity" : "rebuild";
						const phaseStalePatch = {
							staleAt: now,
							staleReason: "storyboard_shot_changed",
							updatedAt: now,
						};
					await tx
						.update(directorPhaseRuns)
						.set(phaseStalePatch)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								inArray(directorPhaseRuns.phase, invalidatedPhases),
								isNull(directorPhaseRuns.staleAt),
							),
						);
					if (current.activeVideoAssetId !== null) {
						await tx
							.update(directorAssets)
							.set({ ...phaseStalePatch, updatedBy: input.userId })
							.where(
								and(
									eq(directorAssets.id, current.activeVideoAssetId),
									eq(directorAssets.projectId, input.projectId),
									isNull(directorAssets.deletedAt),
								),
							);
					}
					await tx
						.update(directorPhaseStates)
						.set({
							status: "not_started",
							activeRunId: null,
							lastErrorJson: null,
							updatedBy: input.userId,
							updatedAt: now,
						})
						.where(
							and(
								eq(directorPhaseStates.projectId, input.projectId),
								inArray(directorPhaseStates.phase, invalidatedPhases),
							),
						);
					await tx
						.update(directorPhaseStates)
						.set({ status: "ready", updatedBy: input.userId, updatedAt: now })
						.where(
							and(
								eq(directorPhaseStates.projectId, input.projectId),
								eq(directorPhaseStates.phase, firstInvalidatedPhase),
							),
						);
				}
				return next;
			});
			if (updated === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_SHOT_NOT_FOUND",
					`Director shot not found: ${input.shotId}`,
				);
			}
			return toShot(updated);
		},

		async startShotVideo(input: StartDirectorShotVideoRepositoryInput) {
			const now = new Date(input.now ?? new Date().toISOString());
			const updated = await db.transaction(async (tx) => {
				const [project] = await tx
					.select({ id: directorProjects.id })
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}
				const [current] = await tx
					.select()
					.from(directorShots)
					.where(
						and(
							eq(directorShots.id, input.shotId),
							eq(directorShots.projectId, input.projectId),
							isNull(directorShots.deletedAt),
						),
					)
					.for("update")
					.limit(1);
				if (current === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_NOT_FOUND",
						`Director shot not found: ${input.shotId}`,
					);
				}
				if (current.videoGenerationId !== null || current.status === "generating") {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_GENERATING",
						"This storyboard shot already has a video generation in progress",
					);
				}
				if ((current.status !== "locked" && current.status !== "failed") || current.staleAt !== null) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_REFERENCE_INVALID",
						"Only a current locked or failed storyboard shot can start video generation",
					);
				}

				const referenceAssetIds = [...new Set(current.referenceAssetIdsJson)];
				const referenceRows = referenceAssetIds.length === 0
					? []
					: await tx
						.select({ id: directorAssets.id, kind: directorAssets.kind, staleAt: directorAssets.staleAt })
						.from(directorAssets)
						.where(
							and(
								eq(directorAssets.projectId, input.projectId),
								inArray(directorAssets.id, referenceAssetIds),
								isNull(directorAssets.deletedAt),
							),
						);
				const referenceKeys = stringArrayField(objectField(current.continuityJson).referenceKeys);
				if (
					referenceRows.length !== referenceAssetIds.length
					|| referenceRows.some((row) => row.staleAt !== null || !["uploaded_reference", "character_reference", "location_reference"].includes(row.kind))
					|| (referenceKeys.length > 0 && referenceAssetIds.length === 0)
				) {
					throw new DirectorRepositoryError(
						"DIRECTOR_SHOT_REFERENCE_INVALID",
						"The locked storyboard shot contains an unavailable reference asset",
					);
				}

				const [next] = await tx
					.update(directorShots)
					.set({
						status: "generating",
						videoGenerationId: input.generationId,
						errorJson: null,
						version: current.version + 1,
						updatedBy: input.userId,
						updatedAt: now,
					})
					.where(eq(directorShots.id, current.id))
					.returning();
				return next;
			});
			if (updated === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_SHOT_NOT_FOUND",
					`Director shot not found: ${input.shotId}`,
				);
			}
			return toShot(updated);
		},

		async markShotVideoFailed(input: MarkDirectorShotVideoFailedRepositoryInput) {
			const now = new Date(input.now ?? new Date().toISOString());
			const [updated] = await db
				.update(directorShots)
				.set({
					status: "failed",
					videoGenerationId: null,
					errorJson: {
						code: input.error.code ?? "DIRECTOR_VIDEO_GENERATION_FAILED",
						message: input.error.message,
					},
					version: sql`${directorShots.version} + 1`,
					updatedBy: "worker",
					updatedAt: now,
				})
				.where(
					and(
						eq(directorShots.videoGenerationId, input.generationId),
						eq(directorShots.status, "generating"),
					),
				)
				.returning({ id: directorShots.id });
			return updated !== undefined;
		},

		async finalizeShotVideo(input: FinalizeDirectorShotVideoRepositoryInput) {
			const now = new Date(input.now ?? new Date().toISOString());
			return db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(directorShots)
					.where(
						and(
							eq(directorShots.videoGenerationId, input.generationId),
							eq(directorShots.status, "generating"),
							isNull(directorShots.deletedAt),
						),
					)
					.for("update")
					.limit(1);
				if (current === undefined) return false;

				const [userAsset] = await tx
					.select({ id: userAssets.id })
					.from(userAssets)
					.where(
						and(
							eq(userAssets.recordId, input.generationId),
							eq(userAssets.kind, "video"),
							eq(userAssets.status, "ready"),
							isNull(userAssets.deletedAt),
						),
					)
					.orderBy(userAssets.createdAt)
					.limit(1);
				if (userAsset === undefined) return false;

				if (current.activeVideoAssetId !== null) {
					await tx
						.update(directorAssets)
						.set({ staleAt: now, staleReason: "superseded_by_shot_video", updatedBy: "worker", updatedAt: now })
						.where(
							and(
								eq(directorAssets.id, current.activeVideoAssetId),
								eq(directorAssets.projectId, current.projectId),
								isNull(directorAssets.deletedAt),
							),
						);
				}
				const [created] = await tx
					.insert(directorAssets)
					.values({
						id: crypto.randomUUID(),
						projectId: current.projectId,
						sourceRunId: null,
						kind: "shot_video",
						ownerType: null,
						ownerId: null,
						assetId: userAsset.id,
						version: 1,
						metadataJson: { generationId: input.generationId, shotId: current.id },
						createdBy: "worker",
						updatedBy: "worker",
						createdAt: now,
						updatedAt: now,
					})
					.returning({ id: directorAssets.id });
				if (created === undefined) return false;

				await tx
					.update(directorShots)
					.set({
						status: "succeeded",
						videoGenerationId: null,
						activeVideoAssetId: created.id,
						errorJson: null,
						version: current.version + 1,
						updatedBy: "worker",
						updatedAt: now,
					})
					.where(eq(directorShots.id, current.id));
				return true;
			});
		},

		async finalizeDirectorMusic(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			return db.transaction(async (tx) => {
				const [project] = await tx
					.select({ id: directorProjects.id })
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) return undefined;

				const [existing] = await tx
					.select()
					.from(directorAssets)
					.where(
						and(
							eq(directorAssets.projectId, input.projectId),
							eq(directorAssets.sourceRunId, input.phaseRunId),
							eq(directorAssets.kind, "music"),
							isNull(directorAssets.deletedAt),
						),
					)
					.limit(1);
				if (existing !== undefined) return toDirectorAsset(existing);

				const [userAsset] = await tx
					.select({ id: userAssets.id })
					.from(userAssets)
					.where(
						and(
							eq(userAssets.userId, input.userId),
							eq(userAssets.recordId, input.generationId),
							eq(userAssets.kind, "audio"),
							eq(userAssets.status, "ready"),
							isNull(userAssets.deletedAt),
						),
					)
					.orderBy(userAssets.createdAt)
					.limit(1);
				if (userAsset === undefined) return undefined;

				await tx
					.update(directorAssets)
					.set({ staleAt: now, staleReason: "superseded_by_music", updatedBy: "worker", updatedAt: now })
					.where(
						and(
							eq(directorAssets.projectId, input.projectId),
							eq(directorAssets.kind, "music"),
							isNull(directorAssets.deletedAt),
							isNull(directorAssets.staleAt),
						),
					);
				const [created] = await tx
					.insert(directorAssets)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						sourceRunId: input.phaseRunId,
						kind: "music",
						ownerType: null,
						ownerId: null,
						assetId: userAsset.id,
						version: 1,
						metadataJson: { generationId: input.generationId },
						createdBy: "worker",
						updatedBy: "worker",
						createdAt: now,
						updatedAt: now,
					})
					.returning();
				return created === undefined ? undefined : toDirectorAsset(created);
			});
		},

		async requestPhaseRun(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			const runId = crypto.randomUUID();
			const taskId = crypto.randomUUID();
			const createdRun = await db.transaction(async (tx) => {
				const [project] = await tx
					.select()
					.from(directorProjects)
					.where(
						and(
							eq(directorProjects.id, input.projectId),
							eq(directorProjects.userId, input.userId),
							isNull(directorProjects.deletedAt),
						),
					)
					.limit(1);
				if (project === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PROJECT_NOT_FOUND",
						`Director project not found: ${input.projectId}`,
					);
				}
				const [scriptVersion] = await tx
					.select()
					.from(directorScriptVersions)
					.where(eq(directorScriptVersions.projectId, project.id))
					.orderBy(desc(directorScriptVersions.version))
					.limit(1);
				if (scriptVersion === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_DATABASE_ERROR",
						`Director project has no screenplay version: ${project.id}`,
					);
				}

				const [state] = await tx
					.select()
					.from(directorPhaseStates)
					.where(
						and(
							eq(directorPhaseStates.projectId, input.projectId),
							eq(directorPhaseStates.phase, input.phase),
						),
					)
					.limit(1);
				if (state === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PHASE_NOT_FOUND",
						`Director phase not found: ${input.phase}`,
					);
				}
				if (state.status !== "ready" && state.status !== "failed" && state.status !== "needs_review") {
					throw new DirectorRepositoryError(
						"DIRECTOR_PHASE_NOT_READY",
						`Director phase is not ready: ${input.phase}`,
					);
				}

				const inputSnapshot: Record<string, unknown> = {
					phase: input.phase,
					modelId: input.modelId,
					scriptVersionId: scriptVersion.id,
					title: project.title,
					storyText: scriptVersion.storyText,
					synopsis: scriptVersion.synopsis,
					settings: project.settingsJson,
				};
				if (input.phase === "bgm") {
					inputSnapshot.music = {
						prompt: input.prompt ?? null,
						lyrics: input.lyrics ?? null,
						isInstrumental: input.isInstrumental ?? false,
						enableAigcWatermark: input.enableAigcWatermark ?? false,
						gender: input.gender ?? "female",
						format: input.format ?? "mp3",
						duration: input.duration ?? 60,
					};
				}
				if (input.phase === "characters") {
					const [sourceRun] = await tx
						.select()
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "analyze"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					const analysis = sourceRun?.outputSummaryJson?.analysis;
					if (sourceRun === undefined || analysis === undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A succeeded screenplay analysis is required before generating characters",
						);
					}
					inputSnapshot.sourceRunId = sourceRun.id;
					inputSnapshot.analysis = analysis;
				} else if (input.phase === "locations") {
					const [sourceRun] = await tx
						.select()
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "characters"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					const characters = sourceRun?.outputSummaryJson?.characters;
					if (sourceRun === undefined || characters === undefined) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A succeeded character phase is required before generating locations",
						);
					}
					inputSnapshot.sourceRunId = sourceRun.id;
					inputSnapshot.characters = characters;
				} else if (input.phase === "storyboard") {
					const [analysisRun] = await tx
						.select()
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "analyze"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					const [charactersRun] = await tx
						.select()
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "characters"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					const [locationsRun] = await tx
						.select()
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "locations"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					const analysis = analysisRun?.outputSummaryJson?.analysis;
					const characters = charactersRun?.outputSummaryJson?.characters;
					const locations = locationsRun?.outputSummaryJson?.locations;
					if (
						analysisRun === undefined || analysis === undefined ||
						charactersRun === undefined || characters === undefined ||
						locationsRun === undefined || locations === undefined
					) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A succeeded screenplay analysis, character phase, and location phase are required before generating storyboard",
						);
					}
					inputSnapshot.sourceRunIds = {
						analysis: analysisRun.id,
						characters: charactersRun.id,
						locations: locationsRun.id,
					};
					inputSnapshot.analysis = analysis;
					inputSnapshot.characters = characters;
					inputSnapshot.locations = locations;
				} else if (input.phase === "continuity") {
					const shotRows = await tx
						.select({
							id: directorShots.id,
							sequence: directorShots.sequence,
							sceneNumber: directorShots.sceneNumber,
							slugline: directorShots.slugline,
							narrative: directorShots.narrative,
							camera: directorShots.cameraJson,
							durationSeconds: directorShots.durationSeconds,
							environmentPrompt: directorShots.environmentPrompt,
							videoPrompt: directorShots.videoPrompt,
							dialogue: directorShots.dialogueJson,
							continuity: directorShots.continuityJson,
						})
						.from(directorShots)
						.where(
							and(
								eq(directorShots.projectId, input.projectId),
								isNull(directorShots.deletedAt),
								isNull(directorShots.staleAt),
							),
						)
						.orderBy(directorShots.sequence);
					if (shotRows.length === 0) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A storyboard with at least one current shot is required before continuity review",
						);
					}
					inputSnapshot.shots = shotRows;
				} else if (input.phase === "rebuild") {
					const shotRows = await tx
						.select({
							id: directorShots.id,
							sequence: directorShots.sequence,
							sceneNumber: directorShots.sceneNumber,
							slugline: directorShots.slugline,
							narrative: directorShots.narrative,
							camera: directorShots.cameraJson,
							durationSeconds: directorShots.durationSeconds,
							environmentPrompt: directorShots.environmentPrompt,
							videoPrompt: directorShots.videoPrompt,
							negativePrompt: directorShots.negativePrompt,
							dialogue: directorShots.dialogueJson,
							continuity: directorShots.continuityJson,
							referenceAssetIds: directorShots.referenceAssetIdsJson,
						})
						.from(directorShots)
						.where(
							and(
								eq(directorShots.projectId, input.projectId),
								isNull(directorShots.deletedAt),
								isNull(directorShots.staleAt),
							),
						)
						.orderBy(directorShots.sequence);
					if (shotRows.length === 0) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A storyboard with at least one current shot is required before rebuilding video prompts",
						);
					}
					const [continuityRun] = await tx
						.select({ outputSummary: directorPhaseRuns.outputSummaryJson })
						.from(directorPhaseRuns)
						.where(
							and(
								eq(directorPhaseRuns.projectId, input.projectId),
								eq(directorPhaseRuns.phase, "continuity"),
								eq(directorPhaseRuns.status, "succeeded"),
								isNull(directorPhaseRuns.staleAt),
							),
						)
						.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id))
						.limit(1);
					inputSnapshot.shots = shotRows;
					inputSnapshot.continuity = continuityRun?.outputSummary?.continuity ?? null;
				} else if (input.phase === "dialogue") {
					const shotRows = await tx
						.select({
							id: directorShots.id,
							sequence: directorShots.sequence,
							sceneNumber: directorShots.sceneNumber,
							slugline: directorShots.slugline,
							narrative: directorShots.narrative,
							dialogue: directorShots.dialogueJson,
							continuity: directorShots.continuityJson,
						})
						.from(directorShots)
						.where(
							and(
								eq(directorShots.projectId, input.projectId),
								isNull(directorShots.deletedAt),
								isNull(directorShots.staleAt),
							),
						)
						.orderBy(directorShots.sequence);
					if (shotRows.length === 0) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"A storyboard with at least one current shot is required before rebuilding dialogue",
						);
					}
					inputSnapshot.shots = shotRows;
				} else if (input.phase === "videos") {
					const shotConditions = [
						eq(directorShots.projectId, input.projectId),
						isNull(directorShots.deletedAt),
						isNull(directorShots.staleAt),
						...(input.shotId === undefined ? [] : [eq(directorShots.id, input.shotId)]),
					];
					const shotRows = await tx
						.select({
							id: directorShots.id,
							sequence: directorShots.sequence,
							status: directorShots.status,
							videoGenerationId: directorShots.videoGenerationId,
							referenceAssetIds: directorShots.referenceAssetIdsJson,
						})
						.from(directorShots)
						.where(
							and(...shotConditions),
						)
						.orderBy(directorShots.sequence);
					if (input.shotId !== undefined && shotRows.length === 0) {
						throw new DirectorRepositoryError(
							"DIRECTOR_SHOT_NOT_FOUND",
							`Director shot not found: ${input.shotId}`,
						);
					}
					if (
						shotRows.length === 0
						|| shotRows.some((shot) => !["locked", "failed", "generating", "succeeded"].includes(shot.status))
						|| shotRows.some((shot) => shot.status === "generating" && shot.videoGenerationId === null)
					) {
						throw new DirectorRepositoryError(
							"DIRECTOR_PHASE_INPUT_NOT_READY",
							"Every current storyboard shot must be locked, resumable, or already generated before starting video generation",
						);
					}
					if (input.shotId !== undefined && shotRows[0]?.status !== "locked" && shotRows[0]?.status !== "failed") {
						throw new DirectorRepositoryError(
							shotRows[0]?.status === "generating" ? "DIRECTOR_SHOT_GENERATING" : "DIRECTOR_PHASE_INPUT_NOT_READY",
							"Only a locked or failed storyboard shot can start an individual video generation",
						);
					}
					inputSnapshot.shots = shotRows;
					if (input.shotId !== undefined) inputSnapshot.shotId = input.shotId;
				}

				const version = state.version + 1;
				const [run] = await tx
					.insert(directorPhaseRuns)
					.values({
						id: runId,
						projectId: input.projectId,
						scriptVersionId: scriptVersion.id,
						phase: input.phase,
						status: "pending",
						version,
						inputSnapshotJson: inputSnapshot,
						taskId,
						createdBy: input.userId,
						updatedBy: input.userId,
						createdAt: now,
						updatedAt: now,
					})
					.onConflictDoNothing()
					.returning();
				if (run === undefined) {
					throw new DirectorRepositoryError(
						"DIRECTOR_PHASE_ALREADY_RUNNING",
						`Director phase already has an active run: ${input.phase}`,
					);
				}

				await tx.insert(taskRecords).values({
					id: taskId,
					type: "director.phase",
					domain: "director",
					status: "queued",
					priority: 0,
					inputJson: {
						projectId: input.projectId,
						phaseRunId: runId,
						phase: input.phase,
						modelId: input.modelId,
					},
					attempts: 0,
					maxAttempts: input.phase === "videos" ? 360 : 60,
					nextRunAt: now,
					recordId: runId,
					userId: input.userId,
					createdBy: input.userId,
					updatedBy: input.userId,
					createdAt: now,
					updatedAt: now,
				});

				await tx
					.update(directorPhaseStates)
					.set({
						status: "queued",
						version,
						activeRunId: runId,
						lastErrorJson: null,
						updatedBy: input.userId,
						updatedAt: now,
					})
					.where(eq(directorPhaseStates.id, state.id));
				await tx
					.update(directorProjects)
					.set({ status: "active", updatedBy: input.userId, updatedAt: now })
					.where(eq(directorProjects.id, input.projectId));
				return run;
			});
			return toPhaseRun(createdRun);
		},

		async getPhaseRun(input) {
			const [row] = await db
				.select({ run: directorPhaseRuns })
				.from(directorPhaseRuns)
				.innerJoin(
					directorProjects,
					eq(directorPhaseRuns.projectId, directorProjects.id),
				)
				.where(
					and(
						eq(directorPhaseRuns.id, input.runId),
						eq(directorPhaseRuns.projectId, input.projectId),
						eq(directorPhaseRuns.phase, input.phase),
						eq(directorProjects.userId, input.userId),
						isNull(directorProjects.deletedAt),
					),
				)
				.limit(1);
			return row === undefined ? undefined : toPhaseRun(row.run);
		},

		async getPhaseRunForWorker(runId) {
			const [row] = await db
				.select()
				.from(directorPhaseRuns)
				.where(eq(directorPhaseRuns.id, runId))
				.limit(1);
			return row === undefined ? undefined : toWorkerPhaseRun(row);
		},

		async markPhaseRunRunning(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			return db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(directorPhaseRuns)
					.where(eq(directorPhaseRuns.id, input.runId))
					.limit(1);
				if (current === undefined) return undefined;
				if (current.status === "pending") {
					const [updated] = await tx
						.update(directorPhaseRuns)
						.set({ status: "running", startedAt: now, updatedAt: now })
						.where(eq(directorPhaseRuns.id, input.runId))
						.returning();
					if (updated !== undefined) {
						await tx
							.update(directorPhaseStates)
							.set({ status: "running", updatedBy: "worker", updatedAt: now })
							.where(
								and(
									eq(directorPhaseStates.activeRunId, input.runId),
									eq(directorPhaseStates.status, "queued"),
								),
							);
						return toPhaseRun(updated);
					}
				}
				return toPhaseRun(current);
			});
		},

		async setPhaseRunProgress(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			const [current] = await db
				.select()
				.from(directorPhaseRuns)
				.where(eq(directorPhaseRuns.id, input.runId))
				.limit(1);
			if (current === undefined) return undefined;
			const [updated] = await db
				.update(directorPhaseRuns)
				.set({
					outputSummaryJson: { ...(current.outputSummaryJson ?? {}), ...input.outputSummary },
					updatedAt: now,
				})
				.where(and(eq(directorPhaseRuns.id, input.runId), eq(directorPhaseRuns.status, "running")))
				.returning();
			return updated === undefined ? undefined : toPhaseRun(updated);
		},

		async completePhaseRun(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			return db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(directorPhaseRuns)
					.where(eq(directorPhaseRuns.id, input.runId))
					.limit(1);
				if (current === undefined) return undefined;
				if (current.status === "succeeded") return toPhaseRun(current);
				if (current.status !== "running") return undefined;
				const [updated] = await tx
					.update(directorPhaseRuns)
					.set({
						status: "succeeded",
						outputSummaryJson: { ...(current.outputSummaryJson ?? {}), ...input.outputSummary },
						completedAt: now,
						updatedAt: now,
					})
					.where(eq(directorPhaseRuns.id, input.runId))
					.returning();
				if (updated === undefined) return undefined;
				const outputSummary = {
					...(current.outputSummaryJson ?? {}),
					...input.outputSummary,
				};
				await materializePhaseOutput(tx, current, outputSummary, now);

				const incompleteVideoShots = current.phase === "videos"
					? await tx
						.select({ id: directorShots.id })
						.from(directorShots)
						.where(
							and(
								eq(directorShots.projectId, current.projectId),
								ne(directorShots.status, "succeeded"),
								isNull(directorShots.deletedAt),
								isNull(directorShots.staleAt),
							),
						)
						.limit(1)
					: [];
				const phaseCompleted = incompleteVideoShots.length === 0;
				const phaseIndex = DIRECTOR_PHASES.indexOf(current.phase as DirectorPhase);
				await tx
					.update(directorPhaseStates)
					.set({ status: phaseCompleted ? "completed" : "ready", activeRunId: null, lastErrorJson: null, updatedBy: "worker", updatedAt: now })
					.where(eq(directorPhaseStates.activeRunId, input.runId));
				const nextPhase = DIRECTOR_PHASES[phaseIndex + 1];
				if (phaseCompleted && nextPhase !== undefined) {
					await tx
						.update(directorPhaseStates)
						.set({ status: "ready", updatedBy: "worker", updatedAt: now })
						.where(
							and(
								eq(directorPhaseStates.projectId, current.projectId),
								eq(directorPhaseStates.phase, nextPhase),
								eq(directorPhaseStates.status, "not_started"),
							),
						);
					await tx
						.update(directorProjects)
						.set({ status: "active", updatedBy: "worker", updatedAt: now })
						.where(eq(directorProjects.id, current.projectId));
				} else if (phaseCompleted) {
					await tx
						.update(directorProjects)
						.set({ status: "completed", updatedBy: "worker", updatedAt: now })
						.where(eq(directorProjects.id, current.projectId));
				} else {
					await tx
						.update(directorProjects)
						.set({ status: "active", updatedBy: "worker", updatedAt: now })
						.where(eq(directorProjects.id, current.projectId));
				}
				return toPhaseRun(updated);
			});
		},

		async failPhaseRun(input) {
			const now = new Date(input.now ?? new Date().toISOString());
			return db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(directorPhaseRuns)
					.where(eq(directorPhaseRuns.id, input.runId))
					.limit(1);
				if (current === undefined) return undefined;
				if (current.status === "failed") return toPhaseRun(current);
				if (current.status !== "running") return undefined;
				const [updated] = await tx
					.update(directorPhaseRuns)
					.set({ status: "failed", errorJson: input.error, completedAt: now, updatedAt: now })
					.where(eq(directorPhaseRuns.id, input.runId))
					.returning();
				if (updated === undefined) return undefined;
				await tx
					.update(directorPhaseStates)
					.set({
						status: "failed",
						activeRunId: null,
						lastErrorJson: input.error,
						updatedBy: "worker",
						updatedAt: now,
					})
					.where(eq(directorPhaseStates.activeRunId, input.runId));
				return toPhaseRun(updated);
			});
		},
	};
}
