import {
	type INestApplication,
	RequestMethod,
	ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";
import { RealtimeRedisService } from "./modules/realtime/realtime-redis.service.js";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter.js";
import {
	createApplicationLogger,
	createHttpLogger,
} from "./observability/http-logger.js";

export function configureApplication(app: INestApplication): INestApplication {
	const config = app.get(AppConfigService);

	app.useLogger(
		createApplicationLogger({
			level: config.logLevel,
			serviceName: config.otelServiceName,
		}),
	);
	app.use(
		helmet({
			contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
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
	app.enableCors({ origin: config.corsOrigins });
	app.useGlobalPipes(
		new ValidationPipe({
			forbidNonWhitelisted: true,
			transform: true,
			whitelist: true,
		}),
	);
	app.setGlobalPrefix(config.apiPrefix, {
		exclude: [{ path: "health", method: RequestMethod.GET }],
	});

	if (config.swaggerEnabled) {
		const swaggerConfig = new DocumentBuilder()
			.setTitle("AI Kanban API")
			.setDescription("HTTP API for the AI Kanban Board")
			.setVersion("1.0")
			.addBearerAuth()
			.build();
		const document = SwaggerModule.createDocument(app, swaggerConfig);
		SwaggerModule.setup("docs", app, document);
	}

	return app;
}

export async function createApplication(): Promise<INestApplication> {
	const app = await NestFactory.create(AppModule, {
		bufferLogs: true,
		rawBody: true,
	});
	configureApplication(app);
	const redis = app.get(RealtimeRedisService);
	await redis.connect();
	app.useWebSocketAdapter(
		new RedisIoAdapter(app, app.get(AppConfigService), redis),
	);
	return app;
}

export async function bootstrap(): Promise<void> {
	const app = await createApplication();
	const config = app.get(AppConfigService);

	await app.listen(config.port);
}
