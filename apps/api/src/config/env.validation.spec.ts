import { describe, expect, it } from "vitest";
import {
	readTelemetryEnvironment,
	validateEnvironment,
} from "./env.validation.js";

describe("environment validation", () => {
	const databaseUrl =
		"postgresql://ai_kanban:ai_kanban@localhost:5432/ai_kanban";

	it("applies safe defaults and normalizes list and path values", () => {
		expect(
			validateEnvironment({
				API_PREFIX: "/api/v2/",
				CORS_ORIGINS: " https://example.com, http://localhost:3000 ",
				DATABASE_URL: databaseUrl,
			}),
		).toMatchObject({
			API_PREFIX: "api/v2",
			CORS_ORIGINS: ["https://example.com", "http://localhost:3000"],
			DATABASE_CONNECTION_TIMEOUT_MS: 5000,
			DATABASE_POOL_MAX: 10,
			DATABASE_URL: databaseUrl,
			LOG_LEVEL: "info",
			NODE_ENV: "development",
			OTEL_ENABLED: false,
			OTEL_SERVICE_NAME: "ai-kanban-api",
			PORT: 3001,
		});
	});

	it.each([
		[{ DATABASE_URL: databaseUrl, PORT: "0" }, "PORT"],
		[{ API_PREFIX: "api//v1", DATABASE_URL: databaseUrl }, "API_PREFIX"],
		[
			{ CORS_ORIGINS: "ftp://example.com", DATABASE_URL: databaseUrl },
			"CORS_ORIGINS",
		],
		[{ DATABASE_URL: "https://example.com/database" }, "DATABASE_URL"],
		[
			{ DATABASE_POOL_MAX: "101", DATABASE_URL: databaseUrl },
			"DATABASE_POOL_MAX",
		],
	])("rejects invalid service configuration", (environment, key) => {
		expect(() => validateEnvironment(environment)).toThrow(
			new RegExp(`Invalid environment configuration: ${key}`),
		);
	});

	it("validates telemetry before importing the application", () => {
		expect(
			readTelemetryEnvironment({
				OTEL_ENABLED: "true",
				OTEL_SERVICE_NAME: "test-api",
			}),
		).toEqual({ OTEL_ENABLED: true, OTEL_SERVICE_NAME: "test-api" });
	});
});
