import { IsIn } from "class-validator";
import {
	type BoardMembershipRole,
	boardMembershipRoles,
} from "../../../access-control/domain/board-role.enum.js";

export class UpdateMemberRoleDto {
	@IsIn(boardMembershipRoles)
	role!: BoardMembershipRole;
}
