import type { NestExpressApplication } from "@nestjs/platform-express";
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "./database/prisma.service.js";
import { createPrismaAdapter } from "./database/prisma-client.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { AuthenticationService } from "./modules/identity/application/authentication.service.js";
import { RealtimeRedisService } from "./modules/realtime/realtime-redis.service.js";

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
			.overrideProvider(RealtimeRedisService)
			.useValue({ command: { ping: async () => "PONG" } })
			.compile();
		app = module.createNestApplication<NestExpressApplication>({
			rawBody: true,
			bufferLogs: true,
		});
		configureApplication(app);
		await app.init();
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
});
