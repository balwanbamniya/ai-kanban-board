import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsInt, IsString, MaxLength, Min, MinLength } from "class-validator";
export class UpdateColumnDto {
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
