import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskPriority } from "../../../../generated/prisma/enums.js";
import type { TaskResponse } from "../../application/tasks.service.js";

export class TaskAssigneeResponseDto {
	@ApiPropertyOptional()
	avatarUrl!: string | null;

	@ApiPropertyOptional()
	email!: string | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	name!: string;
}

export class TaskBoardContextDto {
	@ApiProperty() id!: string;
	@ApiProperty() title!: string;
	@ApiProperty() color!: string;
	@ApiProperty({ nullable: true, type: String, format: "date-time" })
	archivedAt!: Date | null;
}
export class TaskColumnContextDto {
	@ApiProperty() id!: string;
	@ApiProperty() title!: string;
	@ApiProperty() isCompleted!: boolean;
	@ApiProperty({ type: TaskBoardContextDto }) board!: TaskBoardContextDto;
}
export class SubtaskCountDto {
	@ApiProperty({ minimum: 0 }) subtasks!: number;
}
export class TaskResponseDto implements TaskResponse {
	@ApiProperty({ type: TaskColumnContextDto }) column!: TaskColumnContextDto;
	@ApiProperty({ type: SubtaskCountDto }) _count!: SubtaskCountDto;

	@ApiPropertyOptional({ type: TaskAssigneeResponseDto })
	assignee!: TaskAssigneeResponseDto | null;

	@ApiPropertyOptional({ format: "uuid" })
	assigneeId!: string | null;

	@ApiProperty({ format: "uuid" })
	boardId!: string;

	@ApiProperty({ format: "uuid" })
	columnId!: string;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiPropertyOptional({ format: "uuid" })
	creatorId!: string | null;

	@ApiPropertyOptional()
	description!: string | null;

	@ApiPropertyOptional({ format: "date-time" })
	dueDate!: Date | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiPropertyOptional({ format: "uuid" })
	parentTaskId!: string | null;

	@ApiProperty({ enum: TaskPriority })
	priority!: TaskPriority;

	@ApiProperty({ example: "a0" })
	sortKey!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiProperty({ minimum: 1 })
	version!: number;
}

export class ListTasksResponseDto {
	@ApiPropertyOptional({ format: "uuid" })
	nextCursor!: string | null;

	@ApiProperty({ type: [TaskResponseDto] })
	tasks!: TaskResponseDto[];
}
