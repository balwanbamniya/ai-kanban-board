import {
	Body,
	Controller,
	Get,
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
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { CheckBoardPermissions } from "../../access-control/presentation/check-board-permissions.decorator.js";
import { CurrentBoardAccess } from "../../access-control/presentation/current-board-access.decorator.js";
import { CurrentUser } from "../../identity/presentation/current-user.decorator.js";
import type { CurrentUser as CurrentUserModel } from "../../users/application/user-sync.service.js";
import {
	type BoardDetailResponse,
	type BoardResponse,
	BoardsService,
} from "../application/boards.service.js";
import { ArchiveBoardDto } from "./dto/archive-board.dto.js";
import {
	BoardDetailResponseDto,
	BoardResponseDto,
	ListBoardsResponseDto,
} from "./dto/board-response.dto.js";
import { CreateBoardDto } from "./dto/create-board.dto.js";
import { ListBoardsQueryDto } from "./dto/list-boards-query.dto.js";
import { UpdateBoardDto } from "./dto/update-board.dto.js";

@ApiTags("boards")
@ApiBearerAuth()
@ApiExtraModels(
	ArchiveBoardDto,
	CreateBoardDto,
	ListBoardsQueryDto,
	UpdateBoardDto,
)
@Controller("boards")
export class BoardsController {
	constructor(@Inject(BoardsService) private readonly boards: BoardsService) {}

	@Get()
	@ApiOkResponse({ type: ListBoardsResponseDto })
	list(
		@CurrentUser() user: CurrentUserModel,
		@Query() query: ListBoardsQueryDto,
	): Promise<ListBoardsResponseDto> {
		return this.boards.list(user.id, query);
	}

	@Post()
	@ApiCreatedResponse({ type: BoardResponseDto })
	create(
		@CurrentUser() user: CurrentUserModel,
		@Body() dto: CreateBoardDto,
	): Promise<BoardResponse> {
		return this.boards.create(user.id, dto);
	}

	@Get(":boardId")
	@ApiOkResponse({ type: BoardDetailResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_READ)
	detail(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
	): Promise<BoardDetailResponse> {
		return this.boards.detail(context);
	}

	@Patch(":boardId")
	@ApiConflictResponse({
		description: "The board version is stale or archived.",
	})
	@ApiOkResponse({ type: BoardResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_UPDATE)
	update(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: UpdateBoardDto,
	): Promise<BoardResponse> {
		return this.boards.update(context, dto);
	}

	@Patch(":boardId/archive")
	@ApiConflictResponse({ description: "The board version or state changed." })
	@ApiOkResponse({ type: BoardResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_ARCHIVE)
	archive(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: ArchiveBoardDto,
	): Promise<BoardResponse> {
		return this.boards.archive(context, dto.version);
	}

	@Patch(":boardId/restore")
	@ApiConflictResponse({ description: "The board version or state changed." })
	@ApiOkResponse({ type: BoardResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_RESTORE)
	restore(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: ArchiveBoardDto,
	): Promise<BoardResponse> {
		return this.boards.restore(context, dto.version);
	}
}
