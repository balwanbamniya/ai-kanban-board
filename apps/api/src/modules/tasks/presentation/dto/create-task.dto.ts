import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
	IsEnum,
	IsISO8601,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	MinLength,
	ValidateIf,
} from "class-validator";
import { TaskPriority } from "../../../../generated/prisma/enums.js";

export class CreateTaskDto {
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	assigneeId?: string;

	@IsUUID("4")
	@ApiProperty({ type: String })
	columnId!: string;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(5_000)
	@ApiPropertyOptional({ type: String })
	description?: string | null;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsISO8601({ strict: true })
	@ApiPropertyOptional({ type: String })
	dueDate?: string;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	parentTaskId?: string;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsEnum(TaskPriority)
	@ApiPropertyOptional({ enum: TaskPriority })
	priority?: TaskPriority;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	@ApiProperty({ type: String })
	title!: string;
}
