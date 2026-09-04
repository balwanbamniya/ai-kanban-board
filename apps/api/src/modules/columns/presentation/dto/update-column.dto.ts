import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
	IsBoolean,
	IsInt,
	IsString,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
} from "class-validator";
export class UpdateColumnDto {
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

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}
