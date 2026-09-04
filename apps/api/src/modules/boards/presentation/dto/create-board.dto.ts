import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	MinLength,
	ValidateIf,
} from "class-validator";

export class CreateBoardDto {
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	@ApiProperty({ type: String })
	title!: string;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() || null : value,
	)
	@IsOptional()
	@IsString()
	@MaxLength(2_000)
	@ApiPropertyOptional({ type: String })
	description?: string | null;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsString()
	@Matches(/^#[0-9a-fA-F]{6}$/)
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.toLowerCase() : value,
	)
	@ApiPropertyOptional({ type: String })
	color?: string;
}
