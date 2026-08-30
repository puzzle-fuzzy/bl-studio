import {
	encodeSSE,
	generationEventNameForStatus,
	makeGenerationEvent,
} from "@bailian-studio/event-bus";
import type {
	DailyGenerationUsage,
	GenerationEstimate,
	GenerationEvent,
	GenerationRepository,
} from "@bailian-studio/generation-repository";
import {
	CreateGenerationSchema,
	GetGenerationSchema,
	ListGenerationsSchema,
	SetGenerationLibraryStateSchema,
	validateInput,
} from "@bailian-studio/shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { ApiDependencies } from "../../dependencies";
import { auditErrorCode, recordApiAuditEvent } from "../../lib/audit";
import { requestErrorResponseBody } from "../../lib/http-errors";
import { getRequestTrace } from "../../lib/middleware";
import { resolveArtifactReadUrlUseCase } from "../artifacts/service";
import { requireAuthUser } from "../auth/session";
import { createShareUseCase } from "../shares/service";
import { attachGenerationThumbnailUrls } from "./thumbnails";

const CreateGenerationShareSchema = z
	.object({
		/** Prompt/参数可能包含个人创作内容，必须显式选择才可公开。 */
		includeParams: z.boolean().optional(),
		/** 过期时间必须是可解析且位于未来的 ISO 时间。 */
		expiresAt: z
			.string()
			.refine((value) => {
				const timestamp = Date.parse(value);
				return Number.isFinite(timestamp) && timestamp > Date.now();
			}, "expiresAt must be a future ISO timestamp")
			.optional(),
	})
	.strict();

const RetryGenerationSchema = z
	.object({
		idempotencyKey: z.string().min(1).max(256).optional(),
	})
	.strict()
	.optional();

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/** P1-17：回放每页大小与最大页数。逐页翻直到一页不满或达到上限，追平最新游标。 */
const REPLAY_PAGE_SIZE = 500;
const REPLAY_MAX_PAGES = 20;

const SSE_RESPONSE_HEADERS = {
	"content-type": "text/event-stream; charset=utf-8",
	"cache-control": "no-cache, no-transform",
	connection: "keep-alive",
} as const;

