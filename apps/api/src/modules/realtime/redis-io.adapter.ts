import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server, ServerOptions } from "socket.io";
import type { AppConfigService } from "../../config/app-config.service.js";
import type { RealtimeRedisService } from "./realtime-redis.service.js";

export class RedisIoAdapter extends IoAdapter {
	constructor(
		app: INestApplicationContext,
		private readonly config: AppConfigService,
		private readonly redis: RealtimeRedisService,
	) {
		super(app);
	}

	override createIOServer(
		port: number,
		options?: Partial<ServerOptions>,
	): Server {
		const server = super.createIOServer(port, {
			...options,
			cors: {
				credentials: false,
				origin: this.config.corsOrigins,
			},
		} as ServerOptions) as Server;
		server.adapter(createAdapter(this.redis.publisher, this.redis.subscriber));
		return server;
	}
}
