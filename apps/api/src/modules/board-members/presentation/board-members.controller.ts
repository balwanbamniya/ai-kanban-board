import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiExtraModels,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { CheckBoardPermissions } from "../../access-control/presentation/check-board-permissions.decorator.js";
import { CurrentBoardAccess } from "../../access-control/presentation/current-board-access.decorator.js";
import type { BoardResponse } from "../../boards/application/boards.service.js";
import { BoardResponseDto } from "../../boards/presentation/dto/board-response.dto.js";
import { CurrentUser } from "../../identity/presentation/current-user.decorator.js";
import type { CurrentUser as CurrentUserModel } from "../../users/application/user-sync.service.js";
import {
	BoardMembersService,
	type InvitationResponse,
	type InvitationTokenResponse,
	type MemberResponse,
} from "../application/board-members.service.js";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto.js";
import {
	InvitationResponseDto,
	InvitationTokenResponseDto,
	ListInvitationsResponseDto,
	ListMembersResponseDto,
	MemberResponseDto,
} from "./dto/board-member-response.dto.js";
import { CreateInvitationDto } from "./dto/create-invitation.dto.js";
import { ListInvitationsQueryDto } from "./dto/list-invitations-query.dto.js";
import { TransferOwnershipDto } from "./dto/transfer-ownership.dto.js";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto.js";

@ApiTags("board-members")
@ApiBearerAuth()
@ApiExtraModels(
	AcceptInvitationDto,
	CreateInvitationDto,
	ListInvitationsQueryDto,
	TransferOwnershipDto,
	UpdateMemberRoleDto,
)
@Controller()
export class BoardMembersController {
	constructor(
		@Inject(BoardMembersService)
		private readonly members: BoardMembersService,
	) {}

	@Post("invitations/accept")
	@HttpCode(HttpStatus.OK)
	@ApiConflictResponse({ description: "The invitation is no longer usable." })
	@ApiOkResponse({ type: InvitationResponseDto })
	accept(
		@CurrentUser() user: CurrentUserModel,
		@Body() dto: AcceptInvitationDto,
	): Promise<InvitationResponse> {
		return this.members.acceptInvitation(user.id, dto.token);
	}

	@Get("boards/:boardId/members")
	@ApiOkResponse({ type: ListMembersResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_READ)
	list(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
	): Promise<{ members: MemberResponse[] }> {
		return this.members.list(context);
	}

	@Get("boards/:boardId/invitations")
	@ApiOkResponse({ type: ListInvitationsResponseDto })
	@CheckBoardPermissions(BoardPermission.INVITATION_READ)
	listInvitations(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Query() query: ListInvitationsQueryDto,
	): Promise<ListInvitationsResponseDto> {
		return this.members.listInvitations(context, query);
	}

	@Post("boards/:boardId/invitations")
	@ApiConflictResponse({ description: "A pending invitation already exists." })
	@ApiCreatedResponse({ type: InvitationTokenResponseDto })
	@CheckBoardPermissions(BoardPermission.MEMBER_INVITE)
	createInvitation(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: CreateInvitationDto,
	): Promise<InvitationTokenResponse> {
		return this.members.createInvitation(context, dto);
	}

	@Post("boards/:boardId/invitations/:invitationId/resend")
	@HttpCode(HttpStatus.OK)
	@ApiConflictResponse({ description: "The invitation is no longer usable." })
	@ApiOkResponse({ type: InvitationTokenResponseDto })
	@CheckBoardPermissions(BoardPermission.MEMBER_INVITE)
	resendInvitation(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("invitationId", new ParseUUIDPipe({ version: "4" }))
		invitationId: string,
	): Promise<InvitationTokenResponse> {
		return this.members.resendInvitation(context, invitationId);
	}

	@Delete("boards/:boardId/invitations/:invitationId")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse({
		description: "The pending invitation was cancelled.",
	})
	@CheckBoardPermissions(BoardPermission.MEMBER_INVITE)
	async cancelInvitation(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("invitationId", new ParseUUIDPipe({ version: "4" }))
		invitationId: string,
	): Promise<void> {
		await this.members.cancelInvitation(context, invitationId);
	}

	@Patch("boards/:boardId/members/:userId")
	@ApiOkResponse({ type: MemberResponseDto })
	@CheckBoardPermissions(BoardPermission.MEMBER_ROLE_UPDATE)
	updateRole(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
		@Body() dto: UpdateMemberRoleDto,
	): Promise<MemberResponse> {
		return this.members.updateRole(context, userId, dto.role);
	}

	@Delete("boards/:boardId/members/me")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse({ description: "The current user left the board." })
	@CheckBoardPermissions(BoardPermission.BOARD_READ)
	async leave(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
	): Promise<void> {
		await this.members.leave(context);
	}

	@Delete("boards/:boardId/members/:userId")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse({ description: "The board member was removed." })
	@CheckBoardPermissions(BoardPermission.MEMBER_REMOVE)
	async remove(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
	): Promise<void> {
		await this.members.removeMember(context, userId);
	}

	@Patch("boards/:boardId/owner")
	@ApiConflictResponse({ description: "The board version or owner changed." })
	@ApiOkResponse({ type: BoardResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_TRANSFER_OWNERSHIP)
	transferOwnership(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: TransferOwnershipDto,
	): Promise<BoardResponse> {
		return this.members.transferOwnership(context, dto.userId, dto.version);
	}
}
