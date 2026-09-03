import { createHash, randomBytes } from "node:crypto";
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
import { Prisma } from "../../../generated/prisma/client.js";
import {
	InvitationStatus,
	BoardRole as PersistedBoardRole,
} from "../../../generated/prisma/enums.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import {
	type BoardMembershipRole,
	BoardRole,
} from "../../access-control/domain/board-role.enum.js";
import {
	BoardEventName,
	recordBoardEvent,
} from "../../boards/application/board-events.js";
import type { BoardResponse } from "../../boards/application/boards.service.js";
import type { CreateInvitationDto } from "../presentation/dto/create-invitation.dto.js";
import type { ListInvitationsQueryDto } from "../presentation/dto/list-invitations-query.dto.js";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export interface MemberResponse {
	avatarUrl: string | null;
	email: string | null;
	id: string;
	joinedAt: Date;
	name: string;
	role: BoardRole;
}

export interface InvitationResponse {
	acceptedAt: Date | null;
	boardId: string;
	createdAt: Date;
	email: string;
	expiresAt: Date;
	id: string;
	role: BoardMembershipRole;
	status: InvitationStatus;
	updatedAt: Date;
}

export interface InvitationTokenResponse {
	invitation: InvitationResponse;
	token: string;
}

type LockedBoard = {
	archivedAt: Date | null;
	id: string;
	ownerId: string;
	version: number;
};

