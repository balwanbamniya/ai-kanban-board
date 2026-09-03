import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { CreateColumnDto } from "./create-column.dto.js";
import { DeleteColumnDto } from "./delete-column.dto.js";
import { ReorderColumnsDto } from "./reorder-columns.dto.js";

describe("column DTOs", () => {
	it("trims valid titles and rejects blank titles", async () => {
		const valid = plainToInstance(CreateColumnDto, { title: "  Review  " });
		expect(await validate(valid)).toHaveLength(0);
		expect(valid.title).toBe("Review");
		expect(
			await validate(plainToInstance(CreateColumnDto, { title: "   " })),
		).not.toHaveLength(0);
	});

	it("coerces versions and requires UUID v4 destinations", async () => {
		const valid = plainToInstance(DeleteColumnDto, {
			destinationColumnId: "10000000-0000-4000-8000-000000000001",
			version: "2",
		});
		expect(await validate(valid)).toHaveLength(0);
		expect(valid.version).toBe(2);
		expect(
			await validate(
				plainToInstance(DeleteColumnDto, {
					destinationColumnId: "not-a-uuid",
					version: 1,
				}),
			),
		).not.toHaveLength(0);
	});

	it("validates every nested reorder entry", async () => {
		const dto = plainToInstance(ReorderColumnsDto, {
			columns: [{ id: "not-a-uuid", version: 0 }],
		});
		expect(await validate(dto)).not.toHaveLength(0);
		expect(
			await validate(plainToInstance(ReorderColumnsDto, { columns: [] })),
		).not.toHaveLength(0);
	});
});
