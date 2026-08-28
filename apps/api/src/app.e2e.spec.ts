import type { INestApplication } from "@nestjs/common";
import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, it, vi } from "vitest";

describe("service foundation", () => {
	let app: INestApplication;

	beforeAll(async () => {
		vi.stubEnv("API_PREFIX", "api/v1");
		vi.stubEnv("CORS_ORIGINS", "http://localhost:3000");
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("LOG_LEVEL", "silent");
		vi.stubEnv("OTEL_ENABLED", "false");
		vi.stubEnv("OTEL_SERVICE_NAME", "ai-kanban-api");
		vi.stubEnv("PORT", "3001");

		const { createApplication } = await import("./server.js");
		app = await createApplication();
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
