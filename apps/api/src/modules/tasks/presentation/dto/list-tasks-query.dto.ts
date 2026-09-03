import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class ListTasksQueryDto {
	@IsOptional()
	@IsUUID("4")
	assigneeId?: string;

	@IsOptional()
	@IsUUID("4")
	columnId?: string;

	@IsOptional()
	@IsUUID("4")
	cursor?: string;

	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 25;

	@IsOptional()
	@IsEnum(TaskPriority)
	priority?: TaskPriority;
}
