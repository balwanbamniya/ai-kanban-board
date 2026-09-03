import {
	BadRequestException,
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
		this.assertBoardId(boardId);

		// Filtering by accessibility prevents callers from using authorization
		// failures to discover boards they cannot access.
		const board = await this.prisma.board.findFirst({
			where: {
				id: boardId,
				OR: [{ ownerId: userId }, { members: { some: { userId } } }],
			},
			select: {
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
				: this.toBoardRole(board.members[0]?.role);
		if (!role) {
			// The accessibility filter should make this state unreachable. Failing
			// closed protects the route if the query is changed incorrectly later.
			throw new ForbiddenException("You do not have access to this board.");
		}

		return {
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
		const context = await this.getContext(userId, boardId);
		if (!this.authorization.allowsEvery(context.role, permissions)) {
			throw new ForbiddenException(
				"You do not have permission to perform this action.",
			);
		}
		return context;
	}

	/** Applies the target-sensitive constraints that a role matrix cannot express. */
	async assertCanInviteMember(
		actorUserId: string,
		boardId: string,
		requestedRole: BoardRole,
	): Promise<BoardAccessContext> {
		const actor = await this.assertPermissions(actorUserId, boardId, [
			BoardPermission.MEMBER_INVITE,
		]);
		this.assertCanAssignRole(actor, requestedRole);
		return actor;
	}

	/** Applies the target-sensitive constraints that a role matrix cannot express. */
	async assertCanManageMember(
		actorUserId: string,
		boardId: string,
		targetUserId: string,
		requestedRole?: BoardRole,
	): Promise<BoardAccessContext> {
		if (!isUUID(targetUserId, "4")) {
			throw new BadRequestException("User ID must be a valid UUID.");
		}

		const actor = await this.assertPermissions(actorUserId, boardId, [
			requestedRole !== undefined
				? BoardPermission.MEMBER_ROLE_UPDATE
				: BoardPermission.MEMBER_REMOVE,
		]);

		if (actorUserId === targetUserId) {
			throw new BadRequestException(
				"Members cannot change or remove their own membership.",
			);
		}
		if (requestedRole !== undefined) {
			this.assertCanAssignRole(actor, requestedRole);
		}
		if (targetUserId === actor.ownerId) {
			throw new ForbiddenException(
				"The board owner cannot be managed through this operation.",
			);
		}

		const target = await this.prisma.boardMember.findUnique({
			where: { boardId_userId: { boardId, userId: targetUserId } },
			select: { role: true },
		});
		if (!target) {
			throw new NotFoundException("Board member not found.");
		}

		const targetRole = this.toBoardRole(target.role);
		if (
			actor.role === BoardRole.ADMIN &&
			(targetRole === BoardRole.ADMIN || requestedRole === BoardRole.ADMIN)
		) {
			throw new ForbiddenException(
				"Administrators can only manage regular members and viewers.",
			);
		}

		return actor;
	}

	private assertBoardId(boardId: string): void {
		if (!isUUID(boardId, "4")) {
			throw new BadRequestException("Board ID must be a valid UUID.");
		}
	}

	private assertCanAssignRole(
		actor: BoardAccessContext,
		requestedRole: BoardRole,
	): void {
		if (requestedRole === BoardRole.OWNER) {
			throw new BadRequestException(
				"Use the ownership transfer operation to assign an owner.",
			);
		}
		if (actor.role === BoardRole.ADMIN && requestedRole === BoardRole.ADMIN) {
			throw new ForbiddenException(
				"Administrators cannot assign the administrator role.",
			);
		}
	}

	private toBoardRole(
		role: PersistedBoardRole | undefined,
	): BoardRole | undefined {
		switch (role) {
			case PersistedBoardRole.ADMIN:
				return BoardRole.ADMIN;
			case PersistedBoardRole.MEMBER:
				return BoardRole.MEMBER;
			case PersistedBoardRole.VIEWER:
				return BoardRole.VIEWER;
			case undefined:
				return undefined;
		}
	}
}
