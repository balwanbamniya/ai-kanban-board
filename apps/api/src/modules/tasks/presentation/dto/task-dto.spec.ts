import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TaskPriority } from "../../../../generated/prisma/enums.js";
import { CreateTaskDto } from "./create-task.dto.js";
import { ListTasksQueryDto } from "./list-tasks-query.dto.js";
import { UpdateTaskDto } from "./update-task.dto.js";

describe("task DTOs", () => {
	it("normalizes text and accepts a complete create request", async () => {
		const dto = plainToInstance(CreateTaskDto, {
			columnId: "20000000-0000-4000-8000-000000000001",
			description: "   ",
			dueDate: "2026-09-04T10:00:00.000Z",
			priority: TaskPriority.HIGH,
			title: "  Ship it  ",
		});
		expect(await validate(dto)).toHaveLength(0);
		expect(dto).toMatchObject({ description: null, title: "Ship it" });
	});

	it("rejects invalid enums, dates, UUIDs, and pagination", async () => {
		const create = plainToInstance(CreateTaskDto, {
			columnId: "wrong",
			dueDate: "tomorrow",
			priority: "BLOCKER",
			title: "",
		});
		const list = plainToInstance(ListTasksQueryDto, { limit: "101" });
		expect(await validate(create)).not.toHaveLength(0);
		expect(await validate(list)).not.toHaveLength(0);
	});

	it("supports explicit nulls when clearing optional task fields", async () => {
		const dto = plainToInstance(UpdateTaskDto, {
			assigneeId: null,
			description: null,
			dueDate: null,
			parentTaskId: null,
			version: "2",
		});
		expect(await validate(dto)).toHaveLength(0);
		expect(dto.version).toBe(2);
	});
});
