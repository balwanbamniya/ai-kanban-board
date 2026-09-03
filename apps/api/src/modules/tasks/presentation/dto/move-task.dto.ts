import { Type } from "class-transformer";
import { IsInt, IsUUID, Min } from "class-validator";

export class MoveTaskDto {
	@IsUUID("4")
	columnId!: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	version!: number;
}
