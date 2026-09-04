import {
	Inject,
	Injectable,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { createPrismaAdapter } from "./prisma-client.js";

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnApplicationShutdown
{
	constructor(@Inject(AppConfigService) config: AppConfigService) {
		super({
			adapter: createPrismaAdapter({
				connectionString: config.databaseUrl,
				connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
				max: config.databasePoolMax,
			}),
		});
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.$connect();
			await this.$queryRaw`SELECT 1`;
		} catch (error) {
			await this.$disconnect().catch(() => undefined);
			throw error;
		}
	}

	async onApplicationShutdown(): Promise<void> {
		await this.$disconnect();
	}
}