@Injectable()
export class BoardMembersService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async list(
		context: BoardAccessContext,
	): Promise<{ members: MemberResponse[] }> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_READ,
		]);
		const board = await this.prisma.board.findUnique({
			where: { id: context.boardId },
			select: {
				createdAt: true,
				owner: {
					select: { avatarUrl: true, email: true, id: true, name: true },
				},
				members: {
					orderBy: { joinedAt: "asc" },
					select: {
						joinedAt: true,
						role: true,
						user: {
							select: {
								avatarUrl: true,
								email: true,
								id: true,
								name: true,
							},
						},
					},
				},
			},
		});
		if (!board) {
			throw new NotFoundException("Board not found.");
		}

		return {
			members: [
				{
					...board.owner,
					joinedAt: board.createdAt,
					role: BoardRole.OWNER,
				},
				...board.members.map(({ joinedAt, role, user }) => ({
					...user,
					joinedAt,
					role: this.boardAccess.toBoardRole(role),
				})),
			],
		};
	}

	async listInvitations(
		context: BoardAccessContext,
		query: ListInvitationsQueryDto,
	): Promise<{ invitations: InvitationResponse[]; nextCursor: string | null }> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.INVITATION_READ,
		]);
		const now = new Date();
		const invitations = await this.prisma.boardInvitation.findMany({
			where: {
				boardId: context.boardId,
				...this.invitationStatusFilter(query.status, now),
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			cursor: query.cursor ? { id: query.cursor } : undefined,
			skip: query.cursor ? 1 : undefined,
			take: query.limit + 1,
		});
		const hasNextPage = invitations.length > query.limit;
		const page = hasNextPage ? invitations.slice(0, query.limit) : invitations;
		return {
			invitations: page.map((invitation) => this.toInvitation(invitation, now)),
			nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
		};
	}

	async createInvitation(
		context: BoardAccessContext,
		dto: CreateInvitationDto,
	): Promise<InvitationTokenResponse> {
		const requestedRole = dto.role ?? BoardRole.MEMBER;
		this.boardAccess.assertCanInviteMember(context, requestedRole);
		const email = dto.email.trim().toLowerCase();
		const token = this.createToken();
		const now = new Date();

		return this.prisma.$transaction(async (transaction) => {
			const board = await this.lockActiveBoard(transaction, context.boardId);
			const expiredInvitation = await transaction.boardInvitation.findFirst({
				where: {
					boardId: context.boardId,
					email,
					expiresAt: { lte: now },
					status: InvitationStatus.PENDING,
				},
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			});
			if (expiredInvitation) {
				await transaction.boardInvitation.update({
					where: { id: expiredInvitation.id },
					data: { status: InvitationStatus.EXPIRED },
				});
				await recordBoardEvent(transaction, {
					actorId: context.userId,
					boardId: context.boardId,
					eventName: BoardEventName.INVITATION_EXPIRED,
					message: "Board invitation expired",
					payload: {
						boardId: context.boardId,
						invitationId: expiredInvitation.id,
					},
				});
			}

			const existingUser = await transaction.user.findUnique({
				where: { email },
				select: { deletedAt: true, id: true },
			});
			if (existingUser && !existingUser.deletedAt) {
				if (existingUser.id === board.ownerId) {
					throw new ConflictException("This user already owns the board.");
				}
				const membership = await transaction.boardMember.findUnique({
					where: {
						boardId_userId: {
							boardId: context.boardId,
							userId: existingUser.id,
						},
					},
					select: { userId: true },
				});
				if (membership) {
					throw new ConflictException("This user is already a board member.");
				}
			}

			const pending = await transaction.boardInvitation.findFirst({
				where: {
					boardId: context.boardId,
					email,
					status: InvitationStatus.PENDING,
				},
				select: { id: true },
			});
			if (pending) {
				throw new ConflictException(
					"A pending invitation already exists for this email address.",
				);
			}

			const invitation = await transaction.boardInvitation.create({
				data: {
					boardId: context.boardId,
					email,
					expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
					invitedById: context.userId,
					requestedRole: this.boardAccess.toPersistedBoardRole(requestedRole),
					tokenHash: this.hashToken(token),
				},
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.INVITATION_CREATED,
				message: "Board invitation created",
				payload: {
					boardId: context.boardId,
					invitationId: invitation.id,
					role: requestedRole,
				},
			});
			return { invitation: this.toInvitation(invitation, now), token };
		});
	}

	async resendInvitation(
		context: BoardAccessContext,
		invitationId: string,
	): Promise<InvitationTokenResponse> {
		this.assertUuid(invitationId, "Invitation ID");
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.MEMBER_INVITE,
		]);
		const token = this.createToken();
		const now = new Date();

		const result = await this.prisma.$transaction(async (transaction) => {
			const board = await this.lockActiveBoard(transaction, context.boardId);
			const existing = await transaction.boardInvitation.findFirst({
				where: { boardId: context.boardId, id: invitationId },
			});
			if (!existing) {
				throw new NotFoundException("Invitation not found.");
			}
			if (
				existing.status !== InvitationStatus.PENDING ||
				existing.expiresAt <= now
			) {
				if (
					existing.status === InvitationStatus.PENDING &&
					existing.expiresAt <= now
				) {
					await transaction.boardInvitation.update({
						where: { id: existing.id },
						data: { status: InvitationStatus.EXPIRED },
					});
					await recordBoardEvent(transaction, {
						actorId: context.userId,
						boardId: context.boardId,
						eventName: BoardEventName.INVITATION_EXPIRED,
						message: "Board invitation expired",
						payload: { boardId: context.boardId, invitationId },
					});
				}
				return { kind: "unavailable" as const };
			}

			const role = this.boardAccess.toBoardRole(existing.requestedRole);
			this.boardAccess.assertCanInviteMember(context, role);
			if (
				await this.cancelIfExistingParticipant(
					transaction,
					board,
					existing.id,
					existing.email,
					context.userId,
				)
			) {
				return { kind: "unavailable" as const };
			}
			const invitation = await transaction.boardInvitation.update({
				where: { id: existing.id },
				data: {
					expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
					invitedById: context.userId,
					tokenHash: this.hashToken(token),
				},
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.INVITATION_RESENT,
				message: "Board invitation resent",
				payload: { boardId: context.boardId, invitationId },
			});
			return {
				invitation: this.toInvitation(invitation, now),
				kind: "resent" as const,
				token,
			};
		});

		if (result.kind === "unavailable") {
			throw new ConflictException("This invitation is no longer available.");
		}
		return { invitation: result.invitation, token: result.token };
	}

	async cancelInvitation(
		context: BoardAccessContext,
		invitationId: string,
	): Promise<void> {
		this.assertUuid(invitationId, "Invitation ID");
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.MEMBER_INVITE,
		]);
		const result = await this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const invitation = await transaction.boardInvitation.findFirst({
				where: { boardId: context.boardId, id: invitationId },
			});
			if (!invitation) {
				throw new NotFoundException("Invitation not found.");
			}
			const role = this.boardAccess.toBoardRole(invitation.requestedRole);
			this.boardAccess.assertCanInviteMember(context, role);
			if (
				invitation.status === InvitationStatus.PENDING &&
				invitation.expiresAt <= new Date()
			) {
				await transaction.boardInvitation.update({
					where: { id: invitation.id },
					data: { status: InvitationStatus.EXPIRED },
				});
				await recordBoardEvent(transaction, {
					actorId: context.userId,
					boardId: context.boardId,
					eventName: BoardEventName.INVITATION_EXPIRED,
					message: "Board invitation expired",
					payload: { boardId: context.boardId, invitationId },
				});
				return false;
			}
			const update = await transaction.boardInvitation.updateMany({
				where: {
					id: invitationId,
					status: InvitationStatus.PENDING,
				},
				data: { status: InvitationStatus.CANCELLED },
			});
			if (update.count !== 1) {
				return false;
			}
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.INVITATION_CANCELLED,
				message: "Board invitation cancelled",
				payload: { boardId: context.boardId, invitationId },
			});
			return true;
		});
		if (!result) {
			throw new ConflictException("This invitation is no longer available.");
		}
	}

	async acceptInvitation(
		userId: string,
		token: string,
	): Promise<InvitationResponse> {
		if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
			throw new BadRequestException("Invitation token is invalid.");
		}
		const now = new Date();
		const result = await this.prisma.$transaction(async (transaction) => {
			const locatedInvitation = await transaction.boardInvitation.findUnique({
				where: { tokenHash: this.hashToken(token) },
				select: { boardId: true, id: true },
			});
			if (!locatedInvitation) {
				throw new NotFoundException("Invitation not found.");
			}
			const board = await this.lockActiveBoard(
				transaction,
				locatedInvitation.boardId,
			);
			const invitation = await transaction.boardInvitation.findUniqueOrThrow({
				where: { id: locatedInvitation.id },
			});
			if (invitation.status !== InvitationStatus.PENDING) {
				return { kind: "unavailable" as const };
			}
			if (invitation.expiresAt <= now) {
				await transaction.boardInvitation.update({
					where: { id: invitation.id },
					data: { status: InvitationStatus.EXPIRED },
				});
				await recordBoardEvent(transaction, {
					actorId: userId,
					boardId: invitation.boardId,
					eventName: BoardEventName.INVITATION_EXPIRED,
					message: "Board invitation expired",
					payload: {
						boardId: invitation.boardId,
						invitationId: invitation.id,
					},
				});
				return { kind: "expired" as const };
			}

			const user = await transaction.user.findFirst({
				where: { deletedAt: null, id: userId },
				select: { email: true },
			});
			if (!user?.email) {
				throw new NotFoundException("User not found.");
			}
			if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
				throw new ForbiddenException(
					"This invitation was issued for a different email address.",
				);
			}

			const membership = await transaction.boardMember.findUnique({
				where: {
					boardId_userId: { boardId: invitation.boardId, userId },
				},
				select: { userId: true },
			});
			if (board.ownerId === userId || membership) {
				await transaction.boardInvitation.update({
					where: { id: invitation.id },
					data: { status: InvitationStatus.CANCELLED },
				});
				await recordBoardEvent(transaction, {
					actorId: userId,
					boardId: invitation.boardId,
					eventName: BoardEventName.INVITATION_CANCELLED,
					message: "Board invitation cancelled",
					payload: {
						boardId: invitation.boardId,
						invitationId: invitation.id,
					},
				});
				return { kind: "already-member" as const };
			}

			const claim = await transaction.boardInvitation.updateMany({
				where: {
					expiresAt: { gt: now },
					id: invitation.id,
					status: InvitationStatus.PENDING,
				},
				data: {
					acceptedAt: now,
					acceptedById: userId,
					status: InvitationStatus.ACCEPTED,
				},
			});
			if (claim.count !== 1) {
				return { kind: "unavailable" as const };
			}
			await transaction.boardMember.create({
				data: {
					boardId: invitation.boardId,
					invitedById: invitation.invitedById,
					role: invitation.requestedRole,
					userId,
				},
			});
			await recordBoardEvent(transaction, {
				actorId: userId,
				boardId: invitation.boardId,
				eventName: BoardEventName.INVITATION_ACCEPTED,
				message: "Board invitation accepted",
				payload: {
					boardId: invitation.boardId,
					invitationId: invitation.id,
					userId,
				},
			});
			const accepted = await transaction.boardInvitation.findUniqueOrThrow({
				where: { id: invitation.id },
			});
			return {
				invitation: this.toInvitation(accepted, now),
				kind: "accepted" as const,
			};
		});

		switch (result.kind) {
			case "accepted":
				return result.invitation;
			case "expired":
				throw new ConflictException("This invitation has expired.");
			case "already-member":
				throw new ConflictException("This user already belongs to the board.");
			case "unavailable":
				throw new ConflictException("This invitation is no longer available.");
		}
	}

	async updateRole(
		context: BoardAccessContext,
		targetUserId: string,
		role: BoardMembershipRole,
	): Promise<MemberResponse> {
		return this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const target = await transaction.boardMember.findFirst({
				where: {
					boardId: context.boardId,
					userId: targetUserId,
					user: { deletedAt: null },
				},
				select: {
					joinedAt: true,
					role: true,
					user: {
						select: {
							avatarUrl: true,
							email: true,
							id: true,
							name: true,
						},
					},
				},
			});
			if (!target) {
				throw new NotFoundException("Board member not found.");
			}
			this.boardAccess.assertCanManageMember(
				context,
				targetUserId,
				this.boardAccess.toBoardRole(target.role),
				role,
			);
			const persistedRole = this.boardAccess.toPersistedBoardRole(role);
			if (target.role === persistedRole) {
				throw new ConflictException("Board member already has this role.");
			}
			const updated = await transaction.boardMember.update({
				where: {
					boardId_userId: {
						boardId: context.boardId,
						userId: targetUserId,
					},
				},
				data: { role: persistedRole },
				select: {
					joinedAt: true,
					role: true,
					user: {
						select: {
							avatarUrl: true,
							email: true,
							id: true,
							name: true,
						},
					},
				},
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.MEMBER_ROLE_UPDATED,
				message: "Board member role updated",
				payload: { boardId: context.boardId, role, userId: targetUserId },
			});
			return this.toMember(updated);
		});
	}

	async removeMember(
		context: BoardAccessContext,
		targetUserId: string,
	): Promise<void> {
		await this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const target = await transaction.boardMember.findUnique({
				where: {
					boardId_userId: {
						boardId: context.boardId,
						userId: targetUserId,
					},
				},
				select: { role: true },
			});
			if (!target) {
				throw new NotFoundException("Board member not found.");
			}
			this.boardAccess.assertCanManageMember(
				context,
				targetUserId,
				this.boardAccess.toBoardRole(target.role),
			);
			await transaction.boardMember.delete({
				where: {
					boardId_userId: {
						boardId: context.boardId,
						userId: targetUserId,
					},
				},
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.MEMBER_REMOVED,
				message: "Board member removed",
				payload: { boardId: context.boardId, userId: targetUserId },
			});
		});
	}

	async leave(context: BoardAccessContext): Promise<void> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_READ,
		]);
		if (context.role === BoardRole.OWNER) {
			throw new BadRequestException(
				"Transfer ownership before leaving the board.",
			);
		}
		if (context.archivedAt) {
			throw new ConflictException("Archived boards are read-only.");
		}

		await this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const deletion = await transaction.boardMember.deleteMany({
				where: { boardId: context.boardId, userId: context.userId },
			});
			if (deletion.count !== 1) {
				throw new NotFoundException("Board membership not found.");
			}
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.MEMBER_LEFT,
				message: "Board member left",
				payload: { boardId: context.boardId, userId: context.userId },
			});
		});
	}

	async transferOwnership(
		context: BoardAccessContext,
		targetUserId: string,
		version: number,
	): Promise<BoardResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_TRANSFER_OWNERSHIP,
		]);
		this.assertUuid(targetUserId, "User ID");
		if (context.userId === targetUserId) {
			throw new BadRequestException(
				"Select another board member as the new owner.",
			);
		}

		return this.prisma.$transaction(async (transaction) => {
			const board = await this.lockActiveBoard(transaction, context.boardId);
			if (board.ownerId !== context.userId || board.version !== version) {
				throw new ConflictException(
					"Board ownership or version has changed. Refresh and try again.",
				);
			}
			const target = await transaction.boardMember.findFirst({
				where: {
					boardId: context.boardId,
					userId: targetUserId,
					user: { deletedAt: null },
				},
				select: { userId: true },
			});
			if (!target) {
				throw new NotFoundException(
					"New owner must be an active existing board member.",
				);
			}

			await transaction.boardMember.delete({
				where: {
					boardId_userId: {
						boardId: context.boardId,
						userId: targetUserId,
					},
				},
			});
			const updated = await transaction.board.update({
				where: { id: context.boardId },
				data: { ownerId: targetUserId, version: { increment: 1 } },
			});
			await transaction.boardMember.create({
				data: {
					boardId: context.boardId,
					role: PersistedBoardRole.ADMIN,
					userId: context.userId,
				},
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.OWNERSHIP_TRANSFERRED,
				message: "Board ownership transferred",
				payload: {
					boardId: context.boardId,
					newOwnerId: targetUserId,
					previousOwnerId: context.userId,
				},
			});
			return { ...updated, role: BoardRole.ADMIN };
		});
	}

	private createToken(): string {
		return randomBytes(32).toString("base64url");
	}

	private hashToken(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	private invitationStatusFilter(
		status: InvitationStatus | undefined,
		now: Date,
	): Prisma.BoardInvitationWhereInput {
		switch (status) {
			case InvitationStatus.PENDING:
				return { expiresAt: { gt: now }, status };
			case InvitationStatus.EXPIRED:
				return {
					OR: [
						{ status },
						{ expiresAt: { lte: now }, status: InvitationStatus.PENDING },
					],
				};
			case InvitationStatus.ACCEPTED:
			case InvitationStatus.CANCELLED:
				return { status };
			case undefined:
				return {};
		}
	}

	private async lockActiveBoard(
		transaction: Prisma.TransactionClient,
		boardId: string,
	): Promise<LockedBoard> {
		const rows = await transaction.$queryRaw<LockedBoard[]>(Prisma.sql`
			SELECT
				"archived_at" AS "archivedAt",
				"id",
				"owner_id" AS "ownerId",
				"version"
			FROM "boards"
			WHERE "id" = CAST(${boardId} AS uuid)
			FOR UPDATE
		`);
		const board = rows[0];
		if (!board) {
			throw new NotFoundException("Board not found.");
		}
		if (board.archivedAt) {
			throw new ConflictException("Archived boards are read-only.");
		}
		return board;
	}

	private async cancelIfExistingParticipant(
		transaction: Prisma.TransactionClient,
		board: LockedBoard,
		invitationId: string,
		email: string,
		actorId: string,
	): Promise<boolean> {
		const user = await transaction.user.findUnique({
			where: { email },
			select: { deletedAt: true, id: true },
		});
		if (!user || user.deletedAt) {
			return false;
		}

		const isParticipant =
			user.id === board.ownerId ||
			Boolean(
				await transaction.boardMember.findUnique({
					where: {
						boardId_userId: { boardId: board.id, userId: user.id },
					},
					select: { userId: true },
				}),
			);
		if (!isParticipant) {
			return false;
		}

		await transaction.boardInvitation.update({
			where: { id: invitationId },
			data: { status: InvitationStatus.CANCELLED },
		});
		await recordBoardEvent(transaction, {
			actorId,
			boardId: board.id,
			eventName: BoardEventName.INVITATION_CANCELLED,
			message: "Board invitation cancelled",
			payload: { boardId: board.id, invitationId },
		});
		return true;
	}

	private toInvitation(
		invitation: {
			acceptedAt: Date | null;
			boardId: string;
			createdAt: Date;
			email: string;
			expiresAt: Date;
			id: string;
			requestedRole: PersistedBoardRole;
			status: InvitationStatus;
			updatedAt: Date;
		},
		now: Date,
	): InvitationResponse {
		return {
			acceptedAt: invitation.acceptedAt,
			boardId: invitation.boardId,
			createdAt: invitation.createdAt,
			email: invitation.email,
			expiresAt: invitation.expiresAt,
			id: invitation.id,
			role: this.boardAccess.toBoardRole(invitation.requestedRole),
			status:
				invitation.status === InvitationStatus.PENDING &&
				invitation.expiresAt <= now
					? InvitationStatus.EXPIRED
					: invitation.status,
			updatedAt: invitation.updatedAt,
		};
	}

	private toMember(member: {
		joinedAt: Date;
		role: PersistedBoardRole;
		user: {
			avatarUrl: string | null;
			email: string | null;
			id: string;
			name: string;
		};
	}): MemberResponse {
		return {
			...member.user,
			joinedAt: member.joinedAt,
			role: this.boardAccess.toBoardRole(member.role),
		};
	}

	private assertUuid(value: string, label: string): void {
		if (!isUUID(value, "4")) {
			throw new BadRequestException(`${label} must be a valid UUID.`);
		}
	}
}
