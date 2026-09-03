import { Transform } from "class-transformer";
import {
	IsInt,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	Min,
	MinLength,
} from "class-validator";

export class UpdateBoardDto {
	@IsInt()
	@Min(1)
	version!: number;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	title?: string;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(2_000)
	description?: string | null;

	@IsOptional()
	@IsString()
	@Matches(/^#[0-9a-fA-F]{6}$/)
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.toLowerCase() : value,
	)
	color?: string;
}
