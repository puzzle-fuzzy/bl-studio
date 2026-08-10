import {
	type BailianStudioDb,
	directorPhaseStates,
	directorProjects,
} from "@bailian-studio/db";
import {
	DIRECTOR_PHASES,
	type DirectorPhase,
	type DirectorPhaseState,
	type DirectorProjectDetail,
	type DirectorProjectProgress,
	type DirectorProjectStatus,
} from "@bailian-studio/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
): DirectorPhaseState {
	return {
		phase: row.phase as DirectorPhase,
		status: row.status as DirectorPhaseState["status"],
		version: row.version,
		activeRunId: row.activeRunId,
		lastError: row.lastErrorJson,
		updatedAt: row.updatedAt.toISOString(),
	};
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
): DirectorProjectRepositoryDetail {
	const phases = phaseRows
		.map(toPhaseState)
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
	const states = phaseRows.map(toPhaseState);
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
			return toProjectDetail(row, phases);
		},

		async updateProject(input: UpdateDirectorProjectRepositoryInput) {
			const patch = input.patch;
			const values = {
				...(patch.title !== undefined ? { title: patch.title } : {}),
				...(patch.storyText !== undefined
					? { storyText: patch.storyText }
					: {}),
				...(patch.synopsis !== undefined ? { synopsis: patch.synopsis } : {}),
				updatedBy: input.userId,
				updatedAt: new Date(),
			};
			const updated = await db
				.update(directorProjects)
				.set(values)
				.where(
					and(
						eq(directorProjects.id, input.projectId),
						eq(directorProjects.userId, input.userId),
						isNull(directorProjects.deletedAt),
					),
				)
				.returning({ id: directorProjects.id });
			if (updated[0] === undefined) {
				throw new DirectorRepositoryError(
					"DIRECTOR_PROJECT_NOT_FOUND",
					`Director project not found: ${input.projectId}`,
				);
			}
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
	};
}
