import { ApiProperty } from "@nestjs/swagger";
import { InvitationStatus } from "../../../../generated/prisma/enums.js";
import { BoardRole } from "../../../access-control/domain/board-role.enum.js";
import type {
	InvitationResponse,
	InvitationTokenResponse,
	MemberResponse,
} from "../../application/board-members.service.js";

export class MemberResponseDto implements MemberResponse {
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

export class ListMembersResponseDto {
	@ApiProperty({ type: [MemberResponseDto] })
	members!: MemberResponseDto[];
}

export class InvitationResponseDto implements InvitationResponse {
	@ApiProperty({ format: "date-time", nullable: true, type: String })
	acceptedAt!: Date | null;

	@ApiProperty({ format: "uuid" })
	boardId!: string;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ format: "email" })
	email!: string;

	@ApiProperty({ format: "date-time" })
	expiresAt!: Date;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({
		enum: [BoardRole.ADMIN, BoardRole.MEMBER, BoardRole.VIEWER],
		enumName: "BoardMembershipRole",
	})
	role!: BoardRole.ADMIN | BoardRole.MEMBER | BoardRole.VIEWER;

	@ApiProperty({ enum: InvitationStatus, enumName: "InvitationStatus" })
	status!: InvitationStatus;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;
}

export class InvitationTokenResponseDto implements InvitationTokenResponse {
	@ApiProperty({ type: InvitationResponseDto })
	invitation!: InvitationResponseDto;

	@ApiProperty({
		description: "One-time invitation token; it is not returned by list APIs.",
		example: "NBNKNbT9VvS4fUzjH0pnKcnHfC0lVQfZlU6wZvq0M3A",
	})
	token!: string;
}

export class ListInvitationsResponseDto {
	@ApiProperty({ type: [InvitationResponseDto] })
	invitations!: InvitationResponseDto[];

	@ApiProperty({ format: "uuid", nullable: true, type: String })
	nextCursor!: string | null;
}
