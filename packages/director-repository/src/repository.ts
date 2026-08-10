import {
	type BailianStudioDb,
	directorAssets,
	directorCharacters,
	directorLocations,
	directorPhaseRuns,
	directorPhaseStates,
	directorProjects,
	directorScriptVersions,
	directorShots,
	taskRecords,
} from "@bailian-studio/db";
import {
	DIRECTOR_PHASES,
	type DirectorPhase,
	type DirectorPhaseRun,
	type DirectorPhaseState,
	type DirectorProjectDetail,
	type DirectorProjectProgress,
	type DirectorProjectStatus,
	type DirectorScriptVersion,
} from "@bailian-studio/shared";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
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
		phases,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
	return detail;
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
			const runs = await db
				.select()
				.from(directorPhaseRuns)
				.where(eq(directorPhaseRuns.projectId, row.id))
				.orderBy(desc(directorPhaseRuns.createdAt), desc(directorPhaseRuns.id));
			return toProjectDetail(row, phases, scriptVersion, runs);
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
					maxAttempts: 3,
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

				const phaseIndex = DIRECTOR_PHASES.indexOf(current.phase as DirectorPhase);
				await tx
					.update(directorPhaseStates)
					.set({ status: "completed", activeRunId: null, lastErrorJson: null, updatedBy: "worker", updatedAt: now })
					.where(eq(directorPhaseStates.activeRunId, input.runId));
				const nextPhase = DIRECTOR_PHASES[phaseIndex + 1];
				if (nextPhase !== undefined) {
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
				} else {
					await tx
						.update(directorProjects)
						.set({ status: "completed", updatedBy: "worker", updatedAt: now })
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
