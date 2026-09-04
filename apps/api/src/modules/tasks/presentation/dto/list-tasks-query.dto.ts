import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class ListTasksQueryDto {
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	assigneeId?: string;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	columnId?: string;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	cursor?: string;

	@Type(() => Number)
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsInt()
	@Min(1)
	@Max(100)
	@ApiPropertyOptional({ type: Number, default: 25 })
	limit = 25;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsEnum(TaskPriority)
	@ApiPropertyOptional({ enum: TaskPriority })
	priority?: TaskPriority;
}