export function createGenerationRoutes(deps: ApiDependencies) {
	const repository = deps.generationRepository;
	const generationService = deps.generationApplicationService;
	const shareUseCase = createShareUseCase({ repository: deps.shareRepository });
	const resolveArtifactReadUrl = resolveArtifactReadUrlUseCase({
		storage: deps.storage,
	});
	return new Elysia({ prefix: "/api/generations" })
		.post("/estimate", async ({ request, body }) => {
			const user = await requireAuthUser(request, deps.authService);
			const input = validateInput(CreateGenerationSchema, body);
			const { estimate, usage } = await generationService.estimate({
				...input,
				userId: user.id,
			});
			const balance = await deps.creditLedger.getBalance({ userId: user.id });
			return {
				success: true,
				data: {
					estimate: toEstimateResponse(
						estimate,
						usage,
						balance,
						deps.generationLimits,
					),
				},
			};
		})
		.post("/", async ({ request, body, set }) => {
			// userId 来自已认证的会话 cookie，绝不取自请求体——
			// 客户端无法冒用其他用户的 id（堵死 IDOR 漏洞）。
			const user = await requireAuthUser(request, deps.authService);
			try {
				const input = validateInput(CreateGenerationSchema, body);
				const traceId =
					getRequestTrace(request)?.requestId ?? crypto.randomUUID();
				const { result } = await generationService.create({
					...input,
					userId: user.id,
					traceId,
				});
				if (result.record.traceId !== undefined)
					set.headers["x-trace-id"] = result.record.traceId;

				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.create",
					outcome: "succeeded",
					targetType: "generation",
					targetId: result.record.id,
					metadata: {
						modelId: result.record.modelId,
						category: result.record.category,
						estimatedCostCents: result.record.costEstimate,
					},
				});

				const event = {
					// 事件 id 由 repository 在与 record/task 同一事务内生成并提交。
					// 它是 SSE 重连游标。事件名与 outbox listener/重放路径一致（P2-21）：
					// 创建即首个 status 事件，统一发 generation.status，由 hub 按 id 去重。
					id: result.event.id,
					...makeGenerationEvent("generation.status", {
						recordId: result.record.id,
						userId: result.record.userId,
						status: result.record.status,
						modelId: result.record.modelId,
						updatedAt: result.record.updatedAt,
					}),
				};
				deps.generationSseHub.publish(event);

				return {
					success: true,
					data: { record: result.record, task: result.task, event },
				};
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.create",
					outcome: "failed",
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.get("/events", async ({ request }) => {
			const user = await requireAuthUser(request, deps.authService);
			const encoder = new TextEncoder();
			const lastEventId = request.headers.get("last-event-id")?.trim();

			if (lastEventId !== undefined && lastEventId.length > 0) {
				const cursor = await repository.getGenerationEvent(
					lastEventId,
					user.id,
				);
				if (cursor === undefined) {
					// P1-17：浏览器 EventSource 读不到 410 响应体，会带同一个 Last-Event-ID
					// 无限重试。改为在 200 SSE 流内发 `cursor-expired` 事件后立即关闭：
					// 前端收到后重建 EventSource（无 Last-Event-ID）一次性重新追平。
					return sseResponseWithSingleEvent(
						encodeSSE({
							event: "cursor-expired",
							data: { serverTime: new Date().toISOString() },
						}),
					);
				}
			}

			// 长连接 SSE：先原子地订阅并取出缓冲事件，再把它们写入流，避免事件落在
			// drain 与 subscribe 之间的窗口。heartbeat 用来保持长连接穿过代理的空闲超时。
			let unsubscribe: (() => void) | undefined;
			let heartbeat: ReturnType<typeof setInterval> | undefined;
			let closed = false;
			const sentEventIds = new Set<string>();
			const cleanup = () => {
				if (closed) return;
				closed = true;
				if (heartbeat !== undefined) clearInterval(heartbeat);
				unsubscribe?.();
			};

			return new Response(
				new ReadableStream({
					start(controller) {
						const send = (chunk: string) => {
							if (closed) return;
							const eventId = readSseEventId(chunk);
							if (eventId !== undefined) sentEventIds.add(eventId);
							try {
								controller.enqueue(encoder.encode(chunk));
							} catch {
								// 事件发布与流取消之间客户端可能已消失。立即释放 hub 监听器与定时器。
								cleanup();
							}
						};
						send(
							encodeSSE({
								event: "connected",
								data: { serverTime: new Date().toISOString() },
							}),
						);
						const subscription = deps.generationSseHub.subscribeAndDrain(
							user.id,
							send,
						);
						unsubscribe = subscription.unsubscribe;
						for (const chunk of subscription.buffered) send(chunk);
						if (lastEventId !== undefined && lastEventId.length > 0) {
							// P1-17：分页追平，而不是只拉一页 500 条——断线期间超过 500 事件也逐页补齐。
							void replayGenerationEvents(repository, {
								userId: user.id,
								afterId: lastEventId,
							})
								.then((events) => {
									for (const event of events) {
										if (sentEventIds.has(event.id)) continue;
										send(
											encodeSSE({
												id: event.id,
												...generationEventFromRepositoryEvent(event),
											}),
										);
									}
								})
								.catch(() => {
									// 保持实时流打开；浏览器会用相同的 Last-Event-ID 重试，
									// 下一次请求即可再次追平。
								});
						}
						heartbeat = setInterval(() => {
							send(
								encodeSSE({
									event: "heartbeat",
									data: { serverTime: new Date().toISOString() },
								}),
							);
						}, SSE_HEARTBEAT_INTERVAL_MS);
					},
					cancel: cleanup,
				}),
				{
					headers: SSE_RESPONSE_HEADERS,
				},
			);
		})
		.get("/", async ({ request, query }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { limit, cursor, status, views } = validateInput(
				ListGenerationsSchema,
				query,
			);
			const data = await repository.listGenerationRecords(user.id, {
				limit,
				...(cursor !== undefined ? { cursor } : {}),
				...(status !== undefined ? { status } : {}),
				...(views !== undefined ? { views } : {}),
			});
			const artifacts = await repository.listArtifactsForRecords(
				data.items.map((record) => record.id),
			);
			const items = await attachGenerationThumbnailUrls(
				data.items,
				artifacts,
				deps.storage,
			);
			return { success: true, data: { ...data, items } };
		})
		.get("/:id/artifacts", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);

			const record = await repository.getGenerationRecord(id);
			if (record === undefined || record.userId !== user.id) {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"GENERATION_NOT_FOUND",
					`Generation not found: ${id}`,
					set,
				);
			}

			const artifacts = await repository.listArtifactsForRecord(id);
			const data = await Promise.all(
				artifacts.map((artifact) =>
					resolveArtifactReadUrl.execute({ artifact }),
				),
			);
			await Promise.all(
				data
					.filter((artifact) => artifact.readUrl !== undefined)
					.map((artifact) =>
						recordApiAuditEvent(deps.auditRepository, request, {
							userId: user.id,
							action: "artifact.read",
							outcome: "succeeded",
							targetType: "artifact",
							targetId: artifact.id,
							metadata: { source: "generation_detail", generationId: id },
						}),
					),
			);
			return { success: true, data: { items: data } };
		})
		.get("/:id/diagnostics", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			const record = await repository.getGenerationRecord(id);
			if (record === undefined || record.userId !== user.id) {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"GENERATION_NOT_FOUND",
					`Generation not found: ${id}`,
					set,
				);
			}

			const diagnostics =
				await deps.generationDiagnosticsRepository.getGenerationDiagnostics(id);

			return { success: true, data: diagnostics };
		})
		.post("/:id/share", async ({ request, params, body, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			const input = CreateGenerationShareSchema.parse(body ?? {});

			try {
				const result = await shareUseCase.create({
					recordId: id,
					userId: user.id,
					...(input.includeParams !== undefined
						? { includeParams: input.includeParams }
						: {}),
					...(input.expiresAt !== undefined
						? { expiresAt: input.expiresAt }
						: {}),
				});
				if (result.kind === "generation_not_found") {
					await recordApiAuditEvent(deps.auditRepository, request, {
						userId: user.id,
						action: "share.create",
						outcome: "failed",
						targetType: "generation",
						targetId: id,
						metadata: { shareNotFound: true },
					});
					set.status = 404;
					return requestErrorResponseBody(
						request,
						"GENERATION_NOT_FOUND",
						`Generation not found: ${id}`,
						set,
					);
				}
				const share = result.share;
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "share.create",
					outcome: "succeeded",
					targetType: "share",
					targetId: share.id,
					metadata: { generationId: id, includeParams: share.includeParams },
				});
				return { success: true, data: { share } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "share.create",
					outcome: "failed",
					targetType: "generation",
					targetId: id,
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.get("/:id/share", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);

			const result = await shareUseCase.get({ recordId: id, userId: user.id });
			if (result.kind === "generation_not_found") {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"GENERATION_NOT_FOUND",
					`Generation not found: ${id}`,
					set,
				);
			}
			if (result.kind === "share_not_found") {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"GENERATION_SHARE_NOT_FOUND",
					`Generation share not found: ${id}`,
					set,
				);
			}

			return { success: true, data: { share: result.share } };
		})
		.delete("/:id/share", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			try {
				const result = await shareUseCase.revoke({
					recordId: id,
					userId: user.id,
				});
				if (result.kind === "share_not_found") {
					await recordApiAuditEvent(deps.auditRepository, request, {
						userId: user.id,
						action: "share.revoke",
						outcome: "failed",
						targetType: "generation",
						targetId: id,
						metadata: { shareNotFound: true },
					});
					set.status = 404;
					return requestErrorResponseBody(
						request,
						"GENERATION_SHARE_NOT_FOUND",
						`Generation share not found: ${id}`,
						set,
					);
				}
				const share = result.share;
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "share.revoke",
					outcome: "succeeded",
					targetType: "share",
					targetId: share.id,
					metadata: { generationId: id },
				});
				return { success: true, data: { share } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "share.revoke",
					outcome: "failed",
					targetType: "generation",
					targetId: id,
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.patch("/:id/library-state", async ({ request, params, body }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			const { state } = validateInput(
				SetGenerationLibraryStateSchema,
				body,
				"generation library state body",
			);
			const action =
				state === "hidden"
					? "generation.hide"
					: state === "deleted"
						? "generation.delete"
						: "generation.restore";

			try {
				const record = await repository.setGenerationLibraryState({
					recordId: id,
					userId: user.id,
					state,
				});
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action,
					outcome: "succeeded",
					targetType: "generation",
					targetId: id,
					metadata: { libraryState: state },
				});
				return { success: true, data: { record } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action,
					outcome: "failed",
					targetType: "generation",
					targetId: id,
					metadata: {
						libraryState: state,
						errorCode: auditErrorCode(error),
					},
				});
				throw error;
			}
		})
		.get("/:id", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);

			const record = await repository.getGenerationRecord(id);
			// IDOR 防护：记录不存在与属于他人一律返回 404，
			// 从而响应永远不会向非所有者泄露记录是否存在。
			if (record === undefined || record.userId !== user.id) {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"GENERATION_NOT_FOUND",
					`Generation not found: ${id}`,
					set,
				);
			}

			return { success: true, data: record };
		})
		.post("/:id/cancel", async ({ request, params }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			try {
				const record = await generationService.cancel({
					recordId: id,
					userId: user.id,
				});
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.cancel",
					outcome: "succeeded",
					targetType: "generation",
					targetId: id,
					metadata: {
						status: record.status,
						providerCancelStatus: record.providerCancelStatus,
					},
				});
				return { success: true, data: { record } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.cancel",
					outcome: "failed",
					targetType: "generation",
					targetId: id,
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.post("/:id/retry", async ({ request, params, body }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { id } = validateInput(GetGenerationSchema, params);
			const retryInput = validateInput(
				RetryGenerationSchema,
				body ?? {},
				"retry body",
			);
			try {
				const result = await generationService.retry({
					recordId: id,
					userId: user.id,
					...(retryInput?.idempotencyKey !== undefined
						? { idempotencyKey: retryInput.idempotencyKey }
						: {}),
				});
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.retry",
					outcome: "succeeded",
					targetType: "generation",
					targetId: id,
					metadata: {
						newGenerationId: result.record.id,
						modelId: result.record.modelId,
					},
				});
				const event = {
					id: result.event.id,
					...makeGenerationEvent("generation.status", {
						recordId: result.record.id,
						userId: result.record.userId,
						status: result.record.status,
						modelId: result.record.modelId,
						updatedAt: result.record.updatedAt,
					}),
				};
				deps.generationSseHub.publish(event);
				return {
					success: true,
					data: { record: result.record, task: result.task, event },
				};
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "generation.retry",
					outcome: "failed",
					targetType: "generation",
					targetId: id,
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		});
}

