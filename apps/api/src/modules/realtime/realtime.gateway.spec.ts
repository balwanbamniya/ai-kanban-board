import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway } from "./realtime.gateway.js";

const user = {
	email: "owner@example.com",
	id: "00000000-0000-4000-8000-000000000001",
	name: "Owner",
	platformRole: "USER",
};
const boardId = "10000000-0000-4000-8000-000000000001";

function socket() {
	const emit = vi.fn();
	return {
		data: {
			cursorTimestamps: [],
			joinedBoards: new Set<string>(),
			user,
		},
		id: "socket-one",
		join: vi.fn(),
		leave: vi.fn(),
		to: vi.fn().mockReturnValue({ emit }),
		emit,
	};
}

function setup() {
	const boardAccess = { assertPermissions: vi.fn().mockResolvedValue({}) };
	const presence = {
		join: vi.fn().mockResolvedValue({
			becameOnline: true,
			users: [{ avatarUrl: null, id: user.id, name: user.name }],
		}),
		leave: vi.fn().mockResolvedValue(true),
		refresh: vi.fn(),
		snapshot: vi.fn().mockResolvedValue([]),
	};
	const gateway = new RealtimeGateway(
		{ authenticate: vi.fn() } as never,
		boardAccess as never,
		presence as never,
	);
	return { boardAccess, gateway, presence };
}

describe("RealtimeGateway", () => {
	it("rejects malformed join messages without invoking dependencies", async () => {
		const { boardAccess, gateway, presence } = setup();
		await expect(
			gateway.join(socket() as never, { boardId: "bad" }),
		).resolves.toEqual({ error: { code: "invalid_payload" }, ok: false });
		expect(boardAccess.assertPermissions).not.toHaveBeenCalled();
		expect(presence.join).not.toHaveBeenCalled();
	});

	it("authorizes joins, stores presence, and notifies existing peers", async () => {
		const { gateway, presence } = setup();
		const client = socket();

		await expect(
			gateway.join(client as never, { boardId }),
		).resolves.toMatchObject({ boardId, ok: true });
		expect(client.join).toHaveBeenCalledWith(`board:${boardId}`);
		expect(client.data.joinedBoards.has(boardId)).toBe(true);
		expect(presence.join).toHaveBeenCalledWith(boardId, client.id, user);
		expect(client.emit).toHaveBeenCalledWith(
			"presence:joined",
			expect.objectContaining({
				user: expect.objectContaining({ id: user.id }),
			}),
		);
	});

	it("requires room membership before accepting cursor updates", async () => {
		const { boardAccess, gateway, presence } = setup();
		await expect(
			gateway.updateCursor(socket() as never, { boardId, x: 1, y: 2 }),
		).resolves.toEqual({ error: { code: "not_joined" }, ok: false });
		expect(boardAccess.assertPermissions).not.toHaveBeenCalled();
		expect(presence.refresh).not.toHaveBeenCalled();
	});

	it("does not announce an offline user while another tab remains", async () => {
		const { gateway, presence } = setup();
		presence.leave.mockResolvedValue(false);
		const client = socket();
		client.data.joinedBoards.add(boardId);
		const roomEmit = vi.fn();
		gateway.server = {
			to: vi.fn().mockReturnValue({ emit: roomEmit }),
		} as never;

		await expect(gateway.leave(client as never, { boardId })).resolves.toEqual({
			ok: true,
		});
		expect(roomEmit).not.toHaveBeenCalled();
	});
	it("revalidates every recipient and removes revoked sockets before delivery", async () => {
		const { gateway, boardAccess } = setup();
		const allowed = socket(),
			revoked = socket();
		boardAccess.assertPermissions
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new ForbiddenException());
		gateway.server = {
			in: vi.fn().mockReturnValue({
				fetchSockets: vi.fn().mockResolvedValue([allowed, revoked]),
			}),
		} as never;
		await gateway.emitBoardEvent(boardId, "task.created", {
			eventId: "event-1",
		});
		expect(allowed.emit).toHaveBeenCalledWith("task.created", {
			eventId: "event-1",
		});
		expect(revoked.emit).not.toHaveBeenCalled();
		expect(revoked.leave).toHaveBeenCalledWith(`board:${boardId}`);
	});
});
