import type { NestExpressApplication } from "@nestjs/platform-express";
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { io } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppConfigService } from "./config/app-config.service.js";
import { PrismaService } from "./database/prisma.service.js";
import { createPrismaAdapter } from "./database/prisma-client.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { AuthenticationService } from "./modules/identity/application/authentication.service.js";
import { RealtimeRedisService } from "./modules/realtime/realtime-redis.service.js";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter.js";

describe("authenticated HTTP collaboration workflow", () => {
	let app: NestExpressApplication;
	let db: PrismaClient;
	const users: Array<{
		id: string;
		email: string | null;
		name: string;
		platformRole: string;
	}> = [];
	const boardIds: string[] = [];
	beforeAll(async () => {
		if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
		vi.stubEnv("WORKERS_ENABLED", "false");
		vi.stubEnv("OPENAI_API_KEY", "fixture");
		vi.stubEnv("OPENAI_MODEL", "fixture");
		vi.stubEnv("LOG_LEVEL", "silent");
		vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
		vi.stubEnv("CLERK_JWT_KEY", "fixture");
		vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_fixture");
		vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "http://localhost:3000");
		db = new PrismaClient({
			adapter: createPrismaAdapter({
				connectionString: process.env.DATABASE_URL,
				connectionTimeoutMillis: 5000,
				max: 6,
			}),
		});
		await db.$connect();
		for (const name of ["owner", "member", "outsider"])
			users.push(
				await db.user.create({
					data: {
						name,
						email: `${randomUUID()}@example.com`,
						externalAuthId: randomUUID(),
					},
				}),
			);
		const { AppModule } = await import("./app.module.js");
		const { configureApplication } = await import("./server.js");
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(PrismaService)
			.useValue(db)
			.overrideProvider(AuthenticationService)
			.useValue({
				authenticate: async (token: string) => {
					const user = users.find((u) => u.name === token);
					if (!user) throw new UnauthorizedException();
					return user;
				},
			})
			.compile();
		app = module.createNestApplication<NestExpressApplication>({
			rawBody: true,
			bufferLogs: true,
		});
		configureApplication(app);
		const redis = app.get(RealtimeRedisService);
		await redis.connect();
		app.useWebSocketAdapter(
			new RedisIoAdapter(app, app.get(AppConfigService), redis),
		);
		await app.listen(0, "127.0.0.1");
	});
	afterAll(async () => {
		await app?.close();
		if (db) {
			await db.outboxEvent.deleteMany({ where: { boardId: { in: boardIds } } });
			await db.board.deleteMany({ where: { id: { in: boardIds } } });
			await db.user.deleteMany({
				where: { id: { in: users.map((u) => u.id) } },
			});
			await db.$disconnect();
		}
		vi.unstubAllEnvs();
	});
	it("supports boards, invitations, task edits, roles, ownership, archive, and activity", async () => {
		const owner = users[0],
			member = users[1];
		if (!owner || !member) throw new Error("Fixture missing");
		const server = app.getHttpServer();
		const created = await request(server)
			.post("/api/v1/boards")
			.set("authorization", "Bearer owner")
			.send({ title: "HTTP Board" })
			.expect(201);
		const boardId = created.body.id;
		boardIds.push(boardId);
		const base = `/api/v1/boards/${boardId}`;
		await request(server)
			.get(base)
			.set("authorization", "Bearer outsider")
			.expect(404);
		const detail = await request(server)
			.get(base)
			.set("authorization", "Bearer owner")
			.expect(200);
		const [first, second] = detail.body.columns;
		expect(first).toBeDefined();
		expect(second).toBeDefined();
		const invitation = await request(server)
			.post(`${base}/invitations`)
			.set("authorization", "Bearer owner")
			.send({ email: member.email, role: "MEMBER" })
			.expect(201);
		await request(server)
			.post("/api/v1/invitations/accept")
			.set("authorization", "Bearer outsider")
			.send({ token: invitation.body.token })
			.expect(403);
		await request(server)
			.post("/api/v1/invitations/accept")
			.set("authorization", "Bearer member")
			.send({ token: invitation.body.token })
			.expect(200);
		await request(server)
			.post("/api/v1/invitations/accept")
			.set("authorization", "Bearer member")
			.send({ token: invitation.body.token })
			.expect(409);
		const listed = await request(server)
			.get(`${base}/invitations`)
			.set("authorization", "Bearer owner")
			.expect(200);
		expect(JSON.stringify(listed.body)).not.toContain(invitation.body.token);
		expect(JSON.stringify(listed.body)).not.toContain("tokenHash");
		const task = await request(server)
			.post(`${base}/tasks`)
			.set("authorization", "Bearer member")
			.set("x-request-id", "workflow-task")
			.send({ title: "Ship", columnId: first.id })
			.expect(201);
		const ahead = await request(server)
			.post(`${base}/tasks`)
			.set("authorization", "Bearer member")
			.send({ title: "Before ship", columnId: first.id })
			.expect(201);
		await request(server)
			.patch(`${base}/tasks/${ahead.body.id}/move`)
			.set("authorization", "Bearer member")
			.send({ columnId: first.id, version: 1, beforeTaskId: task.body.id })
			.expect(200);
		const ordered = await request(server)
			.get(`${base}/tasks`)
			.query({ columnId: first.id })
			.set("authorization", "Bearer member")
			.expect(200);
		expect(ordered.body.tasks.map((t: { id: string }) => t.id)).toEqual([
			ahead.body.id,
			task.body.id,
		]);

		const moved = await request(server)
			.patch(`${base}/tasks/${task.body.id}/move`)
			.set("authorization", "Bearer member")
			.send({ columnId: second.id, version: 1 })
			.expect(200);
		await request(server)
			.patch(`${base}/tasks/${task.body.id}`)
			.set("authorization", "Bearer member")
			.send({ title: "Stale", version: 1 })
			.expect(409);
		await request(server)
			.patch(`${base}/tasks/${task.body.id}`)
			.set("authorization", "Bearer member")
			.send({ title: null, version: moved.body.version })
			.expect(400);
		await request(server)
			.patch(`${base}/members/${member.id}`)
			.set("authorization", "Bearer owner")
			.send({ role: "VIEWER" })
			.expect(200);
		await request(server)
			.post(`${base}/tasks`)
			.set("authorization", "Bearer member")
			.send({ title: "Forbidden", columnId: first.id })
			.expect(403);
		await request(server)
			.patch(`${base}/members/${member.id}`)
			.set("authorization", "Bearer owner")
			.send({ role: "ADMIN" })
			.expect(200);
		const ai = await request(server)
			.post(`${base}/ai/task-generation-runs`)
			.set("authorization", "Bearer member")
			.send({
				idempotencyKey: "http-ai",
				input: { instructions: "Review release", count: 1 },
			})
			.expect(202);
		expect(ai.body).not.toHaveProperty("leaseToken");
		expect(ai.body).not.toHaveProperty("attempts");
		await db.aiRun.update({
			where: { id: ai.body.id },
			data: {
				status: "SUCCEEDED",
				output: {
					tasks: [
						{ title: "AI review", description: null, priority: "MEDIUM" },
					],
				},
			},
		});
		await request(server)
			.post(`${base}/ai/runs/${ai.body.id}/apply`)
			.set("authorization", "Bearer member")
			.send({
				columnId: first.id,
				suggestionIndexes: [0],
				idempotencyKey: "http-apply",
			})
			.expect(200)
			.expect(({ body }) => expect(body.taskIds).toHaveLength(1));

		const transferred = await request(server)
			.patch(`${base}/owner`)
			.set("authorization", "Bearer owner")
			.send({ userId: member.id, version: created.body.version })
			.expect(200);
		await request(server)
			.patch(`${base}/archive`)
			.set("authorization", "Bearer owner")
			.send({ version: transferred.body.version })
			.expect(403);
		const archived = await request(server)
			.patch(`${base}/archive`)
			.set("authorization", "Bearer member")
			.send({ version: transferred.body.version })
			.expect(200);
		await request(server)
			.post(`${base}/tasks`)
			.set("authorization", "Bearer member")
			.send({ title: "Archived", columnId: first.id })
			.expect(409);
		await request(server)
			.patch(`${base}/restore`)
			.set("authorization", "Bearer member")
			.send({ version: archived.body.version })
			.expect(200);
		await request(server)
			.get(`${base}/activity`)
			.set("authorization", "Bearer member")
			.expect(200);
		const activity = await db.activity.findFirst({
			where: { boardId, eventName: "task.created" },
		});
		expect(activity?.requestId).toBe("workflow-task");
		const event = await db.outboxEvent.findFirst({
			where: { boardId, eventName: "task.created" },
		});
		expect(event?.requestId).toBe("workflow-task");
		await request(server)
			.delete(`${base}/members/${owner.id}`)
			.set("authorization", "Bearer member")
			.expect(204);
		await request(server)
			.get(base)
			.set("authorization", "Bearer owner")
			.expect(404);
	});
	it("queries completion, hierarchy, dates, stable pages, and revoked access across boards", async () => {
		const server = app.getHttpServer();
		const owner = users[0];
		if (!owner) throw new Error("Fixture missing");
		const get = (path: string, actor = "owner") =>
			request(server)
				.get(`/api/v1${path}`)
				.set("authorization", `Bearer ${actor}`);
		const post = (path: string, body: object) =>
			request(server)
				.post(`/api/v1${path}`)
				.set("authorization", "Bearer owner")
				.send(body);
		const patch = (path: string, body: object, actor = "owner") =>
			request(server)
				.patch(`/api/v1${path}`)
				.set("authorization", `Bearer ${actor}`)
				.send(body);
		const created = await post("/boards", { title: "Query fixture" }).expect(
			201,
		);
		const id = created.body.id;
		boardIds.push(id);
		const base = `/boards/${id}`;
		const detail = await get(base).expect(200);
		const first = detail.body.columns[0];
		const done = detail.body.columns.find(
			(c: { isCompleted: boolean }) => c.isCompleted,
		);
		expect(done.title).toBe("Done");
		expect(first.isCompleted).toBe(false);
		const parent = await post(`${base}/tasks`, {
			title: "Parent",
			columnId: first.id,
			assigneeId: owner.id,
			dueDate: "2026-03-08T05:00:00Z",
			priority: "HIGH",
		}).expect(201);
		const child = await post(`${base}/tasks`, {
			title: "Child",
			columnId: done.id,
			parentTaskId: parent.body.id,
			dueDate: "2026-03-09T04:00:00Z",
		}).expect(201);
		const sibling = await post(`${base}/tasks`, {
			title: "Sibling",
			columnId: first.id,
			dueDate: "2026-03-08T05:00:00Z",
		}).expect(201);
		expect(
			(await get(`${base}/tasks/${parent.body.id}`).expect(200)).body._count
				.subtasks,
		).toBe(1);
		expect((await get(base).expect(200)).body.columns[0].taskCount).toBe(2);
		expect(
			(
				await get(`${base}/tasks?parentTaskId=${parent.body.id}`).expect(200)
			).body.tasks.map((t: { id: string }) => t.id),
		).toEqual([child.body.id]);
		expect(
			(
				await get(`/tasks?boardId=${id}&completed=true`).expect(200)
			).body.tasks.map((t: { id: string }) => t.id),
		).toEqual([child.body.id]);
		const filtered = await get(
			`/tasks?boardId=${id}&assigneeId=${owner.id}&priority=HIGH&search=parent&completed=false`,
		).expect(200);
		expect(filtered.body.tasks.map((t: { id: string }) => t.id)).toEqual([
			parent.body.id,
		]);
		expect(filtered.body.tasks[0].column.board.title).toBe("Query fixture");
		const range = await get(
			`/tasks?boardId=${id}&dueFrom=2026-03-08T05:00:00Z&dueBefore=2026-03-09T04:00:00Z`,
		).expect(200);
		expect(range.body.tasks.map((t: { id: string }) => t.id).sort()).toEqual(
			[parent.body.id, sibling.body.id].sort(),
		);
		await get(
			"/tasks?dueFrom=2026-03-09T04:00:00Z&dueBefore=2026-03-08T05:00:00Z",
		).expect(400);
		await get("/tasks?dueFrom=garbage").expect(400);
		await get("/tasks?completed=garbage").expect(400);
		const ids: string[] = [];
		let cursor: string | null = null;
		do {
			const page: {
				body: { tasks: { id: string }[]; nextCursor: string | null };
			} = await get(
				`/tasks?boardId=${id}&limit=1${cursor ? `&cursor=${cursor}` : ""}`,
			).expect(200);
			ids.push(...page.body.tasks.map((t: { id: string }) => t.id));
			cursor = page.body.nextCursor;
		} while (cursor && ids.length < 5);
		expect(new Set(ids).size).toBe(3);
		expect(ids).toHaveLength(3);
		expect(
			(await get(`/tasks?boardId=${id}`, "outsider").expect(200)).body.tasks,
		).toEqual([]);
		await get(`${base}/tasks/${parent.body.id}`, "outsider").expect(404);
		await get(`/tasks?cursor=${parent.body.id}`, "outsider").expect(400);
		const invitation = await post(`${base}/invitations`, {
			email: users[1]?.email,
			role: "MEMBER",
		}).expect(201);
		await request(server)
			.post("/api/v1/invitations/accept")
			.set("authorization", "Bearer member")
			.send({ token: invitation.body.token })
			.expect(200);
		expect(
			(await get(`/tasks?boardId=${id}`, "member").expect(200)).body.tasks,
		).toHaveLength(3);
		await patch(
			`${base}/columns/${first.id}`,
			{ title: first.title, version: first.version, isCompleted: true },
			"member",
		).expect(403);
		await patch(`${base}/columns/${first.id}`, {
			title: first.title,
			version: first.version,
			isCompleted: true,
		}).expect(200);
		await patch(`${base}/columns/${first.id}`, {
			title: first.title,
			version: first.version,
			isCompleted: false,
		}).expect(409);
		expect(
			(await get(`/tasks?boardId=${id}&completed=true`).expect(200)).body.tasks,
		).toHaveLength(3);
		await request(server)
			.delete(`/api/v1${base}/members/${users[1]?.id}`)
			.set("authorization", "Bearer owner")
			.expect(204);
		expect(
			(await get(`/tasks?boardId=${id}`, "member").expect(200)).body.tasks,
		).toEqual([]);
		await request(server)
			.delete(`/api/v1${base}/tasks/${parent.body.id}`)
			.set("authorization", "Bearer owner")
			.send({ version: parent.body.version })
			.expect(204);
		expect(
			(await get(`${base}/tasks/${child.body.id}`).expect(200)).body
				.parentTaskId,
		).toBeNull();
		expect((await get(`${base}/ai/runs?limit=1`).expect(200)).body).toEqual({
			runs: [],
			nextCursor: null,
		});
		await get(`${base}/ai/runs?limit=invalid`).expect(400);
		const runIds: string[] = [];
		for (let i = 0; i < 3; i++) {
			const run = await post(`${base}/ai/task-generation-runs`, {
				idempotencyKey: randomUUID(),
				input: { instructions: "Fixture", count: 1 },
			}).expect(202);
			runIds.push(run.body.id);
		}
		const history = await get(`${base}/ai/runs?limit=2`).expect(200);
		expect(history.body.runs.map((r: { id: string }) => r.id)).toEqual(
			runIds.slice(1).reverse(),
		);
		const historyTail = await get(
			`${base}/ai/runs?limit=2&cursor=${history.body.nextCursor}`,
		).expect(200);
		expect(historyTail.body.runs.map((r: { id: string }) => r.id)).toEqual([
			runIds[0],
		]);
		expect(historyTail.body.nextCursor).toBeNull();

		const current = await get(base).expect(200);
		await patch(`${base}/archive`, {
			version: current.body.board.version,
		}).expect(200);
		expect((await get(`/tasks?boardId=${id}`).expect(200)).body.tasks).toEqual(
			[],
		);
		expect((await get(`${base}/tasks`).expect(200)).body.tasks).toHaveLength(2);
		await get(`${base}/ai/runs?limit=1`).expect(409);
	});
	it("authenticates the actual Nest Socket.IO gateway and acknowledges scoped joins", async () => {
		const client = io(`${await app.getUrl()}/realtime`, {
			auth: { token: "owner" },
			autoConnect: false,
		});
		const outsider = io(`${await app.getUrl()}/realtime`, {
			auth: { token: "outsider" },
			autoConnect: false,
		});
		try {
			for (const socket of [client, outsider]) {
				await new Promise<void>((resolve, reject) => {
					socket.once("connect", resolve);
					socket.once("connect_error", reject);
					socket.connect();
				});
			}
			const boardId = boardIds[1];
			const joined = await client
				.timeout(2000)
				.emitWithAck("board:join", { boardId });
			expect(joined.ok).toBe(true);
			expect(
				joined.presence.some((u: { id: string }) => u.id === users[0]?.id),
			).toBe(true);
			expect(
				await outsider.timeout(2000).emitWithAck("board:join", { boardId }),
			).toEqual({ ok: false, error: { code: "access_denied" } });
			expect(
				await client
					.timeout(2000)
					.emitWithAck("board:join", { boardId: "invalid" }),
			).toEqual({ ok: false, error: { code: "invalid_payload" } });
			expect(
				(await client.timeout(2000).emitWithAck("board:leave", { boardId })).ok,
			).toBe(true);
		} finally {
			client.disconnect();
			outsider.disconnect();
		}
	});
});
