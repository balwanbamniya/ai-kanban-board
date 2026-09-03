import { Transform, Type } from "class-transformer";
import {
	IsEnum,
	IsInt,
	IsISO8601,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	MinLength,
} from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class UpdateTaskDto {
	@IsOptional()
	@IsUUID("4")
	assigneeId?: string | null;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(5_000)
	description?: string | null;

	@IsOptional()
	@IsISO8601({ strict: true })
	dueDate?: string | null;

	@IsOptional()
	@IsUUID("4")
	parentTaskId?: string | null;

	@IsOptional()
	@IsEnum(TaskPriority)
	priority?: TaskPriority;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	title?: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	version!: number;
}
