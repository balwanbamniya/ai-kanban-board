import {
	Body,
	Controller,
	Delete,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
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
import {
	type ColumnResponse,
	ColumnsService,
} from "../application/columns.service.js";
import { ColumnResponseDto } from "./dto/column-response.dto.js";
import { CreateColumnDto } from "./dto/create-column.dto.js";
import { DeleteColumnDto } from "./dto/delete-column.dto.js";
import { ReorderColumnsDto } from "./dto/reorder-columns.dto.js";
import { UpdateColumnDto } from "./dto/update-column.dto.js";

@ApiTags("columns")
@ApiBearerAuth()
@ApiExtraModels(
	CreateColumnDto,
	DeleteColumnDto,
	ReorderColumnsDto,
	UpdateColumnDto,
)
@Controller("boards/:boardId/columns")
export class ColumnsController {
	constructor(
		@Inject(ColumnsService) private readonly columns: ColumnsService,
	) {}

	@Post()
	@ApiCreatedResponse({ type: ColumnResponseDto })
	@CheckBoardPermissions(BoardPermission.COLUMN_CREATE)
	create(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: CreateColumnDto,
	): Promise<ColumnResponse> {
		return this.columns.create(context, dto);
	}

	@Patch("reorder")
	@ApiConflictResponse({
		description: "One or more column versions are stale.",
	})
	@ApiOkResponse({ type: [ColumnResponseDto] })
	@CheckBoardPermissions(BoardPermission.COLUMN_UPDATE)
	reorder(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: ReorderColumnsDto,
	): Promise<ColumnResponse[]> {
		return this.columns.reorder(context, dto);
	}

	@Patch(":columnId")
	@ApiConflictResponse({ description: "The column version is stale." })
	@ApiOkResponse({ type: ColumnResponseDto })
	@CheckBoardPermissions(BoardPermission.COLUMN_UPDATE)
	update(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("columnId", new ParseUUIDPipe({ version: "4" })) columnId: string,
		@Body() dto: UpdateColumnDto,
	): Promise<ColumnResponse> {
		return this.columns.update(context, columnId, dto);
	}

	@Delete(":columnId")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse()
	@ApiConflictResponse({ description: "The column version is stale." })
	@CheckBoardPermissions(BoardPermission.COLUMN_DELETE)
	async delete(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("columnId", new ParseUUIDPipe({ version: "4" })) columnId: string,
		@Body() dto: DeleteColumnDto,
	): Promise<void> {
		await this.columns.delete(context, columnId, dto);
	}
}
