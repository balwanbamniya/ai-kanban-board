import { Transform, Type } from "class-transformer";
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsUUID,
	Max,
	Min,
} from "class-validator";

export class ListBoardsQueryDto {
	@IsOptional()
	@IsUUID("4")
	cursor?: string;

	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 25;

	@Transform(({ value }: { value: unknown }) => {
		if (value === "true" || value === true) return true;
		if (value === "false" || value === false) return false;
		return value;
	})
	@IsOptional()
	@IsBoolean()
	includeArchived = false;
}
