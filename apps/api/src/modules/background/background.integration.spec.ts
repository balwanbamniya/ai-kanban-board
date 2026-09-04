import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../../config/app-config.service.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { createPrismaAdapter } from "../../database/prisma-client.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { BoardAccessService } from "../access-control/application/board-access.service.js";
import { BoardAuthorizationPolicy } from "../access-control/application/board-authorization.policy.js";
import { BoardPermission } from "../access-control/domain/board-permission.enum.js";
import { AiApplicationService } from "../ai/application/ai-application.service.js";
import {
	AiProviderError,
	type OpenAiProvider,
} from "../ai/application/openai-provider.js";
import type { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { BackgroundWorker } from "./background.worker.js";

const output = {
	tasks: [
		{ title: "Review release", description: null, priority: "MEDIUM" as const },
	],
};
describe("durable workers and suggestion application", () => {
	let db: PrismaClient;
	let access: BoardAccessService;
	const fixtures: Array<{ boardId: string; userId: string }> = [];
	beforeAll(async () => {
		if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
		db = new PrismaClient({
			adapter: createPrismaAdapter({
				connectionString: process.env.DATABASE_URL,
				connectionTimeoutMillis: 5000,
				max: 6,
			}),
		});
		await db.$connect();
		access = new BoardAccessService(
			db as PrismaService,
			new BoardAuthorizationPolicy(),
		);
		// Other suites' fixture jobs must not be consumed by this worker suite.
		await db.outboxEvent.updateMany({
			data: { nextAttemptAt: new Date("2099-01-01") },
		});
		await db.aiRun.updateMany({
			data: { nextAttemptAt: new Date("2099-01-01") },
		});
	});
	afterAll(async () => {
		for (const f of fixtures) {
			await db.outboxEvent.deleteMany({ where: { boardId: f.boardId } });
			await db.board.delete({ where: { id: f.boardId } });
			await db.user.delete({ where: { id: f.userId } });
		}
		await db?.$disconnect();
	});
	async function fixture() {
		const user = await db.user.create({
			data: { externalAuthId: randomUUID(), name: "Worker Test" },
		});
		const board = await db.board.create({
			data: {
				ownerId: user.id,
				title: "Worker Board",
				columns: { create: { title: "Todo", sortKey: "a0" } },
			},
			include: { columns: true },
		});
		fixtures.push({ boardId: board.id, userId: user.id });
		const run = await db.aiRun.create({
			data: {
				actorId: user.id,
				boardId: board.id,
				idempotencyKey: randomUUID(),
				operationKind: "TASK_GENERATION",
				input: { instructions: "Plan release", count: 1 },
				promptVersion: "v1",
				nextAttemptAt: new Date(0),
			},
		});
		const context = await access.getContext(user.id, board.id);
		const columnId = board.columns[0]?.id;
		if (!columnId) throw new Error("Fixture column missing");
		return { user, board, run, context, columnId };
	}
	function worker(
		execute = vi.fn().mockResolvedValue({
			output,
			usage: {},
			model: "fixture",
			provider: "openai",
		}),
		emit = vi.fn().mockResolvedValue(undefined),
	) {
		return {
			execute,
			emit,
			instance: new BackgroundWorker(
				db as PrismaService,
				{ workersEnabled: false, openaiModel: "fixture" } as AppConfigService,
				access,
				{ execute } as unknown as OpenAiProvider,
				{ emitBoardEvent: emit } as unknown as RealtimeGateway,
			),
		};
	}
	it("claims once across competing workers and records terminal activity", async () => {
		const f = await fixture();
		const w = worker();
		await Promise.all([w.instance.processAi(), w.instance.processAi()]);
		const run = await db.aiRun.findUniqueOrThrow({ where: { id: f.run.id } });
		expect(run.status).toBe("SUCCEEDED");
		expect(run.attempts).toBe(1);
		expect(run.leaseToken).toBeNull();
		expect(w.execute).toHaveBeenCalledTimes(1);
		expect(
			await db.activity.count({
				where: { boardId: f.board.id, eventName: "ai.run.succeeded" },
			}),
		).toBe(1);
	});
	it("reclaims a crashed worker lease", async () => {
		const f = await fixture();
		await db.aiRun.update({
			where: { id: f.run.id },
			data: {
				status: "RUNNING",
				attempts: 1,
				leaseToken: randomUUID(),
				leaseExpiresAt: new Date(0),
			},
		});
		await worker().instance.processAi();
		expect(
			await db.aiRun.findUnique({ where: { id: f.run.id } }),
		).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
	});
	it("fences a worker that loses its lease during provider execution", async () => {
		const f = await fixture();
		const replacement = randomUUID();
		const execute = vi.fn().mockImplementation(async () => {
			await db.aiRun.update({
				where: { id: f.run.id },
				data: { leaseToken: replacement },
			});
			return { output, usage: {}, model: "fixture", provider: "openai" };
		});
		await worker(execute).instance.processAi();
		expect(
			await db.aiRun.findUnique({ where: { id: f.run.id } }),
		).toMatchObject({
			status: "RUNNING",
			leaseToken: replacement,
			output: null,
		});
		await db.aiRun.update({
			where: { id: f.run.id },
			data: { status: "CANCELLED" },
		});
	});
	it("retries transient failures then stops at the limit", async () => {
		const f = await fixture();
		const w = worker(
			vi
				.fn()
				.mockRejectedValue(
					new AiProviderError("PROVIDER_REQUEST_FAILED", true),
				),
		);
		for (let i = 0; i < 3; i++) {
			await w.instance.processAi();
			if (i < 2)
				await db.aiRun.update({
					where: { id: f.run.id },
					data: { nextAttemptAt: new Date(0) },
				});
		}
		expect(
			await db.aiRun.findUnique({ where: { id: f.run.id } }),
		).toMatchObject({
			status: "FAILED",
			attempts: 3,
			errorMessage: "PROVIDER_REQUEST_FAILED",
		});
	});
	it("does not retry refusal and does not expose provider secrets", async () => {
		const f = await fixture();
		await worker(
			vi.fn().mockRejectedValue(new AiProviderError("PROVIDER_REFUSAL", false)),
		).instance.processAi();
		expect(
			await db.aiRun.findUnique({ where: { id: f.run.id } }),
		).toMatchObject({
			status: "FAILED",
			attempts: 1,
			errorMessage: "PROVIDER_REFUSAL",
		});
	});
	it("rejects execution after board archive", async () => {
		const f = await fixture();
		await db.board.update({
			where: { id: f.board.id },
			data: { archivedAt: new Date() },
		});
		const w = worker();
		await w.instance.processAi();
		expect(w.execute).not.toHaveBeenCalled();
		expect(
			await db.aiRun.findUnique({ where: { id: f.run.id } }),
		).toMatchObject({ status: "FAILED" });
	});
	it("applies atomically and deduplicates concurrent retries and overlapping selections", async () => {
		const f = await fixture();
		await worker().instance.processAi();
		const service = new AiApplicationService(db as PrismaService, access);
		const dto = {
			columnId: f.columnId,
			suggestionIndexes: [0],
			idempotencyKey: "apply-once",
		};
		const [a, b] = await Promise.all([
			service.apply(f.context, f.run.id, dto),
			service.apply(f.context, f.run.id, dto),
		]);
		expect(a).toEqual(b);
		expect(a.taskIds).toHaveLength(1);
		expect(await db.task.count({ where: { boardId: f.board.id } })).toBe(1);
		await expect(
			service.apply(f.context, f.run.id, { ...dto, idempotencyKey: "overlap" }),
		).rejects.toBeInstanceOf(ConflictException);
		expect(
			await db.aiAppliedSuggestion.count({ where: { runId: f.run.id } }),
		).toBe(1);
	});
	it("rolls back tasks, mappings, and idempotency records when event persistence fails", async () => {
		const f = await fixture();
		await worker().instance.processAi();
		const failingDb = db.$extends({
			query: {
				outboxEvent: {
					create() {
						throw new Error("Simulated outbox failure");
					},
				},
			},
		});
		const service = new AiApplicationService(
			failingDb as unknown as PrismaService,
			access,
		);
		await expect(
			service.apply(f.context, f.run.id, {
				columnId: f.columnId,
				suggestionIndexes: [0],
				idempotencyKey: "rollback",
			}),
		).rejects.toThrow("Simulated outbox failure");
		expect(await db.task.count({ where: { boardId: f.board.id } })).toBe(0);
		expect(
			await db.aiAppliedSuggestion.count({ where: { runId: f.run.id } }),
		).toBe(0);
		expect(await db.aiApplication.count({ where: { runId: f.run.id } })).toBe(
			0,
		);
	});

	it("rejects stale authorization and cross-board application", async () => {
		const f = await fixture();
		await worker().instance.processAi();
		const other = await fixture();
		await worker().instance.processAi();
		const service = new AiApplicationService(db as PrismaService, access);
		await expect(
			service.apply(f.context, f.run.id, {
				columnId: other.columnId,
				suggestionIndexes: [0],
				idempotencyKey: "cross",
			}),
		).rejects.toMatchObject({ status: 404 });
		await db.user.update({
			where: { id: f.user.id },
			data: { deletedAt: new Date() },
		});
		await expect(
			service.apply(f.context, f.run.id, {
				columnId: f.columnId,
				suggestionIndexes: [0],
				idempotencyKey: "deleted",
			}),
		).rejects.toMatchObject({ status: 404 });
	});
	it("delivers event IDs and retries delivery failures without marking success", async () => {
		const f = await fixture();
		await worker().instance.processAi();
		const event = await db.outboxEvent.create({
			data: {
				boardId: f.board.id,
				aggregateType: "board",
				aggregateId: f.board.id,
				eventName: "board.updated",
				payload: {},
				nextAttemptAt: new Date(0),
			},
		});
		const w = worker(
			undefined,
			vi
				.fn()
				.mockRejectedValueOnce(new Error("Redis down"))
				.mockResolvedValue(undefined),
		);
		await w.instance.processOutbox();
		expect(
			await db.outboxEvent.findUnique({ where: { id: event.id } }),
		).toMatchObject({ status: "PENDING", attempts: 1 });
		await db.outboxEvent.update({
			where: { id: event.id },
			data: { nextAttemptAt: new Date(0) },
		});
		await w.instance.processOutbox();
		expect(
			await db.outboxEvent.findUnique({ where: { id: event.id } }),
		).toMatchObject({ status: "PROCESSED", attempts: 2 });
		expect(w.emit).toHaveBeenLastCalledWith(
			f.board.id,
			"board.updated",
			expect.objectContaining({ eventId: event.id }),
		);
	});
	it("checks the current role after acquiring the mutation lock", async () => {
		const f = await fixture();
		await worker().instance.processAi();
		const member = await db.user.create({
			data: { externalAuthId: randomUUID(), name: "Former editor" },
		});
		try {
			await db.boardMember.create({
				data: { boardId: f.board.id, userId: member.id, role: "MEMBER" },
			});
			const stale = await access.assertPermissions(member.id, f.board.id, [
				BoardPermission.TASK_CREATE,
			]);
			await db.boardMember.update({
				where: { boardId_userId: { boardId: f.board.id, userId: member.id } },
				data: { role: "VIEWER" },
			});
			await expect(
				db.$transaction((tx) => access.assertFreshContext(tx, stale)),
			).rejects.toBeInstanceOf(ConflictException);
			const fresh = await access.getContext(member.id, f.board.id);
			expect(() =>
				access.assertContextPermissions(fresh, [BoardPermission.TASK_CREATE]),
			).toThrow(ForbiddenException);
		} finally {
			await db.user.delete({ where: { id: member.id } });
		}
	});
});
