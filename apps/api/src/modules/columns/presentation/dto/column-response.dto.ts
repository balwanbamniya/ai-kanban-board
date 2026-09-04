import { ApiProperty } from "@nestjs/swagger";
import type { ColumnResponse } from "../../application/columns.service.js";

export class ColumnResponseDto implements ColumnResponse {
	@ApiProperty() isCompleted!: boolean;
	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ example: "a0" })
	sortKey!: string;

	@ApiProperty({ example: "In progress" })
	title!: string;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiProperty({ minimum: 1 })
	version!: number;
}
