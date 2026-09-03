import { Transform } from "class-transformer";
import {
	IsEnum,
	IsISO8601,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	MinLength,
} from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class CreateTaskDto {
	@IsOptional()
	@IsUUID("4")
	assigneeId?: string;

	@IsUUID("4")
	columnId!: string;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(5_000)
	description?: string | null;

	@IsOptional()
	@IsISO8601({ strict: true })
	dueDate?: string;

	@IsOptional()
	@IsUUID("4")
	parentTaskId?: string;

	@IsOptional()
	@IsEnum(TaskPriority)
	priority?: TaskPriority;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	title!: string;
}
