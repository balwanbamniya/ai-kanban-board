import { Global, Module } from "@nestjs/common";

import {
	ConfigService,
	ConfigModule as NestConfigModule,
} from "@nestjs/config";

import { AppConfigService } from "./app-config.service.js";
import { type Environment, validateEnvironment } from "./env.validation.js";

const appConfigProvider = {
	provide: AppConfigService,
	inject: [ConfigService],
	useFactory: (config: ConfigService<Environment, true>) =>
		new AppConfigService(config),
};

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			cache: true,
			ignoreEnvFile: true,
			validate: validateEnvironment,
		}),
	],
	providers: [appConfigProvider],
	exports: [AppConfigService],
})
export class ConfigModule {}
