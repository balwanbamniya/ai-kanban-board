import { randomUUID } from "node:crypto";
import { HttpStatus } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaAdapter } from "../../database/prisma-client.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { AiOperationKind, AiRunStatus } from "../../generated/prisma/enums.js";
import { BoardAccessService } from "../access-control/application/board-access.service.js";
import { BoardAuthorizationPolicy } from "../access-control/application/board-authorization.policy.js";
import { BoardRole } from "../access-control/domain/board-role.enum.js";
import { AiRunsService } from "./application/ai-runs.service.js";

describe("AI run database concurrency", () => {
	let prisma: PrismaClient;

	beforeAll(async () => {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is required for AI integration tests");
		}
		prisma = new PrismaClient({
			adapter: createPrismaAdapter({
				connectionString: databaseUrl,
				connectionTimeoutMillis: 5_000,
				max: 4,
			}),
		});
		await prisma.$connect();
	});

	afterAll(async () => {
		await prisma?.$disconnect();
	});

	it("atomically deduplicates concurrent equivalent requests", async () => {
		const fixture = await createFixture(prisma);
		const service = createService(prisma);
		const request = {
			idempotencyKey: `integration:${randomUUID()}`,
			input: { instructions: "deduplicate me", count: 5 },
		};

		try {
			const [first, second] = await Promise.all([
				service.create(
					fixture.context,
					AiOperationKind.TASK_GENERATION,
					request,
				),
				service.create(
					fixture.context,
					AiOperationKind.TASK_GENERATION,
					request,
				),
			]);
			expect(first.id).toBe(second.id);
			expect(
				await prisma.aiRun.count({ where: { boardId: fixture.boardId } }),
			).toBe(1);
			expect(
				await prisma.activity.count({
					where: { boardId: fixture.boardId, eventName: "ai.run.queued" },
				}),
			).toBe(1);
			expect(
				await prisma.outboxEvent.count({
					where: { aggregateId: first.id, eventName: "ai.run.queued" },
				}),
			).toBe(1);
		} finally {
			await deleteFixture(prisma, fixture.boardId, fixture.userId);
		}
	});

	it("serializes concurrent requests at the per-actor quota boundary", async () => {
		const fixture = await createFixture(prisma);
		const service = createService(prisma);
		await prisma.aiRun.createMany({
			data: Array.from({ length: 24 }, (_, index) => ({
				actorId: fixture.userId,
				boardId: fixture.boardId,
				idempotencyKey: `quota-seed:${index}`,
				input: { index },
				operationKind: AiOperationKind.BOARD_SUMMARY,
				promptVersion: "v1",
				status: AiRunStatus.QUEUED,
			})),
		});

		try {
			const results = await Promise.allSettled([
				service.create(fixture.context, AiOperationKind.BOARD_SUMMARY, {
					idempotencyKey: `quota:${randomUUID()}`,
					input: { instructions: "summary one" },
				}),
				service.create(fixture.context, AiOperationKind.BOARD_SUMMARY, {
					idempotencyKey: `quota:${randomUUID()}`,
					input: { instructions: "summary two" },
				}),
			]);
			expect(
				results.filter(({ status }) => status === "fulfilled"),
			).toHaveLength(1);
			const rejected = results.find(({ status }) => status === "rejected");
			expect(rejected).toMatchObject({
				reason: { status: HttpStatus.TOO_MANY_REQUESTS },
				status: "rejected",
			});
			expect(
				await prisma.aiRun.count({ where: { actorId: fixture.userId } }),
			).toBe(25);
		} finally {
			await deleteFixture(prisma, fixture.boardId, fixture.userId);
		}
	});
});

function createService(prisma: PrismaClient): AiRunsService {
	return new AiRunsService(
		prisma as never,
		new BoardAccessService(prisma as never, new BoardAuthorizationPolicy()),
		{ openaiApiKey: "test", openaiModel: "test" } as never,
	);
}

async function createFixture(prisma: PrismaClient) {
	const user = await prisma.user.create({
		data: {
			externalAuthId: `ai_integration_${randomUUID()}`,
			name: "AI Integration User",
		},
	});
	const board = await prisma.board.create({
		data: { ownerId: user.id, title: "AI Integration Board" },
	});
	return {
		boardId: board.id,
		context: {
			archivedAt: null,
			boardId: board.id,
			ownerId: user.id,
			role: BoardRole.OWNER,
			userId: user.id,
		},
		userId: user.id,
	};
}

async function deleteFixture(
	prisma: PrismaClient,
	boardId: string,
	userId: string,
): Promise<void> {
	const runIds = (
		await prisma.aiRun.findMany({ where: { boardId }, select: { id: true } })
	).map(({ id }) => id);
	await prisma.outboxEvent.deleteMany({
		where: { aggregateId: { in: runIds } },
	});
	await prisma.board.delete({ where: { id: boardId } });
	await prisma.user.delete({ where: { id: userId } });
}
