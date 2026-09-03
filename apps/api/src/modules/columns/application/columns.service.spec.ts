import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { BoardRole } from "../../access-control/domain/board-role.enum.js";
import { ColumnsService } from "./columns.service.js";

const context = {
	archivedAt: null,
	boardId: "10000000-0000-4000-8000-000000000001",
	ownerId: "00000000-0000-4000-8000-000000000001",
	role: BoardRole.OWNER,
	userId: "00000000-0000-4000-8000-000000000001",
};

function setup(transaction: Record<string, unknown>) {
	const prisma = {
		$transaction: vi.fn(
			async (callback: (value: Record<string, unknown>) => unknown) =>
				callback(transaction),
		),
	};
	const boardAccess = { assertContextPermissions: vi.fn() };
	return {
		boardAccess,
		service: new ColumnsService(prisma as never, boardAccess as never),
	};
}

describe("ColumnsService", () => {
	it("serializes creation, appends a fractional key, and records its event", async () => {
		const column = {
			createdAt: new Date(),
			id: "20000000-0000-4000-8000-000000000001",
			sortKey: "aA",
			title: "Later",
			updatedAt: new Date(),
			version: 1,
		};
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
			activity: { create: vi.fn() },
			column: {
				create: vi.fn().mockResolvedValue(column),
				findFirst: vi.fn().mockResolvedValue({ sortKey: "a9" }),
			},
			outboxEvent: { create: vi.fn() },
		};
		const { boardAccess, service } = setup(transaction);

		await expect(service.create(context, { title: "Later" })).resolves.toBe(
			column,
		);
		expect(transaction.column.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ sortKey: "aA" }),
		});
		expect(transaction.activity.create).toHaveBeenCalledOnce();
		expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
		expect(boardAccess.assertContextPermissions).toHaveBeenCalledWith(context, [
			BoardPermission.COLUMN_CREATE,
		]);
	});

	it("rejects stale updates before writing", async () => {
		const updateMany = vi.fn();
		const transaction = {
			column: {
				findFirst: vi.fn().mockResolvedValue({ title: "Todo", version: 2 }),
				updateMany,
			},
		};
		const { service } = setup(transaction);

		await expect(
			service.update(context, "20000000-0000-4000-8000-000000000001", {
				title: "Doing",
				version: 1,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("rejects incomplete and duplicate reorder payloads", async () => {
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
			column: {
				findMany: vi.fn().mockResolvedValue([
					{ id: "20000000-0000-4000-8000-000000000001", version: 1 },
					{ id: "20000000-0000-4000-8000-000000000002", version: 1 },
				]),
			},
		};
		const { service } = setup(transaction);

		await expect(
			service.reorder(context, {
				columns: [
					{
						id: "20000000-0000-4000-8000-000000000001",
						version: 1,
					},
					{
						id: "20000000-0000-4000-8000-000000000001",
						version: 1,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
