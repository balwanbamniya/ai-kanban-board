import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import { BoardRole } from "../generated/prisma/enums.js";
import { createPrismaAdapter } from "./prisma-client.js";

const seedBoardId = "10000000-0000-4000-8000-000000000001";
const seedOwnerId = "00000000-0000-4000-8000-000000000001";

describe("database foundation", () => {
	let prisma: PrismaClient;

	beforeAll(async () => {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error(
				"DATABASE_URL is required for database integration tests",
			);
		}

		prisma = new PrismaClient({
			adapter: createPrismaAdapter({
				connectionString: databaseUrl,
				connectionTimeoutMillis: 5000,
				max: 2,
			}),
		});
		await prisma.$connect();
	});

	afterAll(async () => {
		await prisma?.$disconnect();
	});

	it("loads the complete idempotent seed fixture", async () => {
		const board = await prisma.board.findUniqueOrThrow({
			where: { id: seedBoardId },
			include: {
				aiRuns: true,
				columns: { include: { tasks: true } },
				invitations: true,
				members: true,
			},
		});

		expect(board.ownerId).toBe(seedOwnerId);
		expect(board.members).toHaveLength(3);
		expect(new Set(board.members.map(({ role }) => role))).toEqual(
			new Set([BoardRole.ADMIN, BoardRole.MEMBER, BoardRole.VIEWER]),
		);
		expect(board.columns.flatMap(({ tasks }) => tasks)).toHaveLength(1);
		expect(board.invitations).toHaveLength(1);
		expect(board.aiRuns).toHaveLength(1);
	});

	it("rejects a task assigned to a column from another board", async () => {
		const otherBoardId = randomUUID();
		const otherColumnId = randomUUID();

		await prisma.board.create({
			data: {
				id: otherBoardId,
				ownerId: seedOwnerId,
				title: "Constraint test board",
				columns: {
					create: {
						id: otherColumnId,
						title: "Todo",
						sortKey: "a0",
					},
				},
			},
		});

		try {
			await expect(
				prisma.task.create({
					data: {
						boardId: seedBoardId,
						columnId: otherColumnId,
						sortKey: "constraint-test",
						title: "Invalid cross-board task",
					},
				}),
			).rejects.toThrow();
		} finally {
			await prisma.board.delete({ where: { id: otherBoardId } });
		}
	});

	it("enforces positive optimistic-lock versions", async () => {
		await expect(
			prisma.board.update({
				where: { id: seedBoardId },
				data: { version: 0 },
			}),
		).rejects.toThrow();
	});
});
