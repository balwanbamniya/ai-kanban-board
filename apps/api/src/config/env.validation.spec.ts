import { describe, expect, it } from "vitest";
import {
	readTelemetryEnvironment,
	validateEnvironment,
} from "./env.validation.js";

describe("environment validation", () => {
	it("applies safe defaults and normalizes list and path values", () => {
		expect(
			validateEnvironment({
				API_PREFIX: "/api/v2/",
				CORS_ORIGINS: " https://example.com, http://localhost:3000 ",
			}),
		).toMatchObject({
			API_PREFIX: "api/v2",
			CORS_ORIGINS: ["https://example.com", "http://localhost:3000"],
			LOG_LEVEL: "info",
			NODE_ENV: "development",
			OTEL_ENABLED: false,
			OTEL_SERVICE_NAME: "ai-kanban-api",
			PORT: 3001,
		});
	});

	it.each([
		[{ PORT: "0" }, "PORT"],
		[{ API_PREFIX: "api//v1" }, "API_PREFIX"],
		[{ CORS_ORIGINS: "ftp://example.com" }, "CORS_ORIGINS"],
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
