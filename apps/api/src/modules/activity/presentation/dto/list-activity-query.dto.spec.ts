import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ListActivityQueryDto } from "./list-activity-query.dto.js";

describe("ListActivityQueryDto", () => {
	it("applies defaults and coerces a valid limit", async () => {
		const defaults = plainToInstance(ListActivityQueryDto, {});
		const explicit = plainToInstance(ListActivityQueryDto, { limit: "50" });
		expect(await validate(defaults)).toHaveLength(0);
		expect(defaults.limit).toBe(30);
		expect(await validate(explicit)).toHaveLength(0);
		expect(explicit.limit).toBe(50);
	});

	it("rejects invalid cursors and out-of-range limits", async () => {
		const dto = plainToInstance(ListActivityQueryDto, {
			cursor: "invalid",
			limit: 101,
		});
		expect(await validate(dto)).not.toHaveLength(0);
	});
});
