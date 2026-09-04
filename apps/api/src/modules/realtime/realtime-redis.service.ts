import {
	Inject,
	Injectable,
	Logger,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { createClient } from "redis";
import { AppConfigService } from "../../config/app-config.service.js";

function createRedisClient(url: string) {
	return createClient({
		url,
		socket: { reconnectStrategy: false },
	});
}

type RedisClient = ReturnType<typeof createRedisClient>;

@Injectable()
export class RealtimeRedisService implements OnApplicationShutdown {
	private readonly logger = new Logger(RealtimeRedisService.name);
	private commandClient?: RedisClient;
	private publisherClient?: RedisClient;
	private subscriberClient?: RedisClient;
	private connectPromise?: Promise<void>;

	constructor(
		@Inject(AppConfigService) private readonly config: AppConfigService,
	) {}

	get command(): RedisClient {
		return this.connectedClient(this.commandClient);
	}

	get publisher(): RedisClient {
		return this.connectedClient(this.publisherClient);
	}

	get subscriber(): RedisClient {
		return this.connectedClient(this.subscriberClient);
	}

	connect(): Promise<void> {
		this.connectPromise ??= this.connectClients();
		return this.connectPromise;
	}

	async onApplicationShutdown(): Promise<void> {
		await Promise.allSettled(
			[this.commandClient, this.publisherClient, this.subscriberClient]
				.filter((client): client is RedisClient => Boolean(client))
				.map(async (client) => {
					if (client.isOpen) await client.close();
				}),
		);
	}

	private async connectClients(): Promise<void> {
		const clients = Array.from({ length: 3 }, () =>
			createRedisClient(this.config.redisUrl),
		);
		for (const client of clients) {
			client.on("error", (error) => {
				this.logger.error(
					"Realtime Redis client error",
					error instanceof Error ? error.stack : undefined,
				);
			});
		}
		try {
			await Promise.all(clients.map((client) => client.connect()));
			[this.commandClient, this.publisherClient, this.subscriberClient] =
				clients;
		} catch (error) {
			await Promise.allSettled(
				clients.map(async (client) => {
					if (client.isOpen) await client.close();
				}),
			);
			this.connectPromise = undefined;
			throw error;
		}
	}

	private connectedClient(client?: RedisClient): RedisClient {
		if (!client?.isReady) {
			throw new Error("Realtime Redis is not connected.");
		}
		return client;
	}
}
