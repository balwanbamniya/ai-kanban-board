import { randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import { BoardRole } from "../generated/prisma/enums.js";
import { BoardAccessService } from "../modules/access-control/application/board-access.service.js";
import { BoardAuthorizationPolicy } from "../modules/access-control/application/board-authorization.policy.js";
import { BoardPermission } from "../modules/access-control/domain/board-permission.enum.js";
import { BoardRole as AccessRole } from "../modules/access-control/domain/board-role.enum.js";
import { UserSyncService } from "../modules/users/application/user-sync.service.js";
import { UserIdentityConflictError } from "../modules/users/domain/user.errors.js";
import { createPrismaAdapter } from "./prisma-client.js";

const seedBoardId = "10000000-0000-4000-8000-000000000001";
const seedOwnerId = "00000000-0000-4000-8000-000000000001";
const seedAdminId = "00000000-0000-4000-8000-000000000002";
const seedMemberId = "00000000-0000-4000-8000-000000000003";
const seedViewerId = "00000000-0000-4000-8000-000000000004";

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

	it("authorizes every seeded board role from persisted ownership and memberships", async () => {
		const access = new BoardAccessService(
			prisma as never,
			new BoardAuthorizationPolicy(),
		);

		await expect(
			access.assertPermissions(seedOwnerId, seedBoardId, [
				BoardPermission.BOARD_DELETE,
				BoardPermission.BOARD_TRANSFER_OWNERSHIP,
			]),
		).resolves.toMatchObject({ role: AccessRole.OWNER });
		await expect(
			access.assertPermissions(seedAdminId, seedBoardId, [
				BoardPermission.BOARD_UPDATE,
				BoardPermission.COLUMN_DELETE,
			]),
		).resolves.toMatchObject({ role: AccessRole.ADMIN });
		await expect(
			access.assertPermissions(seedMemberId, seedBoardId, [
				BoardPermission.TASK_UPDATE,
				BoardPermission.TASK_MOVE,
			]),
		).resolves.toMatchObject({ role: AccessRole.MEMBER });
		await expect(
			access.assertPermissions(seedViewerId, seedBoardId, [
				BoardPermission.BOARD_READ,
			]),
		).resolves.toMatchObject({ role: AccessRole.VIEWER });

		await expect(
			access.assertPermissions(seedMemberId, seedBoardId, [
				BoardPermission.COLUMN_UPDATE,
			]),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			access.getContext(randomUUID(), seedBoardId),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("orders Clerk profile events, soft-deletes users, and frees their email", async () => {
		const externalAuthId = `user_${randomUUID()}`;
		const replacementExternalAuthId = `user_${randomUUID()}`;
		const conflictingExternalAuthId = `user_${randomUUID()}`;
		const email = `${randomUUID()}@example.com`;
		const users = new UserSyncService(prisma as never);
		const firstUpdate = new Date("2026-09-03T00:00:00.000Z");
		const deletion = new Date("2026-09-03T00:01:00.000Z");

		try {
			const [first, concurrent] = await Promise.all([
				users.synchronize({
					email,
					externalAuthId,
					name: "Current profile",
					providerUpdatedAt: firstUpdate,
				}),
				users.synchronize({
					email,
					externalAuthId,
					name: "Current profile",
					providerUpdatedAt: firstUpdate,
				}),
			]);
			expect(first?.id).toBe(concurrent?.id);

			await users.synchronize({
				email,
				externalAuthId,
				name: "Stale profile",
				providerUpdatedAt: new Date("2026-09-02T00:00:00.000Z"),
			});
			expect(await users.findCurrentUser(externalAuthId)).toMatchObject({
				name: "Current profile",
			});
			await expect(
				users.synchronize({
					email,
					externalAuthId: conflictingExternalAuthId,
					name: "Conflicting account",
					providerUpdatedAt: firstUpdate,
				}),
			).rejects.toBeInstanceOf(UserIdentityConflictError);

			await users.softDelete(externalAuthId, deletion);
			await users.softDelete(externalAuthId, deletion);
			expect(await users.findCurrentUser(externalAuthId)).toBeNull();

			await users.synchronize({
				email,
				externalAuthId,
				name: "Stale after deletion",
				providerUpdatedAt: firstUpdate,
			});
			expect(await users.findCurrentUser(externalAuthId)).toBeNull();

			await expect(
				users.synchronize({
					email,
					externalAuthId: replacementExternalAuthId,
					name: "Replacement account",
					providerUpdatedAt: deletion,
				}),
			).resolves.toMatchObject({ email });
		} finally {
			await prisma.user.deleteMany({
				where: {
					externalAuthId: {
						in: [
							externalAuthId,
							replacementExternalAuthId,
							conflictingExternalAuthId,
						],
					},
				},
			});
		}
	});
});
