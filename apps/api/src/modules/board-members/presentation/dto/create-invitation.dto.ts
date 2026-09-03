import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, MaxLength } from "class-validator";
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
	email!: string;

	@IsOptional()
	@IsIn(boardMembershipRoles)
	role?: BoardMembershipRole;
}
