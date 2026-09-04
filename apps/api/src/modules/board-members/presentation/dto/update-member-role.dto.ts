import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import {
	type BoardMembershipRole,
	boardMembershipRoles,
} from "../../../access-control/domain/board-role.enum.js";

export class UpdateMemberRoleDto {
	@IsIn(boardMembershipRoles)
	@ApiProperty({ enum: boardMembershipRoles })
	role!: BoardMembershipRole;
}
