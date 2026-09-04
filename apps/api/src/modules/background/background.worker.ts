import { randomUUID } from "node:crypto";
import {
	HttpException,
	Inject,
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnModuleDestroy,
} from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";
import { PrismaService } from "../../database/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { BoardAccessService } from "../access-control/application/board-access.service.js";
import { BoardPermission } from "../access-control/domain/board-permission.enum.js";
import {
	AiProviderError,
	OpenAiProvider,
} from "../ai/application/openai-provider.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";

type Claim = { id: string; attempts: number; leaseToken: string };
const MAX_ATTEMPTS = 3;
@Injectable()
export class BackgroundWorker
	implements OnApplicationBootstrap, OnModuleDestroy
{
	private readonly logger = new Logger(BackgroundWorker.name);
	private readonly timers: Partial<Record<"ai" | "outbox", NodeJS.Timeout>> =
		{};
	private readonly active = new Set<Promise<void>>();
	private stopped = false;
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(AppConfigService) private readonly config: AppConfigService,
		@Inject(BoardAccessService) private readonly access: BoardAccessService,
		@Inject(OpenAiProvider) private readonly provider: OpenAiProvider,
		@Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
	) {}
	onApplicationBootstrap(): void {
		if (this.config.workersEnabled) {
			this.schedule("ai");
			this.schedule("outbox");
		}
	}
	private schedule(kind: "ai" | "outbox"): void {
		if (this.stopped) return;
		this.timers[kind] = setTimeout(() => {
			const work = (kind === "ai" ? this.processAi() : this.processOutbox())
				.catch(() => {
					this.logger.error({
						message: "Background polling failed",
						queue: kind,
					});
				})
				.finally(() => {
					this.active.delete(work);
					this.schedule(kind);
				});
			this.active.add(work);
		}, 1000);
		this.timers[kind]?.unref();
	}
	async onModuleDestroy(): Promise<void> {
		this.stopped = true;
		for (const timer of Object.values(this.timers)) clearTimeout(timer);
		await Promise.all(this.active);
	}

	private async claim(kind: "outbox" | "ai"): Promise<Claim | undefined> {
		const table = Prisma.raw(kind === "ai" ? "ai_runs" : "outbox_events");
		const pending = kind === "ai" ? "QUEUED" : "PENDING";
		const running = kind === "ai" ? "RUNNING" : "PROCESSING";
		const enumType = Prisma.raw(
			kind === "ai" ? '"AiRunStatus"' : '"OutboxStatus"',
		);
		const token = randomUUID();
		const rows = await this.prisma.$queryRaw<Claim[]>(Prisma.sql`
   WITH candidate AS (
    SELECT id FROM ${table}
    WHERE (status = CAST(${pending} AS ${enumType}) AND next_attempt_at <= NOW())
       OR (status = CAST(${running} AS ${enumType}) AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
    ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1
   )
   UPDATE ${table} AS job SET status = CAST(${running} AS ${enumType}),
    attempts = job.attempts + 1, lease_token = CAST(${token} AS uuid), lease_expires_at = NOW() + INTERVAL '120 seconds'
   FROM candidate WHERE job.id = candidate.id
   RETURNING job.id, job.attempts, job.lease_token AS "leaseToken"
  `);
		return rows[0];
	}
	async processOutbox(): Promise<void> {
		const claim = await this.claim("outbox");
		if (!claim) return;
		const event = await this.prisma.outboxEvent.findUniqueOrThrow({
			where: { id: claim.id },
		});
		try {
			if (claim.attempts > MAX_ATTEMPTS) throw new Error("Attempts exhausted");
			if (!event.boardId) throw new Error("Missing board route");
			await this.gateway.emitBoardEvent(event.boardId, event.eventName, {
				eventId: event.id,
				boardId: event.boardId,
				occurredAt: event.occurredAt.toISOString(),
				requestId: event.requestId,
				data: event.payload,
			});
			await this.prisma.outboxEvent.updateMany({
				where: { id: claim.id, leaseToken: claim.leaseToken },
				data: {
					status: "PROCESSED",
					processedAt: new Date(),
					leaseToken: null,
					leaseExpiresAt: null,
					lastError: null,
				},
			});
		} catch {
			const failed = claim.attempts >= MAX_ATTEMPTS || !event.boardId;
			await this.prisma.outboxEvent.updateMany({
				where: { id: claim.id, leaseToken: claim.leaseToken },
				data: {
					status: failed ? "FAILED" : "PENDING",
					lastError: "Event delivery failed",
					leaseToken: null,
					leaseExpiresAt: null,
					nextAttemptAt: new Date(Date.now() + 1000 * 2 ** claim.attempts),
				},
			});
			this.logger.warn({
				message: "Outbox delivery failed",
				eventId: claim.id,
				attempts: claim.attempts,
				exhausted: failed,
				queueAgeMs: Date.now() - event.occurredAt.getTime(),
			});
		}
	}
	async processAi(): Promise<void> {
		const claim = await this.claim("ai");
		if (!claim) return;
		const run = await this.prisma.aiRun.findUniqueOrThrow({
			where: { id: claim.id },
		});
		const started = Date.now();
		try {
			if (claim.attempts > MAX_ATTEMPTS)
				throw new AiProviderError("ATTEMPTS_EXHAUSTED", false);
			if (!run.actorId) throw new AiProviderError("ACTOR_UNAVAILABLE", false);
			const context = await this.access.assertPermissions(
				run.actorId,
				run.boardId,
				[BoardPermission.AI_RUN],
			);
			const snapshot = await this.prisma.$transaction(async (tx) => {
				await this.access.assertFreshContext(tx, context);
				const board = await tx.board.findUniqueOrThrow({
					where: { id: run.boardId },
					select: {
						title: true,
						description: true,
						columns: {
							orderBy: { sortKey: "asc" },
							select: { id: true, title: true },
							take: 100,
						},
					},
				});
				const tasks = await tx.task.findMany({
					where: { boardId: run.boardId },
					orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
					take: 101,
					select: {
						title: true,
						description: true,
						priority: true,
						columnId: true,
						dueDate: true,
					},
				});
				await tx.aiRun.updateMany({
					where: { id: claim.id, leaseToken: claim.leaseToken },
					data: {
						startedAt: run.startedAt ?? new Date(),
						provider: "openai",
						model: this.config.openaiModel ?? null,
					},
				});
				return {
					board,
					tasks: tasks
						.slice(0, 100)
						.map((t) => ({ ...t, description: t.description?.slice(0, 500) })),
					truncated: tasks.length > 100 || board.columns.length === 100,
				};
			});
			const result = await this.provider.execute(
				run.operationKind,
				run.input,
				snapshot,
			);
			await this.prisma.$transaction(async (tx) => {
				await this.access.assertFreshContext(tx, context);
				const update = await tx.aiRun.updateMany({
					where: {
						id: claim.id,
						status: "RUNNING",
						leaseToken: claim.leaseToken,
						leaseExpiresAt: { gt: new Date() },
					},
					data: {
						status: "SUCCEEDED",
						output: result.output,
						usage: result.usage as Prisma.InputJsonValue,
						provider: result.provider,
						model: result.model,
						latencyMs: Date.now() - started,
						completedAt: new Date(),
						leaseToken: null,
						leaseExpiresAt: null,
						errorMessage: null,
					},
				});
				if (update.count)
					await this.recordCompletion(tx, run, "ai.run.succeeded");
			});
		} catch (error) {
			const retryable =
				error instanceof AiProviderError
					? error.retryable
					: !(error instanceof HttpException) || error.getStatus() >= 500;
			const retry = retryable && claim.attempts < MAX_ATTEMPTS;
			const code =
				error instanceof AiProviderError ? error.code : "RUN_UNAVAILABLE";
			await this.prisma.$transaction(async (tx) => {
				const update = await tx.aiRun.updateMany({
					where: { id: claim.id, leaseToken: claim.leaseToken },
					data: {
						status: retry ? "QUEUED" : "FAILED",
						errorMessage: code,
						completedAt: retry ? null : new Date(),
						latencyMs: Date.now() - started,
						leaseToken: null,
						leaseExpiresAt: null,
						nextAttemptAt: new Date(Date.now() + 1000 * 2 ** claim.attempts),
					},
				});
				if (update.count && !retry)
					await this.recordCompletion(tx, run, "ai.run.failed");
			});
			this.logger.warn({
				message: "AI run failed",
				runId: claim.id,
				code,
				attempts: claim.attempts,
				retry,
				queueAgeMs: Date.now() - run.createdAt.getTime(),
			});
		}
	}
	private async recordCompletion(
		tx: Prisma.TransactionClient,
		run: { id: string; boardId: string; actorId: string | null },
		eventName: string,
	): Promise<void> {
		const payload = { runId: run.id };
		await tx.activity.create({
			data: {
				boardId: run.boardId,
				actorId: run.actorId,
				eventName,
				message:
					eventName === "ai.run.succeeded"
						? "AI run completed"
						: "AI run failed",
				payload,
			},
		});
		await tx.outboxEvent.create({
			data: {
				boardId: run.boardId,
				aggregateId: run.id,
				aggregateType: "ai_run",
				eventName,
				payload,
			},
		});
	}
}