function readSseEventId(chunk: string): string | undefined {
	const line = chunk.split("\n").find((value) => value.startsWith("id:"));
	const id = line?.slice(3).trim();
	return id === undefined || id.length === 0 ? undefined : id;
}

/**
 * P1-17：分页回放 Last-Event-ID 之后的事件，追平到最新游标。
 * 以最后一页的事件 (id, createdAt) 作下页 afterCursor，直到一页不满
 * （已到最新）或达到页数上限（极端追不回时交给实时流 + 前端重建游标兜底）。
 */
export async function replayGenerationEvents(
	repository: Pick<GenerationRepository, "listGenerationEvents">,
	input: { userId: string; afterId: string },
): Promise<GenerationEvent[]> {
	const events: GenerationEvent[] = [];
	let cursor: { id: string; createdAt: string } | undefined;
	for (let page = 0; page < REPLAY_MAX_PAGES; page++) {
		const pageEvents = await repository.listGenerationEvents({
			userId: input.userId,
			...(cursor === undefined
				? { afterId: input.afterId }
				: { afterCursor: cursor }),
			limit: REPLAY_PAGE_SIZE,
		});
		events.push(...pageEvents);
		if (pageEvents.length < REPLAY_PAGE_SIZE) return events;
		const last = pageEvents[pageEvents.length - 1];
		if (last === undefined) return events;
		cursor = { id: last.id, createdAt: last.createdAt };
	}
	return events;
}

