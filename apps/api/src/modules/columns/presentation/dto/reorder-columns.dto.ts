import { Type } from "class-transformer";
import {
	ArrayMinSize,
	IsArray,
	IsInt,
	IsUUID,
	Min,
	ValidateNested,
} from "class-validator";

class ReorderedColumnDto {
	@IsUUID("4")
	id!: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	version!: number;
}

export class ReorderColumnsDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => ReorderedColumnDto)
	columns!: ReorderedColumnDto[];
}
