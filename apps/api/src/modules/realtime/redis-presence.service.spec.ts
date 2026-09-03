import { describe, expect, it, vi } from "vitest";
import { RedisPresenceService } from "./redis-presence.service.js";

describe("RedisPresenceService", () => {
	it("deduplicates multiple sockets into a user presence snapshot", async () => {
		const profile = JSON.stringify({
			avatarUrl: null,
			id: "user-1",
			name: "One",
		});
		const evalCommand = vi.fn().mockResolvedValue(["0", profile, profile]);
		const service = new RedisPresenceService({
			command: { eval: evalCommand },
		} as never);

		await expect(
			service.join("board-1", "socket-1", {
				email: "one@example.com",
				id: "user-1",
				name: "One",
				platformRole: "USER" as never,
			}),
		).resolves.toEqual({
			becameOnline: true,
			users: [{ avatarUrl: null, id: "user-1", name: "One" }],
		});
	});

	it("reports offline only after the final socket leaves", async () => {
		const evalCommand = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(0);
		const service = new RedisPresenceService({
			command: { eval: evalCommand },
		} as never);

		await expect(service.leave("board-1", "socket-1", "user-1")).resolves.toBe(
			false,
		);
		await expect(service.leave("board-1", "socket-2", "user-1")).resolves.toBe(
			true,
		);
	});
});
