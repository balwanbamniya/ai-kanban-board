import { ApiProperty } from "@nestjs/swagger";
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsInt,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
} from "class-validator";
export class ApplyAiRunDto {
	@ApiProperty({ format: "uuid" }) @IsUUID("4") columnId!: string;
	@ApiProperty({ type: [Number], minItems: 1, maxItems: 20 })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@ArrayUnique()
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(19, { each: true })
	suggestionIndexes!: number[];
	@ApiProperty()
	@IsString()
	@MinLength(1)
	@MaxLength(128)
	@Matches(/^[A-Za-z0-9._:-]+$/)
	idempotencyKey!: string;
}
export class ApplyAiRunResponseDto {
	@ApiProperty({ type: [String], format: "uuid" }) taskIds!: string[];
}
