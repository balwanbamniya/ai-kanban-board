import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
	IsInt,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
} from "class-validator";

export class UpdateBoardDto {
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;

	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	@ApiPropertyOptional({ type: String })
	title?: string;

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
