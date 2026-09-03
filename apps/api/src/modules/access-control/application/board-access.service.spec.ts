import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardRole as PersistedBoardRole } from "../../../generated/prisma/enums.js";
import { BoardPermission } from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";
import { BoardAccessService } from "./board-access.service.js";
import { BoardAuthorizationPolicy } from "./board-authorization.policy.js";

const boardId = "10000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const viewerId = "00000000-0000-4000-8000-000000000004";

describe("BoardAccessService", () => {
	const findBoard = vi.fn();
	const findMember = vi.fn();
	const prisma = {
		board: { findFirst: findBoard },
		boardMember: { findUnique: findMember },
	};
	const service = new BoardAccessService(
		prisma as never,
		new BoardAuthorizationPolicy(),
	);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("resolves ownership without requiring a duplicate membership", async () => {
		findBoard.mockResolvedValue({ id: boardId, members: [], ownerId });

		await expect(service.getContext(ownerId, boardId)).resolves.toEqual({
			boardId,
			ownerId,
			role: BoardRole.OWNER,
			userId: ownerId,
		});
		expect(findBoard).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: boardId,
					OR: [{ ownerId }, { members: { some: { userId: ownerId } } }],
				},
			}),
		);
	});

	it.each([
		[PersistedBoardRole.ADMIN, BoardRole.ADMIN],
		[PersistedBoardRole.MEMBER, BoardRole.MEMBER],
		[PersistedBoardRole.VIEWER, BoardRole.VIEWER],
	] as const)(
		"maps the persisted %s membership explicitly",
		async (role, expected) => {
			findBoard.mockResolvedValue({
				id: boardId,
				members: [{ role }],
				ownerId,
			});

			await expect(
				service.getContext(memberId, boardId),
			).resolves.toMatchObject({
				role: expected,
			});
		},
	);

	it("does not reveal whether an inaccessible board exists", async () => {
		findBoard.mockResolvedValue(null);

		await expect(service.getContext(memberId, boardId)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("rejects malformed identifiers before querying PostgreSQL", async () => {
		await expect(
			service.getContext(memberId, "not-a-uuid"),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			service.assertCanManageMember(ownerId, boardId, "not-a-uuid"),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(findBoard).not.toHaveBeenCalled();
		expect(findMember).not.toHaveBeenCalled();
	});

	it("denies a permission outside the member role", async () => {
		findBoard.mockResolvedValue({
			id: boardId,
			members: [{ role: PersistedBoardRole.MEMBER }],
			ownerId,
		});

		await expect(
			service.assertPermissions(memberId, boardId, [
				BoardPermission.COLUMN_DELETE,
			]),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("blocks membership operations against self or the board owner", async () => {
		findBoard.mockResolvedValue({ id: boardId, members: [], ownerId });

		await expect(
			service.assertCanManageMember(ownerId, boardId, ownerId),
		).rejects.toBeInstanceOf(BadRequestException);
		findBoard.mockResolvedValue({
			id: boardId,
			members: [{ role: PersistedBoardRole.ADMIN }],
			ownerId,
		});
		await expect(
			service.assertCanManageMember(adminId, boardId, ownerId),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(findMember).not.toHaveBeenCalled();
	});

	it("requires the ownership-transfer operation for the owner role", async () => {
		findBoard.mockResolvedValue({ id: boardId, members: [], ownerId });

		await expect(
			service.assertCanManageMember(
				ownerId,
				boardId,
				memberId,
				BoardRole.OWNER,
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("prevents administrators from inviting peers at administrator level", async () => {
		findBoard.mockResolvedValue({
			id: boardId,
			members: [{ role: PersistedBoardRole.ADMIN }],
			ownerId,
		});

		await expect(
			service.assertCanInviteMember(adminId, boardId, BoardRole.ADMIN),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.assertCanInviteMember(adminId, boardId, BoardRole.MEMBER),
		).resolves.toMatchObject({ role: BoardRole.ADMIN });
	});

	it("prevents administrators from managing or promoting administrators", async () => {
		findBoard.mockResolvedValue({
			id: boardId,
			members: [{ role: PersistedBoardRole.ADMIN }],
			ownerId,
		});
		findMember.mockResolvedValue({ role: PersistedBoardRole.ADMIN });

		await expect(
			service.assertCanManageMember(adminId, boardId, memberId),
		).rejects.toBeInstanceOf(ForbiddenException);

		findMember.mockResolvedValue({ role: PersistedBoardRole.VIEWER });
		await expect(
			service.assertCanManageMember(
				adminId,
				boardId,
				viewerId,
				BoardRole.ADMIN,
			),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("allows an administrator to manage regular members and viewers", async () => {
		findBoard.mockResolvedValue({
			id: boardId,
			members: [{ role: PersistedBoardRole.ADMIN }],
			ownerId,
		});
		findMember.mockResolvedValue({ role: PersistedBoardRole.MEMBER });

		await expect(
			service.assertCanManageMember(adminId, boardId, memberId),
		).resolves.toMatchObject({ role: BoardRole.ADMIN });
	});
});
