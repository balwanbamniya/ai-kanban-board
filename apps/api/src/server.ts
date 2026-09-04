import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap/configure-app.js";
import { configureOpenApi } from "./bootstrap/configure-openapi.js";
import { configureSecurity } from "./bootstrap/configure-security.js";
import { AppConfigService } from "./config/app-config.service.js";
import { RealtimeRedisService } from "./modules/realtime/realtime-redis.service.js";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter.js";
import {
	createApplicationLogger,
	createHttpLogger,
} from "./observability/http-logger.js";

export function configureApplication(
	app: NestExpressApplication,
): NestExpressApplication {
	const config = app.get(AppConfigService);

	app.useLogger(
		createApplicationLogger({
			level: config.logLevel,
			serviceName: config.otelServiceName,
		}),
	);
	app.use(
		createHttpLogger({
			environment: config.environment,
			level: config.logLevel,
			serviceName: config.otelServiceName,
		}),
	);
	app.enableShutdownHooks();
	configureSecurity(app);
	configureApp(app);
	configureOpenApi(app);

	return app;
}

export async function createApplication(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bufferLogs: true,
		rawBody: true,
	});
	try {
		configureApplication(app);
		const redis = app.get(RealtimeRedisService);
		await redis.connect();
		app.useWebSocketAdapter(
			new RedisIoAdapter(app, app.get(AppConfigService), redis),
		);
		return app;
	} catch (error) {
		await app.close();
		throw error;
	}
}

export async function bootstrap(): Promise<void> {
	const app = await createApplication();
	const config = app.get(AppConfigService);

	try {
		await app.listen(config.port);
	} catch (error) {
		await app.close();
		throw error;
	}
}
