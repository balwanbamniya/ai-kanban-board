import {
	ConflictException,
	HttpStatus,
	PayloadTooLargeException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
	AiOperationKind,
	AiRunStatus,
} from "../../../generated/prisma/enums.js";
import { BoardRole } from "../../access-control/domain/board-role.enum.js";
import { AiRunsService } from "./ai-runs.service.js";

const context = {
	archivedAt: null,
	boardId: "10000000-0000-4000-8000-000000000001",
	ownerId: "00000000-0000-4000-8000-000000000001",
	role: BoardRole.OWNER,
	userId: "00000000-0000-4000-8000-000000000001",
};

const run = {
	actorId: context.userId,
	boardId: context.boardId,
	completedAt: null,
	createdAt: new Date("2026-09-03T00:00:00.000Z"),
	errorMessage: null,
	id: "40000000-0000-4000-8000-000000000001",
	idempotencyKey: "generate:1",
	input: { goal: "release" },
	latencyMs: null,
	model: null,
	operationKind: AiOperationKind.TASK_GENERATION,
	output: null,
	promptVersion: "v1",
	provider: null,
	startedAt: null,
	status: AiRunStatus.QUEUED,
	updatedAt: new Date("2026-09-03T00:00:00.000Z"),
	usage: null,
};

function setup(overrides: Record<string, unknown> = {}) {
	const transaction = {
		$executeRaw: vi.fn().mockResolvedValue(1),
		$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
		activity: { create: vi.fn() },
		aiRun: {
			count: vi.fn().mockResolvedValue(0),
			create: vi.fn().mockResolvedValue(run),
			findUnique: vi.fn().mockResolvedValue(null),
		},
		outboxEvent: { create: vi.fn() },
		...overrides,
	};
	const prisma = {
		$transaction: vi.fn(
			async (callback: (value: typeof transaction) => unknown) =>
				callback(transaction),
		),
		aiRun: { findFirst: vi.fn() },
	};
	const boardAccess = { assertContextPermissions: vi.fn() };
	return {
		prisma,
		service: new AiRunsService(prisma as never, boardAccess as never),
		transaction,
	};
}

describe("AiRunsService", () => {
	it("persists queued runs and their activity/outbox records atomically", async () => {
		const { service, transaction } = setup();

		await expect(
			service.create(context, AiOperationKind.TASK_GENERATION, {
				idempotencyKey: run.idempotencyKey,
				input: run.input,
			}),
		).resolves.toBe(run);
		expect(transaction.aiRun.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				model: null,
				provider: null,
				status: AiRunStatus.QUEUED,
			}),
		});
		expect(transaction.activity.create).toHaveBeenCalledOnce();
		expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
	});

	it("returns an equivalent idempotent retry without consuming quota", async () => {
		const aiRun = {
			count: vi.fn(),
			create: vi.fn(),
			findUnique: vi.fn().mockResolvedValue(run),
		};
		const { service } = setup({ aiRun });

		await expect(
			service.create(context, AiOperationKind.TASK_GENERATION, {
				idempotencyKey: run.idempotencyKey,
				input: { goal: "release" },
			}),
		).resolves.toBe(run);
		expect(aiRun.count).not.toHaveBeenCalled();
		expect(aiRun.create).not.toHaveBeenCalled();
	});

	it.each([
		{
			actorId: "00000000-0000-4000-8000-000000000002",
			input: run.input,
			operationKind: run.operationKind,
		},
		{
			actorId: run.actorId,
			input: run.input,
			operationKind: AiOperationKind.BOARD_SUMMARY,
		},
		{
			actorId: run.actorId,
			input: { goal: "different" },
			operationKind: run.operationKind,
		},
	])("rejects non-equivalent idempotency-key reuse", async (existing) => {
		const { service } = setup({
			aiRun: {
				count: vi.fn(),
				create: vi.fn(),
				findUnique: vi.fn().mockResolvedValue({ ...run, ...existing }),
			},
		});

		await expect(
			service.create(context, AiOperationKind.TASK_GENERATION, {
				idempotencyKey: run.idempotencyKey,
				input: run.input,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it.each([
		{ boardRuns: 100, userRuns: 0 },
		{ boardRuns: 0, userRuns: 25 },
	])(
		"returns HTTP 429 when a rolling quota is exhausted",
		async ({ boardRuns, userRuns }) => {
			const aiRun = {
				count: vi
					.fn()
					.mockResolvedValueOnce(boardRuns)
					.mockResolvedValueOnce(userRuns),
				create: vi.fn(),
				findUnique: vi.fn().mockResolvedValue(null),
			};
			const { service } = setup({ aiRun });

			await expect(
				service.create(context, AiOperationKind.BOARD_SUMMARY, {
					idempotencyKey: "summary:1",
					input: {},
				}),
			).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
			expect(aiRun.create).not.toHaveBeenCalled();
		},
	);

	it("rejects inputs larger than 32 KiB before opening a transaction", async () => {
		const { prisma, service } = setup();
		await expect(
			service.create(context, AiOperationKind.BOARD_SUMMARY, {
				idempotencyKey: "summary:large",
				input: { content: "x".repeat(32 * 1_024) },
			}),
		).rejects.toBeInstanceOf(PayloadTooLargeException);
		expect(prisma.$transaction).not.toHaveBeenCalled();
	});
});
