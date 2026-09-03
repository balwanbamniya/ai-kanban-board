import { Transform, Type } from "class-transformer";
import { IsInt, IsString, MaxLength, Min, MinLength } from "class-validator";
export class UpdateColumnDto {
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(80)
	title!: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	version!: number;
}
