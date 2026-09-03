import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardRole as PersistedBoardRole } from "../../../generated/prisma/enums.js";
import type { BoardAccessContext } from "../domain/board-access-context.js";
import { BoardPermission } from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";
import { BoardAccessService } from "./board-access.service.js";
import { BoardAuthorizationPolicy } from "./board-authorization.policy.js";

const boardId = "10000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";

function context(
	role: BoardRole,
	overrides: Partial<BoardAccessContext> = {},
): BoardAccessContext {
	return {
		archivedAt: null,
		boardId,
		ownerId,
		role,
		userId: role === BoardRole.OWNER ? ownerId : adminId,
		...overrides,
	};
}

describe("BoardAccessService", () => {
	const findBoard = vi.fn();
	const service = new BoardAccessService(
		{ board: { findFirst: findBoard } } as never,
		new BoardAuthorizationPolicy(),
	);

	beforeEach(() => vi.clearAllMocks());

	it("resolves ownership without a duplicate membership", async () => {
		findBoard.mockResolvedValue({
			archivedAt: null,
			id: boardId,
			members: [],
			ownerId,
		});
		await expect(service.getContext(ownerId, boardId)).resolves.toEqual(
			context(BoardRole.OWNER),
		);
	});

	it.each([
		[PersistedBoardRole.ADMIN, BoardRole.ADMIN],
		[PersistedBoardRole.MEMBER, BoardRole.MEMBER],
		[PersistedBoardRole.VIEWER, BoardRole.VIEWER],
	] as const)(
		"maps the persisted %s role explicitly",
		async (role, expected) => {
			findBoard.mockResolvedValue({
				archivedAt: null,
				id: boardId,
				members: [{ role }],
				ownerId,
			});
			await expect(service.getContext(adminId, boardId)).resolves.toMatchObject(
				{
					role: expected,
				},
			);
			expect(service.toBoardRole(role)).toBe(expected);
			expect(service.toPersistedBoardRole(expected)).toBe(role);
		},
	);

	it("hides inaccessible and nonexistent boards behind the same response", async () => {
		findBoard.mockResolvedValue(null);
		await expect(service.getContext(memberId, boardId)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("rejects malformed board identifiers before querying Prisma", async () => {
		await expect(
			service.getContext(memberId, "invalid"),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(findBoard).not.toHaveBeenCalled();
	});

	it("enforces role permissions against an existing context", () => {
		expect(() =>
			service.assertContextPermissions(context(BoardRole.MEMBER), [
				BoardPermission.COLUMN_DELETE,
			]),
		).toThrow(ForbiddenException);
		expect(
			service.assertContextPermissions(context(BoardRole.MEMBER), [
				BoardPermission.TASK_MOVE,
			]),
		).toMatchObject({ role: BoardRole.MEMBER });
	});

	it("allows archived reads and restoration but rejects mutations", () => {
		const archived = context(BoardRole.OWNER, { archivedAt: new Date() });
		expect(() =>
			service.assertContextPermissions(archived, [BoardPermission.BOARD_READ]),
		).not.toThrow();
		expect(() =>
			service.assertContextPermissions(archived, [
				BoardPermission.BOARD_RESTORE,
			]),
		).not.toThrow();
		expect(() =>
			service.assertContextPermissions(archived, [
				BoardPermission.MEMBER_INVITE,
			]),
		).toThrow(ConflictException);
	});

	it("limits administrator invitation and role assignments", () => {
		const admin = context(BoardRole.ADMIN);
		expect(() => service.assertCanInviteMember(admin, BoardRole.ADMIN)).toThrow(
			ForbiddenException,
		);
		expect(() =>
			service.assertCanInviteMember(admin, BoardRole.MEMBER),
		).not.toThrow();
		expect(() =>
			service.assertCanInviteMember(context(BoardRole.OWNER), BoardRole.OWNER),
		).toThrow(BadRequestException);
	});

	it("enforces target-sensitive membership rules without another board lookup", () => {
		const admin = context(BoardRole.ADMIN);
		expect(() =>
			service.assertCanManageMember(admin, adminId, BoardRole.MEMBER),
		).toThrow(BadRequestException);
		expect(() =>
			service.assertCanManageMember(admin, ownerId, BoardRole.MEMBER),
		).toThrow(ForbiddenException);
		expect(() =>
			service.assertCanManageMember(admin, memberId, BoardRole.ADMIN),
		).toThrow(ForbiddenException);
		expect(() =>
			service.assertCanManageMember(admin, memberId, BoardRole.MEMBER),
		).not.toThrow();
	});
});
