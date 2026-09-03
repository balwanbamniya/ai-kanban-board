import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { BoardRole } from "../../access-control/domain/board-role.enum.js";
import { ActivityService } from "./activity.service.js";

const context = {
	archivedAt: new Date(),
	boardId: "10000000-0000-4000-8000-000000000001",
	ownerId: "00000000-0000-4000-8000-000000000001",
	role: BoardRole.VIEWER,
	userId: "00000000-0000-4000-8000-000000000004",
};

describe("ActivityService", () => {
	it("returns a stable next cursor from the last returned row", async () => {
		const rows = ["1", "2", "3"].map((suffix) => ({
			actor: null,
			id: `40000000-0000-4000-8000-00000000000${suffix}`,
		}));
		const prisma = {
			activity: { findMany: vi.fn().mockResolvedValue(rows) },
		};
		const boardAccess = { assertContextPermissions: vi.fn() };
		const service = new ActivityService(prisma as never, boardAccess as never);

		await expect(service.list(context, { limit: 2 })).resolves.toEqual({
			activities: rows.slice(0, 2),
			nextCursor: rows[1]?.id,
		});
		expect(boardAccess.assertContextPermissions).toHaveBeenCalledWith(context, [
			BoardPermission.ACTIVITY_READ,
		]);
	});

	it("rejects a cursor from another board", async () => {
		const findMany = vi.fn();
		const prisma = {
			activity: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany,
			},
		};
		const service = new ActivityService(
			prisma as never,
			{ assertContextPermissions: vi.fn() } as never,
		);

		await expect(
			service.list(context, {
				cursor: "40000000-0000-4000-8000-000000000001",
				limit: 30,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(findMany).not.toHaveBeenCalled();
	});
});
