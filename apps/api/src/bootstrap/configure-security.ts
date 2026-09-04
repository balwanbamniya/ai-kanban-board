import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { RequestContextMiddleware } from "../common/request-context/request-context.middleware.js";
import { AppConfigService } from "../config/app-config.service.js";

export function configureSecurity(app: NestExpressApplication): void {
	const config = app.get(AppConfigService);
	const context = app.get(RequestContextMiddleware);
	app.use(context.use.bind(context));
	app.use(
		helmet({
			contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
		}),
	);
	app.useBodyParser("json", { limit: "1mb" });
	app.useBodyParser("urlencoded", { extended: false, limit: "1mb" });
	app.enableCors({
		origin: config.corsOrigins,
		methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
		allowedHeaders: ["authorization", "content-type", "x-request-id"],
		exposedHeaders: ["x-request-id"],
		credentials: false,
	});
}
