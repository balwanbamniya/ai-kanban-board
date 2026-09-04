import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
	IsBoolean,
	IsString,
	MaxLength,
	MinLength,
	ValidateIf,
} from "class-validator";

export class CreateColumnDto {
	@ValidateIf((_o, v: unknown) => v !== undefined)
	@IsBoolean()
	@ApiPropertyOptional({ type: Boolean })
	isCompleted?: boolean;
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(80)
	@ApiProperty({ type: String })
	title!: string;
}
