import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
	ValidateIf,
} from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class UpdateTaskDto {
	@IsOptional()
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	assigneeId?: string | null;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(5_000)
	@ApiPropertyOptional({ type: String })
	description?: string | null;

	@IsOptional()
	@IsISO8601({ strict: true })
	@ApiPropertyOptional({ type: String })
	dueDate?: string | null;

	@IsOptional()
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	parentTaskId?: string | null;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsEnum(TaskPriority)
	@ApiPropertyOptional({ enum: TaskPriority })
	priority?: TaskPriority;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	@ApiPropertyOptional({ type: String })
	title?: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}