/** P1-17：构造一个发送单个 SSE 事件后立即关闭的响应（cursor-expired 重试终止信号）。 */
function sseResponseWithSingleEvent(chunk: string): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(chunk));
				controller.close();
			},
		}),
		{ headers: SSE_RESPONSE_HEADERS },
	);
}

function generationEventFromRepositoryEvent(event: GenerationEvent) {
	return makeGenerationEvent(generationEventNameForStatus(event.status), {
		recordId: event.recordId,
		userId: event.userId,
		status: event.status,
		modelId: event.modelId,
		updatedAt: event.updatedAt,
	});
}

function toEstimateResponse(
	estimate: GenerationEstimate,
	usage: DailyGenerationUsage,
	balance: { availableCents: number; reservedCents: number },
	limits: ApiDependencies["generationLimits"],
) {
	return {
		modelId: estimate.modelId,
		provider: estimate.provider,
		providerModel: estimate.providerModel,
		category: estimate.category,
		params: estimate.params,
		costEstimate: estimate.costEstimate,
		currency: estimate.currency,
		credits: {
			availableCents: balance.availableCents,
			reservedCents: balance.reservedCents,
			canAfford: balance.availableCents >= estimate.costEstimate,
		},
		usage: {
			attemptCount: usage.attemptCount,
			successfulCount: usage.successfulCount,
			generationCount: usage.attemptCount,
			estimatedCents: usage.estimatedCents,
			chargedCents: usage.chargedCents,
			providerCostCents: usage.providerCostCents,
		},
		limits: {
			...(limits.dailyTaskLimit !== undefined
				? { dailyTaskLimit: limits.dailyTaskLimit }
				: {}),
			...(limits.dailyCostLimitCents !== undefined
				? { dailyCostLimitCents: limits.dailyCostLimitCents }
				: {}),
			dailyQuotaMode: limits.dailyQuotaMode,
		},
	};
}
