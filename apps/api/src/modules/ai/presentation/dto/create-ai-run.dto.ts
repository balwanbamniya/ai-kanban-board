import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
	IsObject,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from "class-validator";

const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]+$/;

export class CreateAiRunDto {
	@ApiProperty({ minLength: 1, maxLength: 128 })
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim() : value,
	)
	@IsString()
	@MinLength(1)
	@MaxLength(128)
	@Matches(SAFE_IDEMPOTENCY_KEY, {
		message:
			"idempotencyKey may contain only letters, numbers, periods, underscores, colons, and hyphens",
	})
	idempotencyKey!: string;

	@IsObject()
	input!: Record<string, unknown>;
}

export class TaskGenerationRunDto extends CreateAiRunDto {
	@ApiProperty({
		type: "object",
		additionalProperties: false,
		required: ["instructions"],
		properties: {
			instructions: { type: "string", minLength: 1, maxLength: 5000 },
			count: { type: "integer", minimum: 1, maximum: 20, default: 5 },
		},
	})
	declare input: { instructions: string; count?: number };
}
export class BoardSummaryRunDto extends CreateAiRunDto {
	@ApiProperty({
		type: "object",
		additionalProperties: false,
		properties: {
			instructions: { type: "string", minLength: 1, maxLength: 5000 },
		},
	})
	declare input: { instructions?: string };
}
