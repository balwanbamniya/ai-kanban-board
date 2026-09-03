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
