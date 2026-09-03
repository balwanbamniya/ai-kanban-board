import { Injectable } from "@nestjs/common";
import { BoardPermission } from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";

const permissionsByRole: Readonly<
	Record<BoardRole, ReadonlySet<BoardPermission>>
> = {
	[BoardRole.OWNER]: new Set(Object.values(BoardPermission)),
	[BoardRole.ADMIN]: new Set([
		BoardPermission.BOARD_READ,
		BoardPermission.BOARD_UPDATE,
		BoardPermission.MEMBER_INVITE,
		BoardPermission.MEMBER_ROLE_UPDATE,
		BoardPermission.MEMBER_REMOVE,
		BoardPermission.COLUMN_CREATE,
		BoardPermission.COLUMN_UPDATE,
		BoardPermission.COLUMN_DELETE,
		BoardPermission.TASK_CREATE,
		BoardPermission.TASK_UPDATE,
		BoardPermission.TASK_MOVE,
		BoardPermission.TASK_DELETE,
		BoardPermission.AI_RUN,
		BoardPermission.ACTIVITY_READ,
	]),
	[BoardRole.MEMBER]: new Set([
		BoardPermission.BOARD_READ,
		BoardPermission.TASK_CREATE,
		BoardPermission.TASK_UPDATE,
		BoardPermission.TASK_MOVE,
		BoardPermission.ACTIVITY_READ,
	]),
	[BoardRole.VIEWER]: new Set([
		BoardPermission.BOARD_READ,
		BoardPermission.ACTIVITY_READ,
	]),
};

/** Central policy for the fixed board-role permission matrix. */
@Injectable()
export class BoardAuthorizationPolicy {
	allows(role: BoardRole, permission: BoardPermission): boolean {
		return permissionsByRole[role].has(permission);
	}

	allowsEvery(
		role: BoardRole,
		permissions: readonly BoardPermission[],
	): boolean {
		return permissions.every((permission) => this.allows(role, permission));
	}
}
