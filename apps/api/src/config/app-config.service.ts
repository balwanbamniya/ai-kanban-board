import type { ConfigService } from "@nestjs/config";
import type { Environment } from "./env.validation.js";

export class AppConfigService {
	constructor(private readonly config: ConfigService<Environment, true>) {}

	get apiPrefix(): string {
		return this.config.getOrThrow("API_PREFIX");
	}

	get corsOrigins(): string[] {
		return this.config.getOrThrow("CORS_ORIGINS");
	}

	get databaseConnectionTimeoutMs(): number {
		return this.config.getOrThrow("DATABASE_CONNECTION_TIMEOUT_MS");
	}

	get databasePoolMax(): number {
		return this.config.getOrThrow("DATABASE_POOL_MAX");
	}

	get databaseUrl(): string {
		return this.config.getOrThrow("DATABASE_URL");
	}

	get environment(): Environment["NODE_ENV"] {
		return this.config.getOrThrow("NODE_ENV");
	}

	get logLevel(): Environment["LOG_LEVEL"] {
		return this.config.getOrThrow("LOG_LEVEL");
	}

	get otelServiceName(): string {
		return this.config.getOrThrow("OTEL_SERVICE_NAME");
	}

	get port(): number {
		return this.config.getOrThrow("PORT");
	}

	get swaggerEnabled(): boolean {
		return this.environment !== "production";
	}
}
