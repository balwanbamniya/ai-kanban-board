import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import { BoardRole } from "../generated/prisma/enums.js";
import { BoardAccessService } from "../modules/access-control/application/board-access.service.js";
import { BoardAuthorizationPolicy } from "../modules/access-control/application/board-authorization.policy.js";
import { BoardPermission } from "../modules/access-control/domain/board-permission.enum.js";
import { BoardRole as AccessRole } from "../modules/access-control/domain/board-role.enum.js";
import { BoardMembersService } from "../modules/board-members/application/board-members.service.js";
import { BoardEventName } from "../modules/boards/application/board-events.js";
import { BoardsService } from "../modules/boards/application/boards.service.js";
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
				BoardPermission.BOARD_ARCHIVE,
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

	it("creates, updates, archives, and restores a board without owner duplication", async () => {
		const access = new BoardAccessService(
			prisma as never,
			new BoardAuthorizationPolicy(),
		);
		const boards = new BoardsService(prisma as never, access);
		const members = new BoardMembersService(prisma as never, access);
		const created = await boards.create(seedOwnerId, {
			color: "#123456",
			description: "Integration board",
			title: "Board lifecycle",
		});

		try {
			const persisted = await prisma.board.findUniqueOrThrow({
				where: { id: created.id },
				include: { columns: true, members: true },
			});
			expect(persisted.columns).toHaveLength(4);
			expect(persisted.members).toHaveLength(0);

			const listed = await boards.list(seedOwnerId, {
				includeArchived: false,
				limit: 100,
			});
			expect(listed.boards).toContainEqual(
				expect.objectContaining({
					id: created.id,
					memberCount: 1,
					role: AccessRole.OWNER,
					taskCount: 0,
				}),
			);

			let context = await access.getContext(seedOwnerId, created.id);
			const detail = await boards.detail(context);
			expect(detail.members[0]).toMatchObject({
				id: seedOwnerId,
				role: AccessRole.OWNER,
			});
			const updated = await boards.update(context, {
				title: "Updated lifecycle",
				version: created.version,
			});
			await expect(
				boards.update(context, {
					title: "Stale lifecycle update",
					version: created.version,
				}),
			).rejects.toBeInstanceOf(ConflictException);
			const archived = await boards.archive(context, updated.version);
			expect(archived.archivedAt).toBeInstanceOf(Date);

			context = await access.getContext(seedOwnerId, created.id);
			await expect(
				members.createInvitation(context, {
					email: `${randomUUID()}@example.test`,
				}),
			).rejects.toBeInstanceOf(ConflictException);
			const restored = await boards.restore(context, archived.version);
			expect(restored.archivedAt).toBeNull();

			const events = await prisma.activity.findMany({
				where: { boardId: created.id },
				select: { eventName: true },
			});
			expect(events.map(({ eventName }) => eventName)).toEqual(
				expect.arrayContaining([
					BoardEventName.CREATED,
					BoardEventName.UPDATED,
					BoardEventName.ARCHIVED,
					BoardEventName.RESTORED,
				]),
			);
			expect(
				await prisma.outboxEvent.count({
					where: { aggregateId: created.id },
				}),
			).toBe(4);
		} finally {
			await prisma.outboxEvent.deleteMany({
				where: { aggregateId: created.id },
			});
			await prisma.board.delete({ where: { id: created.id } });
		}
	});

	it("handles invitations and ownership transfer without weakening membership invariants", async () => {
		const access = new BoardAccessService(
			prisma as never,
			new BoardAuthorizationPolicy(),
		);
		const boards = new BoardsService(prisma as never, access);
		const members = new BoardMembersService(prisma as never, access);
		const invitee = await prisma.user.create({
			data: {
				email: `${randomUUID()}@example.test`,
				externalAuthId: `integration_${randomUUID()}`,
				name: "Integration Invitee",
			},
		});
		const created = await boards.create(seedOwnerId, {
			title: "Membership lifecycle",
		});

		try {
			const ownerContext = await access.getContext(seedOwnerId, created.id);
			const invitation = await members.createInvitation(ownerContext, {
				email: invitee.email ?? "",
				role: AccessRole.MEMBER,
			});
			expect(invitation.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
			const storedInvitation = await prisma.boardInvitation.findUniqueOrThrow({
				where: { id: invitation.invitation.id },
			});
			expect(storedInvitation.tokenHash).toBe(
				createHash("sha256").update(invitation.token).digest("hex"),
			);
			expect(storedInvitation.tokenHash).not.toBe(invitation.token);

			const concurrentEmail = `${randomUUID()}@example.test`;
			const concurrent = await Promise.allSettled([
				members.createInvitation(ownerContext, { email: concurrentEmail }),
				members.createInvitation(ownerContext, { email: concurrentEmail }),
			]);
			expect(
				concurrent.filter(({ status }) => status === "fulfilled"),
			).toHaveLength(1);
			expect(
				concurrent.filter(({ status }) => status === "rejected"),
			).toHaveLength(1);
			const concurrentInvitation = concurrent.find(
				(result) => result.status === "fulfilled",
			);
			if (concurrentInvitation?.status !== "fulfilled") {
				throw new Error("Expected one concurrent invitation to succeed");
			}
			const resent = await members.resendInvitation(
				ownerContext,
				concurrentInvitation.value.invitation.id,
			);
			expect(resent.token).not.toBe(concurrentInvitation.value.token);
			await expect(
				prisma.boardInvitation.findUniqueOrThrow({
					where: { id: resent.invitation.id },
				}),
			).resolves.toMatchObject({
				tokenHash: createHash("sha256").update(resent.token).digest("hex"),
			});
			await members.cancelInvitation(
				ownerContext,
				concurrentInvitation.value.invitation.id,
			);

			const invitationList = await members.listInvitations(ownerContext, {
				limit: 25,
			});
			expect(invitationList.invitations[0]).not.toHaveProperty("token");
			expect(invitationList.invitations[0]).not.toHaveProperty("tokenHash");
			await expect(
				members.acceptInvitation(seedAdminId, invitation.token),
			).rejects.toBeInstanceOf(ForbiddenException);

			const concurrentAcceptance = await Promise.allSettled([
				members.acceptInvitation(invitee.id, invitation.token),
				members.acceptInvitation(invitee.id, invitation.token),
			]);
			expect(
				concurrentAcceptance.filter(({ status }) => status === "fulfilled"),
			).toHaveLength(1);
			expect(
				concurrentAcceptance.filter(({ status }) => status === "rejected"),
			).toHaveLength(1);
			await expect(
				prisma.boardInvitation.findUniqueOrThrow({
					where: { id: invitation.invitation.id },
				}),
			).resolves.toMatchObject({ status: "ACCEPTED" });
			await expect(members.list(ownerContext)).resolves.toMatchObject({
				members: expect.arrayContaining([
					expect.objectContaining({
						id: seedOwnerId,
						role: AccessRole.OWNER,
					}),
					expect.objectContaining({
						id: invitee.id,
						role: AccessRole.MEMBER,
					}),
				]),
			});
			await expect(
				members.acceptInvitation(invitee.id, invitation.token),
			).rejects.toBeInstanceOf(ConflictException);
			await expect(
				prisma.boardMember.findUniqueOrThrow({
					where: {
						boardId_userId: { boardId: created.id, userId: invitee.id },
					},
				}),
			).resolves.toMatchObject({ role: BoardRole.MEMBER });
			const updatedMember = await members.updateRole(
				ownerContext,
				invitee.id,
				AccessRole.VIEWER,
			);
			expect(updatedMember).toMatchObject({
				id: invitee.id,
				role: AccessRole.VIEWER,
			});
			expect(updatedMember).not.toHaveProperty("externalAuthId");

			const transferred = await members.transferOwnership(
				ownerContext,
				invitee.id,
				created.version,
			);
			expect(transferred).toMatchObject({
				ownerId: invitee.id,
				role: AccessRole.ADMIN,
				version: created.version + 1,
			});
			await expect(
				prisma.boardMember.findUnique({
					where: {
						boardId_userId: { boardId: created.id, userId: invitee.id },
					},
				}),
			).resolves.toBeNull();
			await expect(
				prisma.boardMember.findUniqueOrThrow({
					where: {
						boardId_userId: { boardId: created.id, userId: seedOwnerId },
					},
				}),
			).resolves.toMatchObject({ role: BoardRole.ADMIN });
			await expect(
				prisma.boardMember.create({
					data: {
						boardId: created.id,
						role: BoardRole.VIEWER,
						userId: invitee.id,
					},
				}),
			).rejects.toThrow();
		} finally {
			await prisma.outboxEvent.deleteMany({
				where: { aggregateId: created.id },
			});
			await prisma.board.delete({ where: { id: created.id } });
			await prisma.user.delete({ where: { id: invitee.id } });
		}
	});

	it("removes members and lets non-owners leave with atomic events", async () => {
		const access = new BoardAccessService(
			prisma as never,
			new BoardAuthorizationPolicy(),
		);
		const boards = new BoardsService(prisma as never, access);
		const members = new BoardMembersService(prisma as never, access);
		const removableUser = await prisma.user.create({
			data: {
				email: `${randomUUID()}@example.test`,
				externalAuthId: `integration_${randomUUID()}`,
				name: "Removable Member",
			},
		});
		const leavingUser = await prisma.user.create({
			data: {
				email: `${randomUUID()}@example.test`,
				externalAuthId: `integration_${randomUUID()}`,
				name: "Leaving Member",
			},
		});
		const created = await boards.create(seedOwnerId, {
			title: "Membership removals",
		});

		try {
			await prisma.boardMember.createMany({
				data: [
					{
						boardId: created.id,
						role: BoardRole.MEMBER,
						userId: removableUser.id,
					},
					{
						boardId: created.id,
						role: BoardRole.MEMBER,
						userId: leavingUser.id,
					},
				],
			});
			const ownerContext = await access.getContext(seedOwnerId, created.id);
			await members.removeMember(ownerContext, removableUser.id);
			const leavingContext = await access.getContext(
				leavingUser.id,
				created.id,
			);
			await members.leave(leavingContext);

			expect(
				await prisma.boardMember.count({ where: { boardId: created.id } }),
			).toBe(0);
			const events = await prisma.activity.findMany({
				where: { boardId: created.id },
				select: { eventName: true },
			});
			expect(events.map(({ eventName }) => eventName)).toEqual(
				expect.arrayContaining([
					BoardEventName.MEMBER_REMOVED,
					BoardEventName.MEMBER_LEFT,
				]),
			);
		} finally {
			await prisma.outboxEvent.deleteMany({
				where: { aggregateId: created.id },
			});
			await prisma.board.delete({ where: { id: created.id } });
			await prisma.user.deleteMany({
				where: { id: { in: [removableUser.id, leavingUser.id] } },
			});
		}
	});

	it("commits an expired invitation status before rejecting acceptance", async () => {
		const access = new BoardAccessService(
			prisma as never,
			new BoardAuthorizationPolicy(),
		);
		const boards = new BoardsService(prisma as never, access);
		const members = new BoardMembersService(prisma as never, access);
		const invitee = await prisma.user.create({
			data: {
				email: `${randomUUID()}@example.test`,
				externalAuthId: `integration_${randomUUID()}`,
				name: "Expired Invitee",
			},
		});
		const created = await boards.create(seedOwnerId, {
			title: "Expired invitation",
		});
		const token = randomUUID().replaceAll("-", "").padEnd(43, "a");
		const invitation = await prisma.boardInvitation.create({
			data: {
				boardId: created.id,
				email: invitee.email ?? "",
				expiresAt: new Date("2020-01-01T00:00:00.000Z"),
				invitedById: seedOwnerId,
				tokenHash: createHash("sha256").update(token).digest("hex"),
			},
		});

		try {
			await expect(
				members.acceptInvitation(invitee.id, token),
			).rejects.toBeInstanceOf(ConflictException);
			await expect(
				prisma.boardInvitation.findUniqueOrThrow({
					where: { id: invitation.id },
				}),
			).resolves.toMatchObject({ status: "EXPIRED" });
		} finally {
			await prisma.outboxEvent.deleteMany({
				where: { aggregateId: created.id },
			});
			await prisma.board.delete({ where: { id: created.id } });
			await prisma.user.delete({ where: { id: invitee.id } });
		}
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
	it("migrates existing columns without guessing completion from their title", async () => {
		const migration = readFileSync(
			new URL(
				"../../prisma/migrations/20260904120000_frontend_completion/migration.sql",
				import.meta.url,
			),
			"utf8",
		);
		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(
				"CREATE TEMP TABLE columns (id text, title text) ON COMMIT DROP",
			);
			await tx.$executeRawUnsafe(
				"CREATE TEMP TABLE tasks (id uuid, due_date timestamptz, assignee_id uuid) ON COMMIT DROP",
			);
			await tx.$executeRawUnsafe(
				"INSERT INTO columns VALUES ('legacy', 'Done')",
			);
			for (const statement of migration.split(";").filter((x) => x.trim()))
				await tx.$executeRawUnsafe(statement);
			const rows = await tx.$queryRawUnsafe<Array<{ is_completed: boolean }>>(
				"SELECT is_completed FROM columns",
			);
			expect(rows).toEqual([{ is_completed: false }]);
		});
	});
});
