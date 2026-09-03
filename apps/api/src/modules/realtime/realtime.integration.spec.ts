import { createServer, type Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RealtimeRedisService } from "./realtime-redis.service.js";

describe("realtime Redis transport", () => {
	let firstHttp: HttpServer;
	let secondHttp: HttpServer;
	let firstServer: Server;
	let secondServer: Server;
	let firstRedis: RealtimeRedisService;
	let secondRedis: RealtimeRedisService;
	let firstUrl: string;
	let secondUrl: string;
	const clients: Socket[] = [];

	beforeAll(async () => {
		const redisUrl = process.env.REDIS_URL;
		if (!redisUrl)
			throw new Error("REDIS_URL is required for integration tests");
		firstRedis = new RealtimeRedisService({ redisUrl } as never);
		secondRedis = new RealtimeRedisService({ redisUrl } as never);
		await Promise.all([firstRedis.connect(), secondRedis.connect()]);
		firstHttp = createServer();
		secondHttp = createServer();
		firstServer = new Server(firstHttp);
		secondServer = new Server(secondHttp);
		firstServer.adapter(
			createAdapter(firstRedis.publisher, firstRedis.subscriber),
		);
		secondServer.adapter(
			createAdapter(secondRedis.publisher, secondRedis.subscriber),
		);
		for (const server of [firstServer, secondServer]) {
			server.on("connection", (socket) => {
				socket.on("join", (room: string, acknowledge: () => void) => {
					void Promise.resolve(socket.join(room)).then(acknowledge);
				});
			});
		}
		await Promise.all([
			new Promise<void>((resolve) => firstHttp.listen(0, "127.0.0.1", resolve)),
			new Promise<void>((resolve) =>
				secondHttp.listen(0, "127.0.0.1", resolve),
			),
		]);
		const firstAddress = firstHttp.address();
		const secondAddress = secondHttp.address();
		if (!firstAddress || typeof firstAddress === "string") {
			throw new Error("First realtime test server did not bind");
		}
		if (!secondAddress || typeof secondAddress === "string") {
			throw new Error("Second realtime test server did not bind");
		}
		firstUrl = `http://127.0.0.1:${firstAddress.port}`;
		secondUrl = `http://127.0.0.1:${secondAddress.port}`;
	});

	afterAll(async () => {
		for (const client of clients) client.close();
		await Promise.all(
			[firstServer, secondServer]
				.filter((server): server is Server => Boolean(server))
				.map(
					(server) =>
						new Promise<void>((resolve) => server.close(() => resolve())),
				),
		);
		await Promise.all(
			[firstRedis, secondRedis]
				.filter((redis): redis is RealtimeRedisService => Boolean(redis))
				.map((redis) => redis.onModuleDestroy()),
		);
	});

	it("broadcasts room events between separate Socket.IO servers", async () => {
		const firstClient = io(firstUrl, { transports: ["websocket"] });
		const secondClient = io(secondUrl, { transports: ["websocket"] });
		clients.push(firstClient, secondClient);
		await Promise.all([
			new Promise<void>((resolve) => firstClient.once("connect", resolve)),
			new Promise<void>((resolve) => secondClient.once("connect", resolve)),
		]);
		await new Promise<void>((resolve) =>
			secondClient.emit("join", "board:test", resolve),
		);

		const received = new Promise<{ value: number }>((resolve) =>
			secondClient.once("cross-instance", resolve),
		);
		firstServer.to("board:test").emit("cross-instance", { value: 42 });
		await expect(received).resolves.toEqual({ value: 42 });
	});
});
