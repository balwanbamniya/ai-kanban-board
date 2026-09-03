import { describe, expect, it } from "vitest";
import {
	readTelemetryEnvironment,
	validateEnvironment,
} from "./env.validation.js";

describe("environment validation", () => {
	const databaseUrl =
		"postgresql://ai_kanban:ai_kanban@localhost:5432/ai_kanban";
	const requiredEnvironment = {
		CLERK_AUTHORIZED_PARTIES: "http://localhost:3000",
		CLERK_JWT_KEY:
			"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----",
		CLERK_SECRET_KEY: "sk_test_example",
		CLERK_WEBHOOK_SIGNING_SECRET: "whsec_example",
		DATABASE_URL: databaseUrl,
		REDIS_URL: "redis://localhost:6379",
	};

	it("applies safe defaults and normalizes list and path values", () => {
		expect(
			validateEnvironment({
				...requiredEnvironment,
				API_PREFIX: "/api/v2/",
				CLERK_AUDIENCE: " api://kanban, api://automation ",
				CLERK_AUTHORIZED_PARTIES:
					" https://example.com, http://localhost:3000 ",
				CORS_ORIGINS: " https://example.com, http://localhost:3000 ",
			}),
		).toMatchObject({
			API_PREFIX: "api/v2",
			CLERK_AUDIENCE: ["api://kanban", "api://automation"],
			CLERK_AUTHORIZED_PARTIES: [
				"https://example.com",
				"http://localhost:3000",
			],
			CLERK_JWT_KEY:
				"-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
			CORS_ORIGINS: ["https://example.com", "http://localhost:3000"],
			DATABASE_CONNECTION_TIMEOUT_MS: 5000,
			DATABASE_POOL_MAX: 10,
			DATABASE_URL: databaseUrl,
			REDIS_URL: "redis://localhost:6379",
			LOG_LEVEL: "info",
			NODE_ENV: "development",
			OTEL_ENABLED: false,
			OTEL_SERVICE_NAME: "ai-kanban-api",
			PORT: 3001,
		});
	});

	it.each([
		"CLERK_SECRET_KEY",
		"CLERK_JWT_KEY",
		"CLERK_WEBHOOK_SIGNING_SECRET",
		"CLERK_AUTHORIZED_PARTIES",
		"REDIS_URL",
	])("requires %s", (key) => {
		const environment: Record<string, unknown> = { ...requiredEnvironment };
		delete environment[key];
		expect(() => validateEnvironment(environment)).toThrow(
			new RegExp(`Invalid environment configuration: ${key}`),
		);
	});

	it.each([
		[{ ...requiredEnvironment, PORT: "0" }, "PORT"],
		[{ ...requiredEnvironment, API_PREFIX: "api//v1" }, "API_PREFIX"],
		[
			{ ...requiredEnvironment, CORS_ORIGINS: "ftp://example.com" },
			"CORS_ORIGINS",
		],
		[
			{ ...requiredEnvironment, CLERK_AUTHORIZED_PARTIES: "" },
			"CLERK_AUTHORIZED_PARTIES",
		],
		[
			{ ...requiredEnvironment, CLERK_AUTHORIZED_PARTIES: "ftp://example.com" },
			"CLERK_AUTHORIZED_PARTIES",
		],
		[
			{ ...requiredEnvironment, DATABASE_URL: "https://example.com/database" },
			"DATABASE_URL",
		],
		[
			{ ...requiredEnvironment, REDIS_URL: "https://example.com/redis" },
			"REDIS_URL",
		],
		[{ ...requiredEnvironment, DATABASE_POOL_MAX: "101" }, "DATABASE_POOL_MAX"],
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
