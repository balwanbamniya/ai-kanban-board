import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsUUID,
	Max,
	Min,
	ValidateIf,
} from "class-validator";

export class ListBoardsQueryDto {
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional({ type: String })
	cursor?: string;

	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	@ApiPropertyOptional({ type: Number, default: 25 })
	limit = 25;

	@Transform(({ value }: { value: unknown }) => {
		if (value === "true" || value === true) return true;
		if (value === "false" || value === false) return false;
		return value;
	})
	@IsOptional()
	@IsBoolean()
	@ApiPropertyOptional({ type: Boolean, default: false })
	includeArchived = false;
}
