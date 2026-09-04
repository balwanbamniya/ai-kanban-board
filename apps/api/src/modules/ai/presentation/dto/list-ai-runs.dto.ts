import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { AiRunResponseDto } from "./ai-run-response.dto.js";
export class ListAiRunsQueryDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	@ApiPropertyOptional({ default: 25 })
	limit = 25;
	@ValidateIf((_o, v: unknown) => v !== undefined)
	@IsUUID("4")
	@ApiPropertyOptional()
	cursor?: string;
}
export class ListAiRunsResponseDto {
	@ApiProperty({ type: [AiRunResponseDto] }) runs!: AiRunResponseDto[];
	@ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
