import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import { PrismaService } from "../../../database/prisma.service.js";
import { BoardRole as PersistedBoardRole } from "../../../generated/prisma/enums.js";
import type { BoardAccessContext } from "../domain/board-access-context.js";
import {
	BoardPermission,
	type BoardPermissionRequirement,
} from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";
import { BoardAuthorizationPolicy } from "./board-authorization.policy.js";

const archivedBoardPermissions = new Set<BoardPermission>([
	BoardPermission.ACTIVITY_READ,
	BoardPermission.BOARD_READ,
	BoardPermission.BOARD_RESTORE,
	BoardPermission.INVITATION_READ,
]);

@Injectable()
export class BoardAccessService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAuthorizationPolicy)
		private readonly authorization: BoardAuthorizationPolicy,
	) {}

	async getContext(
		userId: string,
		boardId: string,
	): Promise<BoardAccessContext> {
		this.assertUuid(boardId, "Board ID");

		const board = await this.prisma.board.findFirst({
			where: {
				id: boardId,
				OR: [{ ownerId: userId }, { members: { some: { userId } } }],
			},
			select: {
				archivedAt: true,
				id: true,
				ownerId: true,
				members: {
					where: { userId },
					select: { role: true },
					take: 1,
				},
			},
		});

		if (!board) {
			throw new NotFoundException("Board not found.");
		}

		const role =
			board.ownerId === userId
				? BoardRole.OWNER
				: this.toOptionalBoardRole(board.members[0]?.role);
		if (!role) {
			throw new ForbiddenException("You do not have access to this board.");
		}

		return {
			archivedAt: board.archivedAt,
			boardId: board.id,
			ownerId: board.ownerId,
			role,
			userId,
		};
	}

	async assertPermissions(
		userId: string,
		boardId: string,
		permissions: BoardPermissionRequirement,
	): Promise<BoardAccessContext> {
		return this.assertContextPermissions(
			await this.getContext(userId, boardId),
			permissions,
		);
	}

	assertContextPermissions(
		context: BoardAccessContext,
		permissions: BoardPermissionRequirement,
	): BoardAccessContext {
		if (!this.authorization.allowsEvery(context.role, permissions)) {
			throw new ForbiddenException(
				"You do not have permission to perform this action.",
			);
		}
		if (
			context.archivedAt &&
			permissions.some(
				(permission) => !archivedBoardPermissions.has(permission),
			)
		) {
			throw new ConflictException("Archived boards are read-only.");
		}
		return context;
	}

	assertCanInviteMember(
		context: BoardAccessContext,
		requestedRole: BoardRole,
	): BoardAccessContext {
		this.assertContextPermissions(context, [BoardPermission.MEMBER_INVITE]);
		this.assertCanAssignRole(context, requestedRole);
		return context;
	}

	assertCanManageMember(
		context: BoardAccessContext,
		targetUserId: string,
		targetRole: Exclude<BoardRole, BoardRole.OWNER>,
		requestedRole?: BoardRole,
	): BoardAccessContext {
		this.assertUuid(targetUserId, "User ID");
		this.assertContextPermissions(context, [
			requestedRole === undefined
				? BoardPermission.MEMBER_REMOVE
				: BoardPermission.MEMBER_ROLE_UPDATE,
		]);

		if (context.userId === targetUserId) {
			throw new BadRequestException(
				"Members cannot change or remove their own membership.",
			);
		}
		if (requestedRole !== undefined) {
			this.assertCanAssignRole(context, requestedRole);
		}
		if (targetUserId === context.ownerId) {
			throw new ForbiddenException(
				"The board owner cannot be managed through this operation.",
			);
		}

		if (
			context.role === BoardRole.ADMIN &&
			(targetRole === BoardRole.ADMIN || requestedRole === BoardRole.ADMIN)
		) {
			throw new ForbiddenException(
				"Administrators can only manage regular members and viewers.",
			);
		}
		return context;
	}

	toBoardRole(role: PersistedBoardRole): Exclude<BoardRole, BoardRole.OWNER> {
		switch (role) {
			case PersistedBoardRole.ADMIN:
				return BoardRole.ADMIN;
			case PersistedBoardRole.MEMBER:
				return BoardRole.MEMBER;
			case PersistedBoardRole.VIEWER:
				return BoardRole.VIEWER;
		}
	}

	toPersistedBoardRole(
		role: Exclude<BoardRole, BoardRole.OWNER>,
	): PersistedBoardRole {
		switch (role) {
			case BoardRole.ADMIN:
				return PersistedBoardRole.ADMIN;
			case BoardRole.MEMBER:
				return PersistedBoardRole.MEMBER;
			case BoardRole.VIEWER:
				return PersistedBoardRole.VIEWER;
		}
	}

	private assertCanAssignRole(
		context: BoardAccessContext,
		requestedRole: BoardRole,
	): asserts requestedRole is Exclude<BoardRole, BoardRole.OWNER> {
		if (requestedRole === BoardRole.OWNER) {
			throw new BadRequestException(
				"Use the ownership transfer operation to assign an owner.",
			);
		}
		if (context.role === BoardRole.ADMIN && requestedRole === BoardRole.ADMIN) {
			throw new ForbiddenException(
				"Administrators cannot assign the administrator role.",
			);
		}
	}

	private assertUuid(value: string, label: string): void {
		if (!isUUID(value, "4")) {
			throw new BadRequestException(`${label} must be a valid UUID.`);
		}
	}

	private toOptionalBoardRole(
		role: PersistedBoardRole | undefined,
	): BoardRole | undefined {
		return role === undefined ? undefined : this.toBoardRole(role);
	}
}
