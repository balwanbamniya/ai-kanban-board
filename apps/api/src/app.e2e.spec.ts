import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("service foundation", () => {
	let app: INestApplication;
	const queryDatabase = vi.fn().mockResolvedValue([{ ready: 1 }]);
	const currentUser = {
		email: "owner@example.com",
		id: "00000000-0000-4000-8000-000000000001",
		name: "Board Owner",
		platformRole: "USER",
	};
	const authenticate = vi.fn().mockResolvedValue(currentUser);
	const processWebhook = vi.fn().mockResolvedValue(undefined);
	const findUserByEmail = vi.fn().mockResolvedValue({
		avatarUrl: null,
		email: currentUser.email,
		id: currentUser.id,
		name: currentUser.name,
	});

	beforeAll(async () => {
		vi.stubEnv("API_PREFIX", "api/v1");
		vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "http://localhost:3000");
		vi.stubEnv("CLERK_JWT_KEY", "test-public-key");
		vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
		vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_example");
		vi.stubEnv("CORS_ORIGINS", "http://localhost:3000");
		vi.stubEnv(
			"DATABASE_URL",
			"postgresql://test:test@localhost:5432/ai_kanban_test",
		);
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("LOG_LEVEL", "silent");
		vi.stubEnv("OTEL_ENABLED", "false");
		vi.stubEnv("OTEL_SERVICE_NAME", "ai-kanban-api");
		vi.stubEnv("PORT", "3001");

		const { AppModule } = await import("./app.module.js");
		const { PrismaService } = await import("./database/prisma.service.js");
		const { AuthenticationService } = await import(
			"./modules/identity/application/authentication.service.js"
		);
		const { configureApplication } = await import("./server.js");
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue({
				$queryRaw: queryDatabase,
				user: { findFirst: findUserByEmail },
			})
			.overrideProvider(AuthenticationService)
			.useValue({ authenticate, processWebhook })
			.compile();

		app = moduleRef.createNestApplication({ bufferLogs: true, rawBody: true });
		configureApplication(app);
		await app.init();
	});

	afterAll(async () => {
		await app.close();
		vi.unstubAllEnvs();
	});

	it("preserves the original health endpoint", async () => {
		await request(app.getHttpServer())
			.get("/health")
			.expect("x-content-type-options", "nosniff")
			.expect((response) => {
				if (response.headers["x-powered-by"] !== undefined) {
					throw new Error("The API must not expose its HTTP framework");
				}
			})
			.expect(200)
			.expect({ status: "ok" });
	});

	it("reports liveness and preserves a valid request ID", async () => {
		await request(app.getHttpServer())
			.get("/api/v1/health/live")
			.set("x-request-id", "health-check-123")
			.expect("x-request-id", "health-check-123")
			.expect(200)
			.expect({ status: "ok" });
	});

	it("reports readiness and replaces an invalid request ID", async () => {
		await request(app.getHttpServer())
			.get("/api/v1/health/ready")
			.set("x-request-id", "invalid request id")
			.expect("x-request-id", /^[0-9a-f-]{36}$/)
			.expect(200)
			.expect({ status: "ok" });
	});

	it("reports unready without leaking a database error", async () => {
		queryDatabase.mockRejectedValueOnce(
			new Error("sensitive database failure"),
		);

		await request(app.getHttpServer())
			.get("/api/v1/health/ready")
			.expect(503)
			.expect({ status: "error" });
	});

	it("serves an OpenAPI document outside production", async () => {
		await request(app.getHttpServer())
			.get("/docs-json")
			.expect(200)
			.expect(({ body }) => {
				if (body.info?.title !== "AI Kanban API") {
					throw new Error("Unexpected OpenAPI document title");
				}
				expect(body.components?.securitySchemes?.bearer).toMatchObject({
					scheme: "bearer",
					type: "http",
				});
			});
	});

	it("protects application routes by default", async () => {
		await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);
		for (const authorization of [
			"bearer token",
			"Basic token",
			"Bearer  token",
			"Bearer token extra",
		]) {
			await request(app.getHttpServer())
				.get("/api/v1/users/me")
				.set("authorization", authorization)
				.expect(401);
		}
	});

	it("returns a sanitized current user for a valid bearer session", async () => {
		await request(app.getHttpServer())
			.get("/api/v1/users/me")
			.set("authorization", "Bearer session-token")
			.expect(200)
			.expect(currentUser);
		expect(authenticate).toHaveBeenCalledWith("session-token");
	});

	it("resolves only a validated exact email", async () => {
		await request(app.getHttpServer())
			.get("/api/v1/users/resolve")
			.query({ email: "not-an-email" })
			.set("authorization", "Bearer session-token")
			.expect(400);
		await request(app.getHttpServer())
			.get("/api/v1/users/resolve")
			.query({ email: currentUser.email, unexpected: "value" })
			.set("authorization", "Bearer session-token")
			.expect(400);

		await request(app.getHttpServer())
			.get("/api/v1/users/resolve")
			.query({ email: " OWNER@EXAMPLE.COM " })
			.set("authorization", "Bearer session-token")
			.expect(200)
			.expect({
				user: {
					email: currentUser.email,
					id: currentUser.id,
					name: currentUser.name,
				},
			});
		expect(findUserByEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { deletedAt: null, email: currentUser.email },
			}),
		);
	});

	it("accepts the public Clerk webhook route without a user session", async () => {
		await request(app.getHttpServer())
			.post("/api/v1/webhooks/clerk")
			.send({ type: "session.created" })
			.expect(204);
		expect(processWebhook).toHaveBeenCalledOnce();
	});
});
