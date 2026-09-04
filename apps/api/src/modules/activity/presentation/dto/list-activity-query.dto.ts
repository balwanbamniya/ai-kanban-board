import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
	IsInt,
	IsOptional,
	IsUUID,
	Max,
	Min,
	ValidateIf,
} from "class-validator";

export class ListActivityQueryDto {
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	cursor?: string;

	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	@ApiPropertyOptional({ type: Number, default: 30 })
	limit = 30;
}
