import { applyDecorators, UseGuards } from "@nestjs/common";
import type { BoardPermissionRequirement } from "../domain/board-permission.enum.js";
import { BoardPoliciesGuard } from "./board-policies.guard.js";
import { BoardPolicy } from "./board-policy.metadata.js";

/** Requires every permission for the board identified by `:boardId`. */
export function CheckBoardPermissions(
	...permissions: BoardPermissionRequirement
): MethodDecorator & ClassDecorator {
	return applyDecorators(
		BoardPolicy({ boardIdParam: "boardId", permissions }),
		UseGuards(BoardPoliciesGuard),
	);
}
