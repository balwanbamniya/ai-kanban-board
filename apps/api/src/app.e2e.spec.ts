import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, it, vi } from "vitest";

describe("service foundation", () => {
	let app: INestApplication;
	const queryDatabase = vi.fn().mockResolvedValue([{ ready: 1 }]);

	beforeAll(async () => {
		vi.stubEnv("API_PREFIX", "api/v1");
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
		const { configureApplication } = await import("./server.js");
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue({ $queryRaw: queryDatabase })
			.compile();

		app = moduleRef.createNestApplication({ bufferLogs: true });
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
			});
	});
});
