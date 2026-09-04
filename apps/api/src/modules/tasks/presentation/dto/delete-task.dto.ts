import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class DeleteTaskDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}
