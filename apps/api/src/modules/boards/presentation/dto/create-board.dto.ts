import { Transform } from "class-transformer";
import {
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from "class-validator";

export class CreateBoardDto {
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	title!: string;

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
