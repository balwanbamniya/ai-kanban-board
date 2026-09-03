import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Prisma } from "../../../../generated/prisma/client.js";
import {
	AiOperationKind,
	AiRunStatus,
} from "../../../../generated/prisma/enums.js";

export class AiRunResponseDto {
	@ApiPropertyOptional({ format: "uuid" })
	actorId!: string | null;

	@ApiProperty({ format: "uuid" })
	boardId!: string;

	@ApiPropertyOptional({ format: "date-time" })
	completedAt!: Date | null;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiPropertyOptional()
	errorMessage!: string | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	idempotencyKey!: string;

	@ApiProperty({ additionalProperties: true, type: "object" })
	input!: Prisma.JsonValue;

	@ApiPropertyOptional()
	latencyMs!: number | null;

	@ApiPropertyOptional()
	model!: string | null;

	@ApiProperty({ enum: AiOperationKind })
	operationKind!: AiOperationKind;

	@ApiPropertyOptional({ additionalProperties: true, type: "object" })
	output!: Prisma.JsonValue | null;

	@ApiProperty()
	promptVersion!: string;

	@ApiPropertyOptional()
	provider!: string | null;

	@ApiPropertyOptional({ format: "date-time" })
	startedAt!: Date | null;

	@ApiProperty({ enum: AiRunStatus })
	status!: AiRunStatus;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiPropertyOptional({ additionalProperties: true, type: "object" })
	usage!: Prisma.JsonValue | null;
}
