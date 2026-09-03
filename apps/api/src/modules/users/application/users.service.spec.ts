import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../../database/prisma.service.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
	it("resolves one active normalized email without exposing provider data", async () => {
		const findFirst = vi.fn().mockResolvedValue({
			avatarUrl: null,
			email: "user@example.com",
			id: "00000000-0000-4000-8000-000000000001",
			name: "Example User",
		});
		const service = new UsersService({
			user: { findFirst },
		} as unknown as PrismaService);

		await expect(service.resolveByEmail("USER@EXAMPLE.COM")).resolves.toEqual({
			email: "user@example.com",
			id: "00000000-0000-4000-8000-000000000001",
			name: "Example User",
		});
		expect(findFirst).toHaveBeenCalledWith({
			select: { avatarUrl: true, email: true, id: true, name: true },
			where: { deletedAt: null, email: "user@example.com" },
		});
	});
});
