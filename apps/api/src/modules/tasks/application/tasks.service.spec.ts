import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TaskPriority } from "../../../generated/prisma/enums.js";
import { BoardRole } from "../../access-control/domain/board-role.enum.js";
import { TasksService } from "./tasks.service.js";

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
	return new TasksService(prisma as never, boardAccess as never);
}

describe("TasksService", () => {
	it("rejects empty updates before opening a transaction", async () => {
		const service = setup({});
		await expect(
			service.update(context, "30000000-0000-4000-8000-000000000001", {
				version: 1,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("rejects stale updates without writing", async () => {
		const updateMany = vi.fn();
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
			task: {
				findFirst: vi.fn().mockResolvedValue({ version: 2 }),
				updateMany,
			},
		};
		const service = setup(transaction);
		await expect(
			service.update(context, "30000000-0000-4000-8000-000000000001", {
				title: "Changed",
				version: 1,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("allows the board owner to be assigned during creation", async () => {
		const task = {
			assignee: null,
			boardId: context.boardId,
			columnId: "20000000-0000-4000-8000-000000000001",
			id: "30000000-0000-4000-8000-000000000001",
			title: "Owned",
		};
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
			activity: { create: vi.fn() },
			column: { findFirst: vi.fn().mockResolvedValue({ id: task.columnId }) },
			outboxEvent: { create: vi.fn() },
			task: {
				create: vi.fn().mockResolvedValue(task),
				findFirst: vi.fn().mockResolvedValueOnce(null),
			},
			user: { findFirst: vi.fn().mockResolvedValue({ id: context.userId }) },
		};
		const service = setup(transaction);

		await service.create(context, {
			assigneeId: context.userId,
			columnId: task.columnId,
			priority: TaskPriority.MEDIUM,
			title: task.title,
		});
		expect(transaction.user.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: context.userId }),
			}),
		);
		expect(transaction.activity.create).toHaveBeenCalledOnce();
		expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
	});

	it("rejects transitive parent cycles", async () => {
		const taskId = "30000000-0000-4000-8000-000000000001";
		const childId = "30000000-0000-4000-8000-000000000002";
		const transaction = {
			$queryRaw: vi.fn().mockResolvedValue([{ archivedAt: null }]),
			task: {
				findFirst: vi
					.fn()
					.mockResolvedValueOnce({ version: 1 })
					.mockResolvedValueOnce({ parentTaskId: taskId }),
			},
		};
		const service = setup(transaction);

		await expect(
			service.update(context, taskId, { parentTaskId: childId, version: 1 }),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
