import { describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/app-config.service.js";
import { PrismaService } from "./prisma.service.js";

describe("PrismaService", () => {
	const config = {
		databaseConnectionTimeoutMs: 5000,
		databasePoolMax: 2,
		databaseUrl: "postgresql://test:test@localhost:5432/test",
	} as AppConfigService;

	it("connects and disconnects with the Nest lifecycle", async () => {
		const prisma = new PrismaService(config);
		const connect = vi.spyOn(prisma, "$connect").mockResolvedValue();
		const query = vi
			.spyOn(prisma, "$queryRaw")
			.mockResolvedValue([{ ready: 1 }]);
		const disconnect = vi.spyOn(prisma, "$disconnect").mockResolvedValue();

		await prisma.onModuleInit();
		await prisma.onApplicationShutdown();

		expect(connect).toHaveBeenCalledOnce();
		expect(query).toHaveBeenCalledOnce();
		expect(disconnect).toHaveBeenCalledOnce();
	});

	it("disconnects and propagates an unsuccessful startup probe", async () => {
		const prisma = new PrismaService(config);
		const databaseError = new Error("database unavailable");
		vi.spyOn(prisma, "$connect").mockResolvedValue();
		vi.spyOn(prisma, "$queryRaw").mockRejectedValue(databaseError);
		const disconnect = vi.spyOn(prisma, "$disconnect").mockResolvedValue();

		await expect(prisma.onModuleInit()).rejects.toBe(databaseError);
		expect(disconnect).toHaveBeenCalledOnce();
	});
});
