import { describe, expect, it } from "vitest";
import { BoardPermission } from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";
import { BoardAuthorizationPolicy } from "./board-authorization.policy.js";

describe("BoardAuthorizationPolicy", () => {
	const policy = new BoardAuthorizationPolicy();

	it("grants owners every board permission", () => {
		for (const permission of Object.values(BoardPermission)) {
			expect(policy.allows(BoardRole.OWNER, permission)).toBe(true);
		}
	});

	it.each([
		[
			BoardRole.ADMIN,
			[
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
			],
		],
		[
			BoardRole.MEMBER,
			[
				BoardPermission.BOARD_READ,
				BoardPermission.TASK_CREATE,
				BoardPermission.TASK_UPDATE,
				BoardPermission.TASK_MOVE,
				BoardPermission.ACTIVITY_READ,
			],
		],
		[
			BoardRole.VIEWER,
			[BoardPermission.BOARD_READ, BoardPermission.ACTIVITY_READ],
		],
	] as const)(
		"grants exactly the intended %s permissions",
		(role, expected) => {
			const granted = Object.values(BoardPermission).filter((permission) =>
				policy.allows(role, permission),
			);
			expect(granted).toEqual(expected);
		},
	);

	it("requires every requested permission", () => {
		expect(
			policy.allowsEvery(BoardRole.MEMBER, [
				BoardPermission.BOARD_READ,
				BoardPermission.TASK_UPDATE,
			]),
		).toBe(true);
		expect(
			policy.allowsEvery(BoardRole.MEMBER, [
				BoardPermission.BOARD_READ,
				BoardPermission.COLUMN_UPDATE,
			]),
		).toBe(false);
	});
});
