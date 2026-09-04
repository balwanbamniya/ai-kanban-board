import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, MaxLength, ValidateIf } from "class-validator";
import {
	type BoardMembershipRole,
	boardMembershipRoles,
} from "../../../access-control/domain/board-role.enum.js";

export class CreateInvitationDto {
	@Transform(({ value }: { value: unknown }) =>
		typeof value === "string" ? value.trim().toLowerCase() : value,
	)
	@IsEmail()
	@MaxLength(320)
	@ApiProperty({ type: String })
	email!: string;

	@ValidateIf((_object, value: unknown) => value !== undefined)
	@IsIn(boardMembershipRoles)
	@ApiPropertyOptional({ enum: boardMembershipRoles })
	role?: BoardMembershipRole;
}
