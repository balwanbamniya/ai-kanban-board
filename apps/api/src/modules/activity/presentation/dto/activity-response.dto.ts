import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { ActivityResponse } from "../../application/activity.service.js";

export class ActivityActorResponseDto {
	@ApiPropertyOptional()
	avatarUrl!: string | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	name!: string;
}

export class ActivityResponseDto implements ActivityResponse {
	@ApiPropertyOptional({ type: ActivityActorResponseDto })
	actor!: ActivityActorResponseDto | null;

	@ApiPropertyOptional({ format: "uuid" })
	actorId!: string | null;

	@ApiProperty({ format: "uuid" })
	boardId!: string;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ example: "task.created" })
	eventName!: string;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	message!: string;

	@ApiPropertyOptional({ additionalProperties: true, type: "object" })
	payload!: ActivityResponse["payload"];

	@ApiPropertyOptional()
	requestId!: string | null;
}

export class ListActivityResponseDto {
	@ApiProperty({ type: [ActivityResponseDto] })
	activities!: ActivityResponseDto[];

	@ApiPropertyOptional({ format: "uuid" })
	nextCursor!: string | null;
}
