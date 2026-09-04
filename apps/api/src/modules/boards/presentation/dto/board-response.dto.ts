import { ApiProperty } from "@nestjs/swagger";
import { BoardRole } from "../../../access-control/domain/board-role.enum.js";
import type {
	BoardDetailResponse,
	BoardListItem,
	BoardMemberResponse,
	BoardResponse,
} from "../../application/boards.service.js";

export class BoardResponseDto implements BoardResponse {
	@ApiProperty({ format: "date-time", nullable: true, type: String })
	archivedAt!: Date | null;

	@ApiProperty({ example: "#6366f1", pattern: "^#[0-9a-f]{6}$" })
	color!: string;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ nullable: true, type: String })
	description!: string | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ format: "uuid" })
	ownerId!: string;

	@ApiProperty({ enum: BoardRole, enumName: "BoardRole" })
	role!: BoardRole;

	@ApiProperty()
	title!: string;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiProperty({ minimum: 1 })
	version!: number;
}

export class BoardListItemDto
	extends BoardResponseDto
	implements BoardListItem
{
	@ApiProperty({ minimum: 1 })
	memberCount!: number;

	@ApiProperty({ minimum: 0 })
	taskCount!: number;
}

export class ListBoardsResponseDto {
	@ApiProperty({ type: [BoardListItemDto] })
	boards!: BoardListItemDto[];

	@ApiProperty({ format: "uuid", nullable: true, type: String })
	nextCursor!: string | null;
}

export class BoardColumnDto {
	@ApiProperty() isCompleted!: boolean;
	@ApiProperty({ minimum: 0 }) taskCount!: number;
	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	sortKey!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiProperty({ minimum: 1 })
	version!: number;
}

export class BoardMemberResponseDto implements BoardMemberResponse {
	@ApiProperty({ format: "uri", nullable: true, type: String })
	avatarUrl!: string | null;

	@ApiProperty({ format: "email", nullable: true, type: String })
	email!: string | null;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ format: "date-time" })
	joinedAt!: Date;

	@ApiProperty()
	name!: string;

	@ApiProperty({ enum: BoardRole, enumName: "BoardRole" })
	role!: BoardRole;
}

export class BoardDetailResponseDto implements BoardDetailResponse {
	@ApiProperty({ type: BoardListItemDto })
	board!: BoardListItemDto;

	@ApiProperty({ type: [BoardColumnDto] })
	columns!: BoardColumnDto[];

	@ApiProperty({ type: [BoardMemberResponseDto] })
	members!: BoardMemberResponseDto[];
}
