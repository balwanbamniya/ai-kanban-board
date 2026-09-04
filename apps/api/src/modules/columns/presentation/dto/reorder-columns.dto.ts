import { ApiProperty } from "@nestjs/swagger";
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
	@ApiProperty({ type: String })
	id!: string;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}

export class ReorderColumnsDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => ReorderedColumnDto)
	@ApiProperty({ type: [ReorderedColumnDto] })
	columns!: ReorderedColumnDto[];
}
