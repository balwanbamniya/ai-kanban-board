import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class DeleteColumnDto {
	@IsOptional()
	@IsUUID("4")
	destinationColumnId?: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	version!: number;
}
