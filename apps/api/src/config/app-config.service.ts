import type { ConfigService } from "@nestjs/config";
import type { Environment } from "./env.validation.js";

export class AppConfigService {
	constructor(private readonly config: ConfigService<Environment, true>) {}

	get openaiApiKey(): string | undefined {
		return this.config.get("OPENAI_API_KEY", { infer: true });
	}
	get openaiModel(): string | undefined {
		return this.config.get("OPENAI_MODEL", { infer: true });
	}
	get workersEnabled(): boolean {
		return (
			this.config.get("WORKERS_ENABLED", { infer: true }) ??
			this.environment !== "test"
		);
	}
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

	get clerkAudience(): string[] {
		return this.config.get("CLERK_AUDIENCE", { infer: true }) ?? [];
	}

	get clerkAuthorizedParties(): string[] {
		return this.config.getOrThrow("CLERK_AUTHORIZED_PARTIES");
	}

	get clerkJwtKey(): string {
		return this.config.getOrThrow("CLERK_JWT_KEY");
	}

	get clerkSecretKey(): string {
		return this.config.getOrThrow("CLERK_SECRET_KEY");
	}

	get clerkWebhookSigningSecret(): string {
		return this.config.getOrThrow("CLERK_WEBHOOK_SIGNING_SECRET");
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

	get redisUrl(): string {
		return this.config.getOrThrow("REDIS_URL");
	}

	get swaggerEnabled(): boolean {
		return this.environment !== "production";
	}
}
