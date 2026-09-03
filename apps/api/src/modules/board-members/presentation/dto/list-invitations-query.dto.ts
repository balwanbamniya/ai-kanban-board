import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { InvitationStatus } from "../../../../generated/prisma/enums.js";

export class ListInvitationsQueryDto {
	@IsOptional()
	@IsUUID("4")
	cursor?: string;

	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 25;

	@IsOptional()
	@IsEnum(InvitationStatus)
	status?: InvitationStatus;
}
