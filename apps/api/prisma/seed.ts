import "dotenv/config";
import { createPrismaAdapter } from "../src/database/prisma-client.js";
import { Prisma, PrismaClient } from "../src/generated/prisma/client.js";
import {
	AiOperationKind,
	AiRunStatus,
	BoardRole,
	InvitationStatus,
	OutboxStatus,
	PlatformRole,
	TaskPriority,
} from "../src/generated/prisma/enums.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
	adapter: createPrismaAdapter({
		connectionString: databaseUrl,
		connectionTimeoutMillis: 5000,
		max: 2,
	}),
});

const users = {
	owner: {
		id: "00000000-0000-4000-8000-000000000001",
		externalAuthId: "seed_owner",
		email: "owner@example.test",
		name: "Olivia Owner",
	},
	admin: {
		id: "00000000-0000-4000-8000-000000000002",
		externalAuthId: "seed_admin",
		email: "admin@example.test",
		name: "Avery Admin",
	},
	member: {
		id: "00000000-0000-4000-8000-000000000003",
		externalAuthId: "seed_member",
		email: "member@example.test",
		name: "Morgan Member",
	},
	viewer: {
		id: "00000000-0000-4000-8000-000000000004",
		externalAuthId: "seed_viewer",
		email: "viewer@example.test",
		name: "Val Viewer",
	},
} as const;

const boardId = "10000000-0000-4000-8000-000000000001";
const todoColumnId = "20000000-0000-4000-8000-000000000001";
const doneColumnId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000001";

async function seed(): Promise<void> {
	for (const user of Object.values(users)) {
		const data = {
			...user,
			avatarUrl: null,
			platformRole: PlatformRole.USER,
		};

		await prisma.user.upsert({
			where: { id: user.id },
			update: data,
			create: data,
		});
	}

	const board = {
		id: boardId,
		ownerId: users.owner.id,
		title: "Authorization scenarios",
		description: "Fixture board for admin, member, and viewer flows.",
		color: "#6366f1",
		archivedAt: null,
	};
	await prisma.board.upsert({
		where: { id: boardId },
		update: board,
		create: board,
	});

	const memberships: Array<[string, BoardRole]> = [
		[users.admin.id, BoardRole.ADMIN],
		[users.member.id, BoardRole.MEMBER],
		[users.viewer.id, BoardRole.VIEWER],
	];
	for (const [userId, role] of memberships) {
		await prisma.boardMember.upsert({
			where: { boardId_userId: { boardId, userId } },
			update: { invitedById: users.owner.id, role },
			create: { boardId, userId, role, invitedById: users.owner.id },
		});
	}

	await prisma.boardInvitation.upsert({
		where: { id: "60000000-0000-4000-8000-000000000001" },
		update: {
			boardId,
			email: "invitee@example.test",
			requestedRole: BoardRole.MEMBER,
			status: InvitationStatus.PENDING,
			expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			invitedById: users.owner.id,
			acceptedById: null,
			acceptedAt: null,
			tokenHash: "seed-invitation-token-hash",
		},
		create: {
			id: "60000000-0000-4000-8000-000000000001",
			boardId,
			email: "invitee@example.test",
			requestedRole: BoardRole.MEMBER,
			tokenHash: "seed-invitation-token-hash",
			status: InvitationStatus.PENDING,
			expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			invitedById: users.owner.id,
		},
	});

	for (const column of [
		{ id: todoColumnId, title: "Todo", sortKey: "a0" },
		{ id: doneColumnId, title: "Done", sortKey: "a1" },
	]) {
		await prisma.column.upsert({
			where: { id: column.id },
			update: { boardId, title: column.title, sortKey: column.sortKey },
			create: { ...column, boardId },
		});
	}

	await prisma.task.upsert({
		where: { id: taskId },
		update: {
			boardId,
			columnId: todoColumnId,
			title: "Verify role permissions",
			description: null,
			priority: TaskPriority.HIGH,
			dueDate: null,
			assigneeId: users.member.id,
			creatorId: users.owner.id,
			parentTaskId: null,
			sortKey: "a0",
		},
		create: {
			id: taskId,
			boardId,
			columnId: todoColumnId,
			title: "Verify role permissions",
			priority: TaskPriority.HIGH,
			assigneeId: users.member.id,
			creatorId: users.owner.id,
			sortKey: "a0",
		},
	});

	await prisma.activity.upsert({
		where: { id: "40000000-0000-4000-8000-000000000001" },
		update: {
			actorId: users.owner.id,
			boardId,
			eventName: "board.seeded",
			message: "Seeded board authorization scenarios",
			payload: { fixture: true },
			requestId: "seed-database-foundation",
		},
		create: {
			id: "40000000-0000-4000-8000-000000000001",
			boardId,
			actorId: users.owner.id,
			eventName: "board.seeded",
			message: "Seeded board authorization scenarios",
			payload: { fixture: true },
			requestId: "seed-database-foundation",
		},
	});

	await prisma.outboxEvent.upsert({
		where: { id: "50000000-0000-4000-8000-000000000001" },
		update: {
			aggregateType: "board",
			aggregateId: boardId,
			eventName: "board.seeded",
			payload: { boardId },
			status: OutboxStatus.PENDING,
			attempts: 0,
			lastError: null,
			processedAt: null,
			processingAt: null,
		},
		create: {
			id: "50000000-0000-4000-8000-000000000001",
			aggregateType: "board",
			aggregateId: boardId,
			eventName: "board.seeded",
			payload: { boardId },
		},
	});

	await prisma.aiRun.upsert({
		where: {
			boardId_idempotencyKey: { boardId, idempotencyKey: "seed-summary-v1" },
		},
		update: {
			actorId: users.owner.id,
			boardId,
			operationKind: AiOperationKind.BOARD_SUMMARY,
			provider: "seed",
			model: "seed-model",
			promptVersion: "v1",
			status: AiRunStatus.SUCCEEDED,
			input: { boardId },
			idempotencyKey: "seed-summary-v1",
			output: { headline: "Seeded authorization board" },
			usage: Prisma.DbNull,
			latencyMs: 0,
			errorMessage: null,
			startedAt: null,
			completedAt: null,
		},
		create: {
			boardId,
			actorId: users.owner.id,
			operationKind: AiOperationKind.BOARD_SUMMARY,
			provider: "seed",
			model: "seed-model",
			promptVersion: "v1",
			status: AiRunStatus.SUCCEEDED,
			input: { boardId },
			output: { headline: "Seeded authorization board" },
			latencyMs: 0,
			idempotencyKey: "seed-summary-v1",
		},
	});
}

try {
	await seed();
} finally {
	await prisma.$disconnect();
}
