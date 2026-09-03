import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { CreateAiRunDto } from "./create-ai-run.dto.js";

describe("CreateAiRunDto", () => {
	it("normalizes and accepts a safe request envelope", async () => {
		const dto = plainToInstance(CreateAiRunDto, {
			idempotencyKey: "  task:release-42  ",
			input: { goal: "Prepare a release" },
		});

		expect(await validate(dto)).toHaveLength(0);
		expect(dto.idempotencyKey).toBe("task:release-42");
	});

	it.each([
		{ idempotencyKey: "", input: {} },
		{ idempotencyKey: "contains spaces", input: {} },
		{ idempotencyKey: "x".repeat(129), input: {} },
		{ idempotencyKey: "valid-key", input: [] },
	])("rejects malformed envelopes", async (body) => {
		const dto = plainToInstance(CreateAiRunDto, body);
		expect(await validate(dto)).not.toHaveLength(0);
	});
});
