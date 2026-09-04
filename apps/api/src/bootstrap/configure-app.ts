import {
	type INestApplication,
	RequestMethod,
	ValidationPipe,
} from "@nestjs/common";
import { ProblemDetailsFilter } from "../common/filters/problem-details.filter.js";
import { AppConfigService } from "../config/app-config.service.js";

export function configureApp(app: INestApplication): void {
	const config = app.get(AppConfigService);
	app.setGlobalPrefix(config.apiPrefix, {
		exclude: [{ path: "health", method: RequestMethod.GET }],
	});
	app.useGlobalPipes(
		new ValidationPipe({
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: false },
			whitelist: true,
		}),
	);
	app.useGlobalFilters(app.get(ProblemDetailsFilter));
}
